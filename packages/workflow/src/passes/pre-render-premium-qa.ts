/**
 * QA pré-rendu premium — bloque AVANT FAL si le plan est narrativement nul.
 *
 * Objectif : ne plus payer FAL pour des images inutilisables.
 */

import type { StoryboardPlan } from "@manga-ai-studio/ai/contracts";
import { getPanelPromptFingerprint } from "./panel-prompt-fingerprint";
import { repairStoryboardPlanRepeatedPromptFingerprints } from "./repair-repeated-prompt-fingerprints";

export interface PreRenderPremiumQaInput {
  storyboardPlan: StoryboardPlan;
  chapterSummary: string | null;
  chapterUserIntent: string | null;
  chapterLocationName?: string | null;
  /** Noms des personnages principaux (héros, focus characters) pour détecter s'ils sont marqués NPC par erreur. */
  mainCharacterNames: string[];
}

export interface PreRenderPremiumQaResult {
  ok: boolean;
  issues: string[];
  stats: {
    totalPanels: number;
    genericActionCount: number;
    npcMainCharacterCount: number;
    closeupCount: number;
    closeupRatio: number;
    hasDialogueOrSfx: boolean;
    looksLikeActionChapter: boolean;
    repeatedPromptCount: number;
    missingLocation: boolean;
    strongWithoutRefs: number;
  };
}

const GENERIC_ACTION_PATTERNS = [
  "A visible character advances the scene",
  "character advances the scene",
  "visible action or emotion",
  "Story action panel:",
  "advances the scene through action",
];

const CLOSEUP_RENDER_MODES = [
  "hero_closeup",
  "npc_closeup",
  "reaction_closeup",
  "enemy_closeup",
];

const ACTION_KEYWORDS_REGEX = /combat|fight|attaque|attaque magique|magicien|sorcier|battle|sort|explosion|conflit|menace|threat/i;

function extractAllPanels(plan: StoryboardPlan): Array<Record<string, unknown>> {
  return plan.pages.flatMap((page) => page.panels as unknown as Array<Record<string, unknown>>);
}

function isGenericActionLine(text: string): boolean {
  const lower = text.toLowerCase();
  return GENERIC_ACTION_PATTERNS.some((pat) => lower.includes(pat.toLowerCase()));
}

function isMainCharacterMarkedAsNpc(panel: Record<string, unknown>, mainCharacterNames: string[]): boolean {
  const actionLine = String(panel.actionLine ?? "");
  const renderMode = String(panel.renderMode ?? "");
  const characters = (panel.characters ?? []) as string[];

  for (const name of mainCharacterNames) {
    if (actionLine.includes(`${name} (npc)`) || actionLine.toLowerCase().includes(`${name.toLowerCase()} (npc)`)) {
      return true;
    }
    if (characters.some((c) => c.toLowerCase() === name.toLowerCase()) && renderMode === "npc_closeup") {
      return true;
    }
  }
  return false;
}

function isCloseup(panel: Record<string, unknown>): boolean {
  const mode = String(panel.renderMode ?? "");
  return CLOSEUP_RENDER_MODES.includes(mode);
}

function panelHasDialogueOrSfx(panel: Record<string, unknown>): boolean {
  const dialogue = panel.dialogue as unknown[] | undefined;
  const sfx = panel.sfx as unknown[] | undefined;
  const narration = panel.narration as string | undefined;

  return (
    (Array.isArray(dialogue) && dialogue.length > 0) ||
    (Array.isArray(sfx) && sfx.length > 0) ||
    Boolean(narration)
  );
}

function hasStrongWithoutRefs(panel: Record<string, unknown>): boolean {
  const policy = String(panel.referencePolicy ?? "");
  const refs = panel.imageReferences as Record<string, unknown[]> | undefined;

  if (policy !== "STRONG") return false;

  if (!refs) return true;

  const charRefs = refs.characterRefs ?? [];
  const envRefs = refs.environmentRefs ?? [];
  const panelRefs = refs.panelRefs ?? [];
  const styleRefs = refs.styleRefs ?? [];

  return charRefs.length === 0 && envRefs.length === 0 && panelRefs.length === 0 && styleRefs.length === 0;
}

