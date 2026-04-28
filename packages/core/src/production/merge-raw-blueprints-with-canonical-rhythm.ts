/**
 * Fusionne les blueprints riches (beat builder / LLM) avec le plan canonique :
 * le canonique impose uniquement les IDs, beat, pagination et ordre des panels.
 * Le contenu narratif (purpose, dialogues, props, etc.) reste celui des blueprints sources.
 */

import type { CanonicalChapterProductionPlan, CanonicalPanelPlan } from "./canonical-production-plan";
import type { PanelBlueprintOrigin, PanelBlueprintPremium, PanelBlueprintProvenance } from "../types/narrative-facts";
import { canonicalPlanToPanelBlueprints } from "./canonical-to-premium-blueprints";

function cloneBlueprint(bp: PanelBlueprintPremium): PanelBlueprintPremium {
  return structuredClone(bp) as PanelBlueprintPremium;
}

function provenanceForMerge(args: {
  origin: PanelBlueprintOrigin;
  cp: CanonicalPanelPlan;
  rules: string[];
}): PanelBlueprintProvenance {
  return {
    origin: args.origin,
    canonicalPanelId: args.cp.panelId,
    canonicalBeatId: args.cp.beatId,
    appliedRules: args.rules,
  };
}

/**
 * @param rawBlueprints — ordre cohérent avec les beats (ex. flatMap des beats enrichis)
 * @param canonicalPlan — plan canonique déjà validé (QA rythme / pages)
 */
export function mergeRawBlueprintsWithCanonicalRhythm(
  rawBlueprints: PanelBlueprintPremium[],
  canonicalPlan: CanonicalChapterProductionPlan,
): PanelBlueprintPremium[] {
  if (rawBlueprints.length === 0) {
    return canonicalPlanToPanelBlueprints(canonicalPlan);
  }

  const genericByPanelId = new Map(
    canonicalPlanToPanelBlueprints(canonicalPlan).map((b) => [b.panelId, b] as const),
  );

  const queues = new Map<string, PanelBlueprintPremium[]>();
  for (const bp of rawBlueprints) {
    const list = queues.get(bp.beatId) ?? [];
    list.push(bp);
    queues.set(bp.beatId, list);
  }
  const scratch = new Map<string, PanelBlueprintPremium[]>();
  for (const [beatId, list] of queues) {
    scratch.set(beatId, [...list]);
  }

  const lastConsumedByBeat = new Map<string, PanelBlueprintPremium>();

  return canonicalPlan.panels.map((cp) => {
    const q = scratch.get(cp.beatId);
    let raw: PanelBlueprintPremium | null = null;
    if (q && q.length > 0) {
      raw = q.shift()!;
      lastConsumedByBeat.set(cp.beatId, raw);
    }

    let base: PanelBlueprintPremium;
    let origin: PanelBlueprintOrigin;
    let appliedRules: string[];
    if (raw) {
      base = cloneBlueprint(raw);
      origin = "author_raw_merged";
      appliedRules = ["merge_raw_with_canonical_rhythm"];
    } else {
      const last = lastConsumedByBeat.get(cp.beatId);
      if (last) {
        base = cloneBlueprint(last);
        const note = "rhythm_padding:cloned_from_last_panel_in_beat";
        base.notes = [...(base.notes ?? []), note];
        origin = "rhythm_padding_clone";
        appliedRules = ["merge_raw_with_canonical_rhythm", "rhythm_padding_clone_within_beat"];
      } else {
        const fallback = genericByPanelId.get(cp.panelId);
        if (!fallback) {
          throw new Error(`merge_raw_blueprints_with_canonical_rhythm:no_fallback_for_panel:${cp.panelId}`);
        }
        base = cloneBlueprint(fallback);
        base.dialogueLines = undefined;
        base.panelTextBundle = base.panelTextBundle
          ? { ...base.panelTextBundle, dialogues: undefined }
          : null;
        origin = "rhythm_padding_canonical_fallback";
        appliedRules = ["merge_raw_with_canonical_rhythm", "rhythm_padding_canonical_slot_fallback"];
      }
    }

    return {
      ...base,
      panelId: cp.panelId,
      beatId: cp.beatId,
      panelIndex: cp.panelIndex,
      pageNumber: cp.pageNumber,
      panelNumber: cp.panelNumberInPage,
      provenance: provenanceForMerge({ origin, cp, rules: appliedRules }),
    };
  });
}
