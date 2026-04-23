/**
 * storyboard-pass — étape 2 de la pipeline v3.
 *
 * Entrée : StoryArc + cast + locations + target panel count + style bible.
 * Sortie : StoryboardPlan (persisté dans `chapter.outline.storyboardPlanV2`).
 *
 * Le StoryboardPlan décide TOUT le découpage (pages, layouts, panels,
 * renderMode, shotType, subjectFocus, cutawayType). Le render-pass ne doit
 * plus décider la dramaturgie.
 */

import {
  runMangaEditorAgent,
  runMangaEditorAgentLlm,
  validateStoryboardPlan,
  type StoryArc,
  type StoryboardPlan,
  type StoryboardLayoutTemplate,
} from "@manga-ai-studio/ai";
import type { StoryboardPage, StoryboardPanel } from "@manga-ai-studio/ai/contracts";
import { classifyPremiumPanelCount, PREMIUM_PANEL_RANGE } from "@manga-ai-studio/core";
import { saveStoryboardPlan } from "../persistence/storyboard-persistence";
import {
  isPipelineV3MangaEditorLlmEnabled,
  isPipelineV3PremiumOnlyEnabled,
} from "../pipeline-feature-flags";

function pickLayoutTemplateForPage(args: {
  projectFormat: "manga" | "webtoon";
  panelCount: number;
}): StoryboardLayoutTemplate {
  const n = args.panelCount;
  if (args.projectFormat === "webtoon") {
    if (n <= 1) return "splash";
    if (n === 2) return "vertical_strip";
    if (n === 3) return "vertical_strip";
    if (n === 4) return "vertical_hero_4";
    return "vertical_strip";
  }
  // manga
  if (n <= 1) return "splash";
  if (n === 2) return "cinematic_bar";
  if (n === 3) return "action_strip";
  if (n === 4) return "grid_2x2";
  if (n === 5) return "staggered_5";
  return "grid_2x3";
}