export function runPreRenderPremiumQa(input: PreRenderPremiumQaInput): PreRenderPremiumQaResult {
  const panels = extractAllPanels(input.storyboardPlan);
  const issues: string[] = [];
  const totalPanels = panels.length;

  const genericActions = panels.filter((p) => isGenericActionLine(String(p.actionLine ?? "")));
  const genericActionCount = genericActions.length;

  if (genericActionCount > 0) {
    issues.push(`generic_action_lines=${genericActionCount}`);
  }

  const npcMainCharacterPanels = panels.filter((p) => isMainCharacterMarkedAsNpc(p, input.mainCharacterNames));
  const npcMainCharacterCount = npcMainCharacterPanels.length;

  if (npcMainCharacterCount > 0) {
    issues.push(`main_character_marked_as_npc=${npcMainCharacterCount}`);
  }

  const closeups = panels.filter(isCloseup);
  const closeupCount = closeups.length;
  const maxCloseups = Math.ceil(totalPanels * 0.28);
  const closeupRatio = totalPanels > 0 ? closeupCount / totalPanels : 0;

  if (closeupCount > maxCloseups) {
    issues.push(`too_many_closeups=${closeupCount}/${totalPanels} (max=${maxCloseups})`);
  }

  const hasDialogueOrSfx = panels.some(panelHasDialogueOrSfx);
  const storyText = `${input.chapterSummary ?? ""} ${input.chapterUserIntent ?? ""}`.toLowerCase();
  const looksLikeActionChapter = ACTION_KEYWORDS_REGEX.test(storyText);

  if (looksLikeActionChapter && !hasDialogueOrSfx) {
    issues.push("action_chapter_without_dialogue_or_sfx");
  }

  const promptFingerprints = new Map<string, number>();
  for (const panel of panels) {
    const fp = getPanelPromptFingerprint(panel);
    promptFingerprints.set(fp, (promptFingerprints.get(fp) ?? 0) + 1);
  }
  const repeatedPrompts = [...promptFingerprints.entries()].filter(([, count]) => count > 2);
  const repeatedPromptCount = repeatedPrompts.reduce((acc, [, count]) => acc + count - 2, 0);

  if (repeatedPromptCount > 0) {
    issues.push(`repeated_prompts=${repeatedPromptCount} (fingerprints repeated >2 times)`);
  }

  const expectedLocation = input.chapterLocationName?.toLowerCase().trim();
  let missingLocation = false;
  if (expectedLocation && expectedLocation.length > 2) {
    const locationMentioned = panels.some((p) => {
      const loc = String(p.locationName ?? p.scenePurpose ?? p.actionLine ?? "").toLowerCase();
      return loc.includes(expectedLocation);
    });
    if (!locationMentioned) {
      missingLocation = true;
      issues.push(`expected_location_absent=${expectedLocation}`);
    }
  }

  const strongWithoutRefsPanels = panels.filter(hasStrongWithoutRefs);
  const strongWithoutRefs = strongWithoutRefsPanels.length;
  if (strongWithoutRefs > 0) {
    issues.push(`strong_refs_empty=${strongWithoutRefs}`);
  }

  return {
    ok: issues.length === 0,
    issues,
    stats: {
      totalPanels,
      genericActionCount,
      npcMainCharacterCount,
      closeupCount,
      closeupRatio,
      hasDialogueOrSfx,
      looksLikeActionChapter,
      repeatedPromptCount,
      missingLocation,
      strongWithoutRefs,
    },
  };
}

export class PreRenderPremiumQaError extends Error {
  constructor(public readonly issues: string[], public readonly stats: PreRenderPremiumQaResult["stats"]) {
    super(`premium_v3_pre_render_qa_failed: ${issues.join(" | ")}`);
    this.name = "PreRenderPremiumQaError";
  }
}

export function runPreRenderPremiumQaOrThrow(input: PreRenderPremiumQaInput): PreRenderPremiumQaResult {
  let result = runPreRenderPremiumQa(input);

  if (!result.ok && result.stats.repeatedPromptCount > 0) {
    console.warn("[pipeline:v3:pre-render-qa] repeated_prompts detected; attempting fingerprint repair", {
      repeatedPromptCount: result.stats.repeatedPromptCount,
      issues: result.issues,
    });
    repairStoryboardPlanRepeatedPromptFingerprints(input.storyboardPlan);
    result = runPreRenderPremiumQa(input);
    console.log("[pipeline:v3:pre-render-qa] after repair", {
      repeatedPromptCount: result.stats.repeatedPromptCount,
      ok: result.ok,
      issues: result.issues,
    });
  }

  const premiumOnly = process.env.PIPELINE_V3_PREMIUM_ONLY === "true";

  if (!result.ok) {
    const otherIssues = result.issues.filter((i) => !i.startsWith("repeated_prompts="));
    const repeatedOnly = otherIssues.length === 0 && result.stats.repeatedPromptCount <= 5;
    if (repeatedOnly && !premiumOnly) {
      console.warn("[pipeline:v3:pre-render-qa] tolerating repeated_prompts<=5 after repair (warning only)", {
        repeatedPromptCount: result.stats.repeatedPromptCount,
      });
      console.info(
        `[pipeline:v3:pre-render-premium-qa] ok=true (tolerated_repeated) panels=${result.stats.totalPanels} closeups=${result.stats.closeupCount}/${result.stats.totalPanels} genericActions=${result.stats.genericActionCount} repeatedPrompts=${result.stats.repeatedPromptCount}`,
      );
      return {
        ...result,
        ok: true,
        issues: [...result.issues, "tolerated_repeated_prompts_after_repair"],
      };
    }
    throw new PreRenderPremiumQaError(result.issues, result.stats);
  }

  console.info(
    `[pipeline:v3:pre-render-premium-qa] ok=true panels=${result.stats.totalPanels} closeups=${result.stats.closeupCount}/${result.stats.totalPanels} genericActions=${result.stats.genericActionCount} repeatedPrompts=${result.stats.repeatedPromptCount}`,
  );

  return result;
}
