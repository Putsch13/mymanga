/**
 * Ancrage des beats de dialogue (speaker / réaction / zones texte réservées).
 */

import {
  getDialogueStyleProfile,
  pickDeterministicFallbackLine,
  type DialogueStyleProfile,
} from "@manga-ai-studio/ai";
import type { CutawayType, PanelBlueprintPremium, PanelTextBundle, ProductionOutline } from "@manga-ai-studio/core";
import {
  blueprintPrimaryDialogueLineCount,
  legacyDialogueLinesFromBlueprintPremium,
  syncBlueprintTextContractFromTextFragments,
} from "@manga-ai-studio/core";
import { blueprintTextBlob } from "./premium-manga-cutaway";
import type { VisualEntity } from "./visual-entity-registry";
import { pickPrimaryActorForBeat } from "./visual-entity-registry";

export function isDialogueBeatPanel(bp: PanelBlueprintPremium): boolean {
  if (blueprintPrimaryDialogueLineCount(bp) > 0) return true;
  const purpose = String(bp.purpose ?? "").toLowerCase();
  const blob = blueprintTextBlob(bp);
  if (purpose.includes("dialogue")) return true;
  if (blob.includes(" dit ") || blob.includes(" répond") || blob.includes(" repond")) return true;
  if (bp.dialogueCarrier === "speaker_visible") return true;
  return false;
}

function collectDialogueBeatIds(blueprints: PanelBlueprintPremium[]): string[] {
  const set = new Set<string>();
  for (const bp of blueprints) {
    if (isDialogueBeatPanel(bp)) set.add(bp.beatId);
  }
  return [...set];
}

function pickConvertiblePanel(beatPanels: PanelBlueprintPremium[]): PanelBlueprintPremium | null {
  return (
    beatPanels.find((bp) => bp.cutawayType !== "none" || bp.subjectFocus === "environment")
    ?? beatPanels[0]
    ?? null
  );
}

function hasSpeakerPanel(beatPanels: PanelBlueprintPremium[]): boolean {
  return beatPanels.some((bp) =>
    ["speaker", "duo"].includes(bp.subjectFocus)
    || bp.dialogueCarrier === "speaker_visible",
  );
}

function hasListenerReactionPanel(beatPanels: PanelBlueprintPremium[]): boolean {
  return beatPanels.some((bp) => {
    const p = bp.purpose.toLowerCase();
    return p.includes("reaction") || bp.subjectFocus === "reaction" || bp.mangaPanelFunction === "dialogue_listener";
  });
}

function hasReservedTextZone(beatPanels: PanelBlueprintPremium[]): boolean {
  return beatPanels.some((bp) =>
    (bp.panelTextBundle?.reservedZones?.length ?? 0) > 0
    || Boolean(bp.textPlacementHint)
    || (bp.dialogueLinesAnchored ?? 0) > 0,
  );
}

function convertPanelToDialogueSpeakerPanel(
  bp: PanelBlueprintPremium,
  entities: VisualEntity[],
  fallbackHeroId: string | null,
): void {
  const primary = pickPrimaryActorForBeat(bp.beatId, entities, fallbackHeroId);
  bp.cutawayType = "none" as CutawayType;
  bp.subjectFocus = "speaker";
  bp.dialogueCarrier = "speaker_visible";
  bp.mangaPanelFunction = "dialogue_speaker";
  bp.heroCenterAllowed = true;
  if (primary) {
    bp.mustShowCharacterIds = [...new Set([...(bp.mustShowCharacterIds ?? []), primary.id])];
    bp.requiredCharacters = bp.mustShowCharacterIds;
  }
  bp.purpose = "dialogue speaker — clear face and readable mouth shape for lettering";
  bp.notes = [...(bp.notes ?? []), "forced_dialogue_speaker_panel"];
}

function convertPanelToListenerReactionPanel(
  bp: PanelBlueprintPremium,
  entities: VisualEntity[],
  fallbackHeroId: string | null,
): void {
  const primary = pickPrimaryActorForBeat(bp.beatId, entities, fallbackHeroId);
  bp.cutawayType = "none" as CutawayType;
  bp.subjectFocus = "reaction";
  bp.mangaPanelFunction = "dialogue_listener";
  bp.purpose = "dialogue listener reaction — posture and gaze readable for off-screen speech";
  if (primary) {
    bp.mustShowCharacterIds = [...new Set([...(bp.mustShowCharacterIds ?? []), primary.id])];
    bp.requiredCharacters = bp.mustShowCharacterIds;
  }
  bp.notes = [...(bp.notes ?? []), "forced_dialogue_listener_reaction_panel"];
}

