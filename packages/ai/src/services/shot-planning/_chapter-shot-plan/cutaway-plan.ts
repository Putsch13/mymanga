import type { PanelBlueprintPremium } from "@manga-ai-studio/core";

import type {
  CutawayPlan,
  CutawayQaResult,
  NarrativeCutawayPanel,
  NarrativeCutawayType,
} from "./types";

function inferCutawayType(bp: PanelBlueprintPremium): NarrativeCutawayType {
  const ct = bp.cutawayType;
  if (ct === "enemy" || ct === "enemy_reveal" || ct === "threat_insert") return "danger_signal";
  if (ct === "prop_insert" || ct === "object_insert") return "prop_continuity";
  if (ct === "environment" || ct === "environment_establishing") return "environment_escalation";
  if (ct === "reaction" || ct === "reaction_insert") return "emotion_detail";
  if (ct === "aftermath") return "silent_beat";
  if (ct === "surveillance" || ct === "movement_trace") return "foreshadowing";
  return "emotion_detail";
}

export function buildCutawayPlan(
  blueprints: ReadonlyArray<PanelBlueprintPremium>,
): CutawayPlan {
  const panels: NarrativeCutawayPanel[] = [];
  const coverageByBeat: Record<string, number> = {};

  for (const bp of blueprints) {
    if (!bp.cutawayType || bp.cutawayType === "none") continue;

    const type = inferCutawayType(bp);
    const mustReference: string[] = [];
    if (bp.requiredCharacterIds?.length) mustReference.push(...bp.requiredCharacterIds);
    if (bp.requiredEntityIds?.length) mustReference.push(...bp.requiredEntityIds);
    const requiredProps = bp.requiredProps ?? [];
    for (const p of requiredProps) {
      if (typeof p === "object" && "canonicalName" in p) {
        mustReference.push((p as { canonicalName: string }).canonicalName);
      }
    }

    panels.push({
      id: `cutaway_${bp.panelId}`,
      beatId: bp.beatId,
      eventId: bp.panelId,
      type,
      subject: bp.purpose || bp.subjectFocus || "unknown",
      narrativePurpose: bp.purpose || `${type} cutaway`,
      mustReference,
    });

    coverageByBeat[bp.beatId] = (coverageByBeat[bp.beatId] ?? 0) + 1;
  }

  return { panels, coverageByBeat };
}

export function runCutawayQa(
  blueprints: ReadonlyArray<PanelBlueprintPremium>,
): CutawayQaResult {
  const beatIds = new Set<string>();
  const beatsWithCutaway = new Set<string>();

  for (const bp of blueprints) {
    beatIds.add(bp.beatId);
    if (bp.cutawayType && bp.cutawayType !== "none") {
      beatsWithCutaway.add(bp.beatId);
    }
  }

  const beatsWithoutCutaway = [...beatIds].filter((id) => !beatsWithCutaway.has(id));
  const warnings: string[] = [];

  if (beatsWithoutCutaway.length > 0) {
    warnings.push(
      `${beatsWithoutCutaway.length}/${beatIds.size} beats have no cutaway panel`,
    );
  }

  const cutawayPlan = buildCutawayPlan(blueprints);
  const dangerBeats = [...beatIds].filter((id) => {
    const panelsInBeat = blueprints.filter((bp) => bp.beatId === id);
    const hasEnvironmentEvent = panelsInBeat.some(
      (bp) =>
        bp.subjectFocus === "environment" ||
        bp.subjectFocus === "location" ||
        bp.mangaPanelFunction === "establishing",
    );
    if (!hasEnvironmentEvent) return false;
    const hasDangerCutaway = cutawayPlan.panels.some(
      (p) =>
        p.beatId === id &&
        (p.type === "danger_signal" || p.type === "environment_escalation"),
    );
    return !hasDangerCutaway;
  });

  if (dangerBeats.length > 0) {
    warnings.push(
      `${dangerBeats.length} environment beats lack danger_signal or environment_escalation cutaway`,
    );
  }

  return {
    ok: beatsWithoutCutaway.length === 0 && dangerBeats.length === 0,
    totalBeats: beatIds.size,
    beatsWithCutaway: beatsWithCutaway.size,
    beatsWithoutCutaway,
    warnings,
  };
}