function computeEditorialDiagnostics(pages: StoryboardPage[]): StoryboardPlan["editorialDiagnostics"] {
  const allPanels = pages.flatMap((p) => p.panels);
  const total = allPanels.length || 1;
  const heroFocus = allPanels.filter((p) => p.subjectFocus === "hero").length;
  const environment = allPanels.filter((p) => p.subjectFocus === "environment").length;
  const insert = allPanels.filter((p) => p.renderMode === "insert_object").length;
  const reaction = allPanels.filter((p) => p.renderMode === "reaction_closeup").length;
  const distinctModes = new Set(allPanels.map((p) => p.renderMode)).size;
  const varietyScore = Math.min(1, distinctModes / 10);
  return {
    varietyScore,
    heroFocusRatio: heroFocus / total,
    environmentRatio: environment / total,
    insertRatio: insert / total,
    reactionRatio: reaction / total,
    warnings: [],
    blockers: [],
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- conservé pour audit/rollback du hard switch premium
function densifyStoryboardPlanToPremiumRange(input: {
  storyArc: StoryArc;
  storyboardPlan: StoryboardPlan;
  projectFormat: "manga" | "webtoon";
  desiredPanels: number;
}): { plan: StoryboardPlan; added: number; removed: number } {
  const seedPanels: StoryboardPanel[] = (input.storyboardPlan.pages ?? []).flatMap((p) =>
    Array.isArray(p.panels) ? p.panels : [],
  );
  if (seedPanels.length === 0) {
    return { plan: input.storyboardPlan, added: 0, removed: 0 };
  }

  const beatsById = new Map(input.storyArc.beats.map((b) => [b.beatId, b]));

  const CLOSEUP_SHOT_TYPES = new Set<StoryboardPanel["shotType"]>(["closeup", "extreme_closeup"]);
  const CUTAWAY_RENDER_MODES = new Set<StoryboardPanel["renderMode"]>([
    "establishing_environment",
    "silent_transition",
    "insert_object",
    "surveillance_reveal",
    "threat_silhouette",
  ]);

  const signatureOf = (p: Pick<StoryboardPanel, "renderMode" | "shotType" | "cameraAngle" | "subjectFocus">) =>
    `${p.renderMode}|${p.shotType}|${p.cameraAngle}|${p.subjectFocus}`;

  const trailingSignatureRun = (panelsInOrder: StoryboardPanel[]) => {
    if (panelsInOrder.length === 0) return { sig: "", run: 0 };
    const last = panelsInOrder[panelsInOrder.length - 1]!;
    const lastSig = signatureOf(last);
    let run = 1;
    for (let i = panelsInOrder.length - 2; i >= 0; i -= 1) {
      if (signatureOf(panelsInOrder[i]!) === lastSig) run += 1;
      else break;
    }
    return { sig: lastSig, run };
  };

  const computeCounts = (panelsInOrder: StoryboardPanel[]) => {
    const total = panelsInOrder.length || 1;
    const hero = panelsInOrder.filter((p) => p.subjectFocus === "hero").length;
    const closeup = panelsInOrder.filter((p) => CLOSEUP_SHOT_TYPES.has(p.shotType)).length;
    const cutaway = panelsInOrder.filter((p) => CUTAWAY_RENDER_MODES.has(p.renderMode)).length;
    const nonHero = panelsInOrder.filter((p) => p.subjectFocus !== "hero").length;
    return { total, hero, closeup, cutaway, nonHero };
  };

  type Variant = {
    renderMode: StoryboardPanel["renderMode"];
    shotType: StoryboardPanel["shotType"];
    subjectFocus: StoryboardPanel["subjectFocus"];
    cutawayType: StoryboardPanel["cutawayType"];
    cameraAngle: StoryboardPanel["cameraAngle"];
    characters: "none" | "base2";
    actionLine: string;
    emotionLine?: "keep" | "empty";
  };

  const pickCameraAngle = (renderMode: Variant["renderMode"], k: number): StoryboardPanel["cameraAngle"] => {
    const cycle: StoryboardPanel["cameraAngle"][] = ["eye_level", "low", "high", "dutch", "birds_eye", "worm"];
    const base = cycle[k % cycle.length] ?? "eye_level";
    if (renderMode === "threat_silhouette") return k % 2 === 0 ? "low" : "dutch";
    if (renderMode === "surveillance_reveal") return k % 2 === 0 ? "high" : "birds_eye";
    if (renderMode === "establishing_environment") return k % 3 === 0 ? "birds_eye" : "eye_level";
    return base;
  };

  const makeVariantPool = (beatType: string): Omit<Variant, "cameraAngle">[] => {
    if (beatType === "combat") {
      return [
        {
          renderMode: "combat_exchange",
          shotType: "medium",
          subjectFocus: "group",
          cutawayType: "none",
          characters: "base2",
          actionLine: "combat exchange, clear readable action, spatial continuity",
        },
        {
          renderMode: "combat_aftermath",
          shotType: "medium",
          subjectFocus: "environment",
          cutawayType: "aftermath",
          characters: "none",
          actionLine: "aftermath beat, debris / changed state, breathe after impact",
        },
        {
          renderMode: "establishing_environment",
          shotType: "wide",
          subjectFocus: "environment",
          cutawayType: "environment",
          characters: "none",
          actionLine: "re-anchor the combat space, landmarks for readability",
        },
        {
          renderMode: "reaction_closeup",
          shotType: "closeup",
          subjectFocus: "reaction",
          cutawayType: "reaction",
          characters: "base2",
          actionLine: "reaction closeup, emotional beat lands",
          emotionLine: "keep",
        },
      ];
    }
    if (beatType === "dialogue_tension") {
      return [
        {
          renderMode: "dialogue_two_shot",
          shotType: "medium",
          subjectFocus: "group",
          cutawayType: "none",
          characters: "base2",
          actionLine: "dialogue two-shot, readable staging, tension in body language",
        },
        {
          renderMode: "dialogue_over_shoulder",
          shotType: "over_shoulder",
          subjectFocus: "group",
          cutawayType: "none",
          characters: "base2",
          actionLine: "over-shoulder dialogue, eye-lines consistent",
        },
        {
          renderMode: "silent_transition",
          shotType: "wide",
          subjectFocus: "environment",
          cutawayType: "none",
          characters: "none",
          actionLine: "silent breathing beat, atmospheric micro-shift",
        },
        {
          renderMode: "reaction_closeup",
          shotType: "closeup",
          subjectFocus: "reaction",
          cutawayType: "reaction",
          characters: "base2",
          actionLine: "reaction closeup, emotional beat lands",
          emotionLine: "keep",
        },
      ];
    }
    return [
      {
        renderMode: "establishing_environment",
        shotType: "wide",
        subjectFocus: "environment",
        cutawayType: "environment",
        characters: "none",
        actionLine: "environment cutaway, re-anchor location continuity",
      },
      {
        renderMode: "silent_transition",
        shotType: "wide",
        subjectFocus: "environment",
        cutawayType: "none",
        characters: "none",
        actionLine: "silent breathing beat, micro-shift in atmosphere",
      },
      {
        renderMode: "group_tension",
        shotType: "medium",
        subjectFocus: "group",
        cutawayType: "none",
        characters: "base2",
        actionLine: "group tension beat, body language, spacing, stakes",
      },
      {
        renderMode: "surveillance_reveal",
        shotType: "medium",
        subjectFocus: "threat",
        cutawayType: "surveillance",
        characters: "none",
        actionLine: "surveillance insert, reveal information indirectly",
      },
      {
        renderMode: "threat_silhouette",
        shotType: "wide",
        subjectFocus: "threat",
        cutawayType: "none",
        characters: "none",
        actionLine: "threat silhouette beat, ominous shape, atmosphere",
      },
      {
        renderMode: "insert_object",
        shotType: "closeup",
        subjectFocus: "prop",
        cutawayType: "prop_insert",
        characters: "none",
        actionLine: "prop insert, highlight a key object detail",
      },
      {
        renderMode: "reaction_closeup",
        shotType: "closeup",
        subjectFocus: "reaction",
        cutawayType: "reaction",
        characters: "base2",
        actionLine: "reaction closeup, emotional beat lands",
        emotionLine: "keep",
      },
    ];
  };

  const DIALOGUE_RENDER_MODES = new Set<StoryboardPanel["renderMode"]>([
    "dialogue_two_shot",
    "dialogue_over_shoulder",
    "aftermath_dialogue",
  ]);

  const makeGrammarPanel = (base: StoryboardPanel, k: number, currentPanels: StoryboardPanel[]): StoryboardPanel => {
    const beat = beatsById.get(base.sourceBeatId);
    const beatType = beat?.type ?? "setup";
    const pool = makeVariantPool(beatType);
    const counts = computeCounts(currentPanels);
    const heroRatio = counts.hero / counts.total;
    const closeupRatio = counts.closeup / counts.total;
    const cutawayRatio = counts.cutaway / counts.total;
    const nonHeroRatio = counts.nonHero / counts.total;

    const avoidCloseup = closeupRatio > 0.5;
    const needCutaway = cutawayRatio < 0.05;
    const needNonHero = nonHeroRatio < 0.3 || heroRatio > 0.5;

    const priority: Omit<Variant, "cameraAngle">[] = [];
    if (needCutaway || needNonHero) {
      // Wide/medium non-hero + cutaways first
      priority.push(...pool.filter((v) => v.subjectFocus !== "hero" && !CLOSEUP_SHOT_TYPES.has(v.shotType)));
      priority.push(...pool.filter((v) => CUTAWAY_RENDER_MODES.has(v.renderMode)));
    }
    if (!avoidCloseup) {
      priority.push(...pool.filter((v) => CLOSEUP_SHOT_TYPES.has(v.shotType)));
    }
    // Fallback: anything non-hero
    priority.push(...pool.filter((v) => v.subjectFocus !== "hero"));

    const { sig: lastSig, run: lastRun } = trailingSignatureRun(currentPanels);
    const baseCharacters =
      Array.isArray(base.characters) && base.characters.length > 0
        ? base.characters.slice(0, 2)
        : Array.isArray(beat?.charactersPresent)
          ? beat.charactersPresent.slice(0, 2)
          : [];
    const hasDialogueSource = Array.isArray(base.dialogue) && base.dialogue.length > 0;

    let chosen: Variant | null = null;
    for (let i = 0; i < priority.length; i += 1) {
      const cand = priority[(k + i) % priority.length]!;
      if (avoidCloseup && CLOSEUP_SHOT_TYPES.has(cand.shotType)) continue;
      if (cand.characters === "base2" && baseCharacters.length === 0) continue;
      if (DIALOGUE_RENDER_MODES.has(cand.renderMode) && !hasDialogueSource) continue;
      const cameraAngle = pickCameraAngle(cand.renderMode, k + i);
      const sig = signatureOf({
        renderMode: cand.renderMode,
        shotType: cand.shotType,
        cameraAngle,
        subjectFocus: cand.subjectFocus,
      });
      if (sig === lastSig && lastRun >= 2) continue; // anti répétition (maxRun >= 3 interdit)
      chosen = { ...cand, cameraAngle };
      break;
    }
    if (!chosen) {
      const fallback =
        pool.find(
          (v) =>
            (v.characters === "none" || baseCharacters.length > 0) &&
            (!DIALOGUE_RENDER_MODES.has(v.renderMode) || hasDialogueSource),
        ) ??
        pool.find((v) => v.characters === "none") ??
        pool[0]!;
      chosen = { ...fallback, cameraAngle: pickCameraAngle(fallback.renderMode, k) };
    }

    const characters: string[] =
      chosen.characters === "none"
        ? []
        : baseCharacters;

    return {
      ...base,
      panelId: `${base.panelId}__g${k + 1}`,
      renderMode: chosen.renderMode,
      subjectFocus: chosen.subjectFocus,
      cutawayType: chosen.cutawayType,
      shotType: chosen.shotType,
      cameraAngle: chosen.cameraAngle,
      characters,
      locationId: base.locationId ?? beat?.locationId ?? null,
      locationName:
        !base.locationName || base.locationName.trim().toLowerCase() === "unknown"
          ? beat?.locationName ?? base.locationName
          : base.locationName,
      actionLine: chosen.actionLine,
      emotionLine: chosen.emotionLine === "keep" ? base.emotionLine || beat?.emotionalTurn || "" : "",
      dialogue: DIALOGUE_RENDER_MODES.has(chosen.renderMode) ? base.dialogue.slice(0, 2) : [],
      narration: null,
      sfx: [],
      mustShow: [],
      mustNotShow: [],
      continuityNotes: [],
    };
  };

  let panels = [...seedPanels];
  const startCount = panels.length;
  const desired = Math.max(PREMIUM_PANEL_RANGE.min, Math.min(input.desiredPanels, PREMIUM_PANEL_RANGE.max));

  if (panels.length < desired) {
    let k = 0;
    while (panels.length < desired) {
      const base = seedPanels[k % seedPanels.length]!;
      panels.push(makeGrammarPanel(base, k, panels));
      k += 1;
    }
  } else if (panels.length > desired) {
    const removable = new Set<StoryboardPanel["renderMode"]>([
      "silent_transition",
      "establishing_environment",
      "insert_object",
    ]);
    const kept: StoryboardPanel[] = [];
    for (const p of panels) {
      kept.push(p);
    }
    // remove from end, preferentially low-impact modes
    while (kept.length > desired) {
      const idx = [...kept]
        .map((p, i) => ({ p, i }))
        .reverse()
        .find((x) => removable.has(x.p.renderMode))?.i;
      kept.splice(idx ?? kept.length - 1, 1);
    }
    panels = kept;
  }

  const PANELS_PER_PAGE = input.projectFormat === "webtoon" ? 3 : 5;
  const pages: StoryboardPage[] = [];
  let globalPanelIndex = 0;
  let pageNumber = 0;
  for (let i = 0; i < panels.length; i += PANELS_PER_PAGE) {
    pageNumber += 1;
    const chunk = panels.slice(i, i + PANELS_PER_PAGE);
    const reindexed = chunk.map((p, idx) => ({
      ...p,
      pageNumber,
      panelNumberInPage: idx + 1,
      globalPanelIndex: globalPanelIndex + idx,
    }));
    globalPanelIndex += reindexed.length;
    pages.push({
      pageNumber,
      layoutTemplate: pickLayoutTemplateForPage({
        projectFormat: input.projectFormat,
        panelCount: reindexed.length,
      }),
      dramaticRole:
        pageNumber <= 2 ? "setup" : pageNumber >= Math.max(3, Math.ceil(panels.length / PANELS_PER_PAGE) - 1) ? "climax" : "development",
      beatIds: Array.from(new Set(reindexed.map((p) => p.sourceBeatId))),
      panels: reindexed,
    });
  }

  const plan: StoryboardPlan = {
    ...input.storyboardPlan,
    totalTargetPanels: panels.length,
    pages,
    editorialDiagnostics: computeEditorialDiagnostics(pages),
  };
  const endCount = panels.length;
  return {
    plan,
    added: Math.max(0, endCount - startCount),
    removed: Math.max(0, startCount - endCount),
  };
}

export interface RunStoryboardPassInput {
  storyArc: StoryArc;
  targetPanelCount?: number;
  heroCharacterIds?: string[];
  /**
   * COMMIT P9 — format éditorial du projet. Détermine la grammaire du
   * storyboard (pagination manga vs flow webtoon). OBLIGATOIRE :
   * le pipeline DOIT transmettre `project.format` au storyboard. Plus
   * de `?? "manga"` silencieux qui ignorait le choix utilisateur.
   */
  projectFormat: "manga" | "webtoon";
  /**
   * Override du flag `PIPELINE_V3_MANGA_EDITOR_LLM`. Utile pour tests.
   * Quand `true`, l'agent LLM est tenté (fallback stub si OpenAI absent).
   * Quand `false`, le stub déterministe est utilisé directement.
   */
  useLlmEditor?: boolean;
  /**
   * COMMIT D — quand `true`, les budgets éditoriaux (hero/closeup/cutaway/
   * NPC/combat/anti-répétition) deviennent bloquants au lieu de warning.
   * Par défaut, déduit de `PIPELINE_V3_PREMIUM_ONLY` (le premium est
   * strict, le shadow mode reste permissif).
   */
  strict?: boolean;
}

export interface RunStoryboardPassResult {
  storyboardPlan: StoryboardPlan;
  warnings: string[];
  blockers: string[];
}

export class PremiumStoryboardStubForbiddenError extends Error {
  constructor() {
    super(
      "premium_storyboard_stub_forbidden: PIPELINE_V3_PREMIUM_ONLY=true impose PIPELINE_V3_MANGA_EDITOR_LLM=true. " +
        "Le premium NE TOLÈRE PLUS le stub déterministe manga-editor-agent — il produit des plans mécaniques " +
        "(même cadrage en boucle, combat-poster, cutaways manquants). Active le LLM ou désactive PREMIUM_ONLY.",
    );
    this.name = "PremiumStoryboardStubForbiddenError";
  }
}

export async function runStoryboardPass(
  input: RunStoryboardPassInput,
): Promise<RunStoryboardPassResult> {
  const useLlm = input.useLlmEditor ?? isPipelineV3MangaEditorLlmEnabled();
  const premiumOnly = isPipelineV3PremiumOnlyEnabled();

  // Premium-only : l'IA2 doit être un vrai LLM. Si la clé OpenAI manque,
  // `runMangaEditorAgentLlm` ferait un fallback vers le stub — interdit.
  if (premiumOnly && useLlm && !process.env.OPENAI_API_KEY) {
    throw new Error(
      "premium_storyboard_llm_unavailable: PIPELINE_V3_PREMIUM_ONLY=true mais OPENAI_API_KEY est absente",
    );
  }

  // COMMIT P2.B — fail-hard sur stub en premium.
  // Le stub déterministe (runMangaEditorAgent) fabrique une grammaire
  // mécanique qui est l'une des causes racines des chapitres
  // "portraits en boucle / combat-poster / cutaway manquants". En
  // premium, on refuse de s'exécuter sans LLM réel.
  if (premiumOnly && !useLlm) {
    throw new PremiumStoryboardStubForbiddenError();
  }

  const editor = useLlm ? runMangaEditorAgentLlm : runMangaEditorAgent;
  const { storyboardPlan, warnings } = await editor({
    storyArc: input.storyArc,
    targetPanelCount: input.targetPanelCount,
    heroCharacterIds: input.heroCharacterIds,
    projectFormat: input.projectFormat,
  });

  const initialTotalPanels = (storyboardPlan.pages ?? []).reduce(
    (acc, page) => acc + (Array.isArray(page.panels) ? page.panels.length : 0),
    0,
  );
  const planForValidation = storyboardPlan;
  const densifyWarnings: string[] = [];
  if (premiumOnly && classifyPremiumPanelCount(initialTotalPanels) !== "ok") {
    densifyWarnings.push(
      `storyboard_plan.native_count_out_of_range=${initialTotalPanels} required=${PREMIUM_PANEL_RANGE.min}-${PREMIUM_PANEL_RANGE.max}`,
    );
  }

  // P8 — range premium STRICTE au niveau storyboard v3.
  // Un StoryboardPlan à 52 panels n'est pas un “warning UI”, c'est un plan incomplet.
  const totalPanels = (planForValidation.pages ?? []).reduce(
    (acc, page) => acc + (Array.isArray(page.panels) ? page.panels.length : 0),
    0,
  );
  const countBlockers: string[] = [];
  if (classifyPremiumPanelCount(totalPanels) !== "ok") {
    countBlockers.push(
      `storyboard_plan.panel_count_out_of_range=${totalPanels} required=${PREMIUM_PANEL_RANGE.min}-${PREMIUM_PANEL_RANGE.max}`,
    );
  }

  const strict = input.strict ?? premiumOnly;
  const validation = validateStoryboardPlan(planForValidation, {
    storyArc: input.storyArc,
    strict,
  });
  const blockers = [...(validation.ok ? [] : validation.issues), ...countBlockers];
  const allWarnings = [...warnings, ...densifyWarnings, ...validation.warnings];

  if (validation.ok && countBlockers.length === 0) {
    await saveStoryboardPlan(input.storyArc.chapterId, planForValidation);
  }

  return {
    storyboardPlan: planForValidation,
    warnings: allWarnings,
    blockers,
  };
}