function ensureTextAnchorOnBeat(beatPanels: PanelBlueprintPremium[]): void {
  const target = pickConvertiblePanel(beatPanels);
  if (!target) return;
  const dlg =
    target.dialogueLines?.length
      ? target.dialogueLines.map((l) => ({ speaker: l.speaker, text: l.text }))
      : legacyDialogueLinesFromBlueprintPremium(target).map((l) => ({ speaker: l.speaker, text: l.text }));
  const bundle: PanelTextBundle = {
    ...(target.panelTextBundle ?? {}),
    dialogues: dlg.length > 0 ? dlg : undefined,
    narration: target.narrationText ?? null,
    reservedZones: [...(target.panelTextBundle?.reservedZones ?? []), "bottom_band", "side_margin"],
    preferredAnchorZones: ["near_speaker_head"],
    overflowStrategy: "caption_strip",
  };
  target.panelTextBundle = bundle;
  syncBlueprintTextContractFromTextFragments(target);
  target.notes = [...(target.notes ?? []), "forced_reserved_text_zones"];
}

export function ensureDialogueBeatsHaveAnchors(args: {
  blueprints: PanelBlueprintPremium[];
  visualEntities: VisualEntity[];
  fallbackHeroId: string | null;
}): void {
  for (const beatId of collectDialogueBeatIds(args.blueprints)) {
    const beatPanels = args.blueprints.filter((bp) => bp.beatId === beatId);
    if (!hasSpeakerPanel(beatPanels)) {
      const t = pickConvertiblePanel(beatPanels);
      if (t) convertPanelToDialogueSpeakerPanel(t, args.visualEntities, args.fallbackHeroId);
    }
    const refreshed = args.blueprints.filter((bp) => bp.beatId === beatId);
    if (!hasListenerReactionPanel(refreshed)) {
      const t = pickConvertiblePanel(refreshed);
      if (t) convertPanelToListenerReactionPanel(t, args.visualEntities, args.fallbackHeroId);
    }
    const refreshed2 = args.blueprints.filter((bp) => bp.beatId === beatId);
    if (!hasReservedTextZone(refreshed2)) {
      ensureTextAnchorOnBeat(refreshed2);
    }
  }
}

export interface DialogueQaResult {
  ok: boolean;
  issues: string[];
  dialogueBeats: number;
  speakerPanels: number;
  reactionPanels: number;
  anchored: number;
  floating: number;
}

function groupByBeat(blueprints: PanelBlueprintPremium[]): Map<string, PanelBlueprintPremium[]> {
  const m = new Map<string, PanelBlueprintPremium[]>();
  for (const bp of blueprints) {
    const arr = m.get(bp.beatId) ?? [];
    arr.push(bp);
    m.set(bp.beatId, arr);
  }
  return m;
}

function beatHasDialogue(beatPanels: PanelBlueprintPremium[]): boolean {
  return beatPanels.some(isDialogueBeatPanel);
}

const COMBAT_KEYWORDS = /combat|attaque|attack|sort|magic|magique|impact|threat|explosion|choc|fire|feu/i;
const COMBAT_SFX_DEFAULTS = ["FWASH", "BOOM", "KRAKK", "ZZZAP", "WHAM"];

function isCombatBeatPanel(bp: PanelBlueprintPremium): boolean {
  const text = `${bp.purpose} ${(bp.requiredLocationSignals ?? []).join(" ")}`.toLowerCase();
  return COMBAT_KEYWORDS.test(text) || bp.mangaPanelFunction === "impact" || bp.mustShowEnemy === true;
}

function ensureCombatSfx(bp: PanelBlueprintPremium): void {
  if (!isCombatBeatPanel(bp)) return;
  if (bp.sfxCues && bp.sfxCues.length > 0) return;

  const purpose = bp.purpose.toLowerCase();
  let sfx = "KRAKK";
  if (purpose.includes("magic") || purpose.includes("sort") || purpose.includes("magique")) {
    sfx = "FWASH";
  } else if (purpose.includes("explosion") || purpose.includes("impact")) {
    sfx = "BOOM";
  } else if (purpose.includes("fire") || purpose.includes("feu")) {
    sfx = "WHOOSH";
  }

  bp.sfxCues = [sfx];
  bp.textPlacementHint = bp.textPlacementHint ?? {
    preferredAnchorZones: ["top-left"],
    overflowStrategy: "caption_strip",
  };
  bp.notes = [...(bp.notes ?? []), "auto_combat_sfx"];
}

