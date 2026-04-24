/**
 * Ancrage des beats de dialogue (speaker / réaction / zones texte réservées).
 */

import type { CutawayType, PanelBlueprintPremium, PanelTextBundle } from "@manga-ai-studio/core";
import { blueprintTextBlob } from "./premium-manga-cutaway";
import type { VisualEntity } from "./visual-entity-registry";
import { pickPrimaryActorForBeat } from "./visual-entity-registry";

export function isDialogueBeatPanel(bp: PanelBlueprintPremium): boolean {
  if ((bp.dialogueLines?.length ?? 0) > 0) return true;
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
  const bundle: PanelTextBundle = {
    ...(target.panelTextBundle ?? {}),
    dialogues: target.dialogueLines?.map((l) => ({ speaker: l.speaker, text: l.text })),
    narration: target.narrationText ?? null,
    reservedZones: [...(target.panelTextBundle?.reservedZones ?? []), "bottom_band", "side_margin"],
    preferredAnchorZones: ["near_speaker_head"],
    overflowStrategy: "caption_strip",
  };
  target.panelTextBundle = bundle;
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
