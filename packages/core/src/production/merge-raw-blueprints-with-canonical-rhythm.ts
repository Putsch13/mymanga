/**
 * Fusionne les blueprints riches (beat builder / LLM) avec le plan canonique :
 * le canonique impose uniquement les IDs, beat, pagination et ordre des panels.
 * Le contenu narratif (purpose, dialogues, props, etc.) reste celui des blueprints sources.
 */

import type { CanonicalChapterProductionPlan } from "./canonical-production-plan";
import type { PanelBlueprintPremium } from "../types/narrative-facts";
import { canonicalPlanToPanelBlueprints } from "./canonical-to-premium-blueprints";

function cloneBlueprint(bp: PanelBlueprintPremium): PanelBlueprintPremium {
  return structuredClone(bp) as PanelBlueprintPremium;
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
    if (raw) {
      base = cloneBlueprint(raw);
    } else {
      const last = lastConsumedByBeat.get(cp.beatId);
      if (last) {
        base = cloneBlueprint(last);
        const note = "rhythm_padding:cloned_from_last_panel_in_beat";
        base.notes = [...(base.notes ?? []), note];
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
      }
    }

    return {
      ...base,
      panelId: cp.panelId,
      beatId: cp.beatId,
      panelIndex: cp.panelIndex,
      pageNumber: cp.pageNumber,
      panelNumber: cp.panelNumberInPage,
    };
  });
}