function extractDialogueFromIntent(chapterUserIntent: string | null): Array<{ speaker: string; text: string }> {
  if (!chapterUserIntent) return [];
  const lines = chapterUserIntent.split(/[.!?\n]/).filter(Boolean);
  const dialogues: Array<{ speaker: string; text: string }> = [];

  for (const line of lines) {
    const match = line.match(/(\w+)\s+(dit|says?|répond|réponds?|crie|yells?|demande|asks?)\s*[:"]?\s*(.+)/i);
    if (match) {
      dialogues.push({ speaker: match[1]!, text: match[3]?.trim() ?? "" });
    }
  }
  return dialogues;
}

function normalizeBeatText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function firstNamedCharacter(text: string): string | null {
  const common = new Set(["Le", "La", "Les", "Un", "Une", "Des", "Ce", "Cette", "Alors", "Temps"]);
  const match = text.match(/\b[A-ZÀ-ÖØ-Ý][a-zà-öø-ÿA-ZÀ-ÖØ-Ý'-]{1,}\b/g) ?? [];
  return match.find((token) => !common.has(token)) ?? null;
}

export type InferredPanelTextMode = "dialogue" | "thought" | "narration" | "silent";

type PanelTextStyleContext = { seed: string; profile: DialogueStyleProfile };

function pickBeatDialogueOnly(args: {
  seed: string;
  profile: DialogueStyleProfile;
  kind: "approach" | "hesitation" | "interrupt" | "gaze" | "decision";
}): { text: string } | null {
  const kinds: Array<typeof args.kind> = [args.kind, "interrupt", "approach", "gaze", "decision", "hesitation"];
  for (let i = 0; i < kinds.length; i++) {
    const k = kinds[i]!;
    const pick = pickDeterministicFallbackLine({ seed: `${args.seed}|${i}`, profile: args.profile, kind: k });
    if (pick.mode === "dialogue") return { text: pick.text };
  }
  return null;
}

export function inferPanelTextFromBeatSummary(
  summary: string,
  _panelRole: "speaker" | "reaction" | "generic",
  speakerHint?: string | null,
  style?: PanelTextStyleContext | null,
): { mode: InferredPanelTextMode; speaker?: string; text?: string } {
  const cleaned = normalizeBeatText(summary);
  if (!cleaned) return { mode: "silent" };
  const lower = cleaned.toLowerCase();
  const speaker = (speakerHint ?? "").trim();

  if (!style) return { mode: "silent" };

  const { seed, profile } = style;
  let kind: "approach" | "hesitation" | "interrupt" | "gaze" | "decision" | null = null;
  if (/(s['’]approche|approche pour|aller vers|discuter|parler à|talk to)/i.test(lower)) kind = "approach";
  else if (/(hésite|hesite|nerveux|nerveuse|angoiss|stress|trouve pas les mots)/i.test(lower)) kind = "hesitation";
  else if (/(interrompt|interrupt|coupe la parole|coupe dans)/i.test(lower)) kind = "interrupt";
  else if (/(regard.*crois|œil|oeil|coeur|cœur|emballe|battre)/i.test(lower)) kind = "gaze";
  else if (/(décision|decision|choix|détermin|determin|tranche|silence lourd)/i.test(lower)) kind = "decision";

  if (!kind) return { mode: "silent" };

  const pick = pickDeterministicFallbackLine({ seed, profile, kind });
  if (pick.mode === "dialogue") return { mode: "dialogue", speaker, text: pick.text };
  if (pick.mode === "thought") return { mode: "thought", speaker, text: pick.text };
  return { mode: "narration", text: pick.text };
}

function inferDialogueFromBeatSummary(
  summary: string,
  style: PanelTextStyleContext,
): { speaker: string; text: string } | null {
  const cleaned = normalizeBeatText(summary);
  if (!cleaned) return null;
  const lower = cleaned.toLowerCase();
  const speaker = firstNamedCharacter(cleaned) ?? "";

  let kind: "approach" | "hesitation" | "interrupt" | "gaze" | "decision" | null = null;
  if (/(accuse|ne .*fait pas confiance|confiance)/i.test(lower)) kind = "interrupt";
  else if (/(calme|calmer|craintes|doutes|peur)/i.test(lower)) kind = "hesitation";
  else if (/(révèle|revele|lié|lie|trahison|magicien)/i.test(lower)) kind = "gaze";
  else if (/(hésite|hesite|ami|blesser)/i.test(lower)) kind = "hesitation";
  else if (/(décision|decision|déterminée|determinee|céder|ceder)/i.test(lower)) kind = "decision";

  if (!kind) return null;
  const line = pickBeatDialogueOnly({ seed: `${style.seed}|beat-dialogue`, profile: style.profile, kind });
  if (!line) return null;
  return { speaker, text: line.text };
}

function buildBeatSummaryMap(outline?: ProductionOutline | null): Map<string, string> {
  const map = new Map<string, string>();
  const beats = Array.isArray(outline?.beats) ? outline.beats : [];
  for (const beat of beats) {
    const beatId = typeof beat.beatId === "string" ? beat.beatId : null;
    if (!beatId) continue;
    const text = normalizeBeatText([
      beat.summary,
      beat.whyThisBeatExists,
      beat.dramaticChange,
    ].filter((v): v is string => typeof v === "string" && v.trim().length > 0).join(" "));
    if (text) map.set(beatId, text);
  }
  return map;
}

function isCutawayPanel(bp: PanelBlueprintPremium): boolean {
  return bp.cutawayType !== "none"
    || bp.subjectFocus === "environment"
    || bp.subjectFocus === "prop"
    || bp.subjectFocus === "aftermath";
}

function ensureTextBundle(bp: PanelBlueprintPremium): PanelTextBundle {
  const bundle: PanelTextBundle = {
    ...(bp.panelTextBundle ?? {}),
    reservedZones: [...(bp.panelTextBundle?.reservedZones ?? []), "bottom_band"],
    preferredAnchorZones: bp.panelTextBundle?.preferredAnchorZones ?? ["bottom_band"],
    overflowStrategy: bp.panelTextBundle?.overflowStrategy ?? "caption_strip",
  };
  bp.panelTextBundle = bundle;
  return bundle;
}

export interface EnsureDialogueAndSfxInput {
  blueprints: PanelBlueprintPremium[];
  chapterUserIntent: string | null;
  productionOutline?: ProductionOutline | null;
  chapterSummary?: string | null;
  /** id → nom affichable pour dialogues inférés sans heuristique de capitales. */
  characterNameById?: Record<string, string>;
  projectGenre?: string | null;
  projectTone?: string | null;
  contentRating?: string | null;
}

/**
 * Enrichit les blueprints avec dialogues et SFX manquants.
 * - Combat panels → SFX automatiques
 * - Dialogue panels → zones de texte réservées
 */
export function ensureDialogueAndSfxForPremiumBlueprints(input: EnsureDialogueAndSfxInput): {
  combatSfxAdded: number;
  dialogueEnriched: number;
  narrativeContextAdded: number;
} {
  let combatSfxAdded = 0;
  let dialogueEnriched = 0;
  let narrativeContextAdded = 0;

  const extractedDialogues = extractDialogueFromIntent(input.chapterUserIntent);
  const beatSummaryById = buildBeatSummaryMap(input.productionOutline);
  const styleProfile = getDialogueStyleProfile({
    genre: input.projectGenre,
    tone: input.projectTone,
    contentRating: input.contentRating,
  });

  for (const bp of input.blueprints) {
    if (isCombatBeatPanel(bp) && (!bp.sfxCues || bp.sfxCues.length === 0)) {
      ensureCombatSfx(bp);
      combatSfxAdded += 1;
    }

    if (isDialogueBeatPanel(bp) && blueprintPrimaryDialogueLineCount(bp) === 0) {
      const match = extractedDialogues.find((d) =>
        bp.purpose.toLowerCase().includes(d.speaker.toLowerCase()),
      );
      if (match) {
        bp.dialogueLines = [{ speaker: match.speaker, text: match.text }];
        syncBlueprintTextContractFromTextFragments(bp);
        bp.notes = [...(bp.notes ?? []), "auto_dialogue_from_intent"];
        dialogueEnriched += 1;
      }
    }

    const beatSummary = beatSummaryById.get(bp.beatId) ?? normalizeBeatText(input.chapterSummary ?? "");
    if (
      !isCutawayPanel(bp)
      && blueprintPrimaryDialogueLineCount(bp) === 0
      && !bp.narrationText
      && beatSummary
    ) {
      const speakerId =
        bp.speakerAnchorCharacterId
        ?? bp.mustShowCharacterIds?.[0]
        ?? bp.requiredCharacterIds?.[0];
      const speakerHint = speakerId && input.characterNameById?.[speakerId]
        ? input.characterNameById[speakerId]
        : null;

      if (bp.dialogueCarrier === "speaker_visible" || bp.subjectFocus === "speaker") {
        const styleCtx: PanelTextStyleContext = {
          seed: `${bp.beatId}:${bp.panelId}`,
          profile: styleProfile,
        };
        const contextual = inferPanelTextFromBeatSummary(beatSummary, "speaker", speakerHint, styleCtx);
        if (contextual.mode === "dialogue" && contextual.text) {
          bp.dialogueLines = [{ speaker: contextual.speaker ?? "", text: contextual.text }];
          bp.dialogueLinesAnchored = Math.max(1, bp.dialogueLinesAnchored ?? 0);
          syncBlueprintTextContractFromTextFragments(bp);
          bp.notes = [...(bp.notes ?? []), "auto_dialogue_from_beat_context"];
          dialogueEnriched += 1;
          continue;
        }
        if (contextual.mode === "thought" && contextual.text) {
          bp.narrationText = contextual.text;
          syncBlueprintTextContractFromTextFragments(bp);
          bp.notes = [...(bp.notes ?? []), "auto_thought_from_beat_context"];
          narrativeContextAdded += 1;
          continue;
        }
        if (contextual.mode === "narration" && contextual.text) {
          bp.narrationText = contextual.text;
          const bundle = ensureTextBundle(bp);
          bundle.narration = contextual.text;
          syncBlueprintTextContractFromTextFragments(bp);
          bp.notes = [...(bp.notes ?? []), "auto_narration_from_beat_context"];
          narrativeContextAdded += 1;
          continue;
        }

        const inferred = inferDialogueFromBeatSummary(beatSummary, styleCtx);
        if (inferred) {
          bp.dialogueLines = [inferred];
          bp.dialogueLinesAnchored = Math.max(1, bp.dialogueLinesAnchored ?? 0);
          syncBlueprintTextContractFromTextFragments(bp);
          bp.notes = [...(bp.notes ?? []), "auto_dialogue_from_beat_summary"];
          dialogueEnriched += 1;
          continue;
        }
      }

      const narration = beatSummary.length > 170 ? `${beatSummary.slice(0, 167).trim()}…` : beatSummary;
      bp.narrationText = narration;
      const bundle = ensureTextBundle(bp);
      bundle.narration = narration;
      syncBlueprintTextContractFromTextFragments(bp);
      bp.notes = [...(bp.notes ?? []), "auto_narrative_context_from_beat_summary"];
      narrativeContextAdded += 1;
    }
  }

  return { combatSfxAdded, dialogueEnriched, narrativeContextAdded };
}

export function runDialogueQaOnBlueprints(blueprints: PanelBlueprintPremium[]): DialogueQaResult {
  const issues: string[] = [];
  let dialogueBeats = 0;
  let speakerPanels = 0;
  let reactionPanels = 0;
  let anchored = 0;
  let floating = 0;

  for (const [, panels] of groupByBeat(blueprints)) {
    if (!beatHasDialogue(panels)) continue;
    dialogueBeats += 1;
    const bid = panels[0]?.beatId ?? "?";

    if (!hasSpeakerPanel(panels)) {
      issues.push(`dialogue_beat_without_speaker_panel beat=${bid}`);
    } else {
      speakerPanels += panels.filter((bp) =>
        ["speaker", "duo"].includes(bp.subjectFocus) || bp.dialogueCarrier === "speaker_visible",
      ).length;
    }

    if (!hasListenerReactionPanel(panels)) {
      issues.push(`dialogue_beat_without_listener_reaction beat=${bid}`);
    } else {
      reactionPanels += panels.filter((bp) =>
        bp.purpose.toLowerCase().includes("reaction") || bp.subjectFocus === "reaction",
      ).length;
    }

    if (!hasReservedTextZone(panels)) {
      issues.push(`dialogue_beat_without_reserved_text_zone beat=${bid}`);
      floating += panels.length;
    } else {
      anchored += panels.filter(
        (bp) => (bp.panelTextBundle?.reservedZones?.length ?? 0) > 0 || Boolean(bp.textPlacementHint),
      ).length;
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    dialogueBeats,
    speakerPanels,
    reactionPanels,
    anchored,
    floating,
  };
}
