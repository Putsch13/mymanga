/**
 * P0-4 — Réparation déterministe des violations contractuelles de focus.
 *
 * Avant de refuser un lancement, tente de convertir des cutaways génériques
 * en panels contractuels manquants (prop insert, npc panel, environment).
 */

import type { PanelBlueprintPremium, SubjectFocus, CutawayType } from "../types/narrative-facts";

export interface FocusViolation {
  type:
    | "missing_prop_insert"
    | "missing_weapon_insert"
    | "missing_npc_population"
    | "missing_environment"
    | "missing_enemy_focus"
    | "hero_overload_vs_contract";
  message: string;
  severity: "warning" | "blocking";
}

function findFirstGenericCutaway(
  blueprints: PanelBlueprintPremium[],
  excludeIndices: Set<number>,
): number {
  for (let i = 0; i < blueprints.length; i++) {
    if (excludeIndices.has(i)) continue;
    const bp = blueprints[i]!;
    if (
      bp.cutawayType === "environment" ||
      bp.cutawayType === "none"
    ) {
      if (
        bp.subjectFocus !== "prop" &&
        bp.subjectFocus !== "enemy" &&
        bp.subjectFocus !== "group" &&
        bp.subjectFocus !== "npc"
      ) {
        return i;
      }
    }
  }
  return -1;
}

function convertToPropInsert(bp: PanelBlueprintPremium): PanelBlueprintPremium {
  return {
    ...bp,
    subjectFocus: "prop" as SubjectFocus,
    cutawayType: "prop_insert" as CutawayType,
    heroCenterAllowed: false,
    contractualCritical: true,
    notes: [...(bp.notes ?? []), "repair:converted_to_prop_insert"],
  };
}

function convertToNpcPanel(bp: PanelBlueprintPremium): PanelBlueprintPremium {
  return {
    ...bp,
    subjectFocus: "group" as SubjectFocus,
    cutawayType: "none" as CutawayType,
    heroCenterAllowed: false,
    contractualCritical: true,
    notes: [...(bp.notes ?? []), "repair:converted_to_npc_panel"],
  };
}

function convertToEnvironment(bp: PanelBlueprintPremium): PanelBlueprintPremium {
  return {
    ...bp,
    subjectFocus: "environment" as SubjectFocus,
    cutawayType: "environment" as CutawayType,
    heroCenterAllowed: false,
    shotType: "wide",
    notes: [...(bp.notes ?? []), "repair:converted_to_environment"],
  };
}

export function repairProductionPlanContractualFocus(
  blueprints: PanelBlueprintPremium[],
  violations: FocusViolation[],
): { repaired: PanelBlueprintPremium[]; attempted: number; succeeded: number; failed: number } {
  const result = [...blueprints];
  const usedIndices = new Set<number>();
  let attempted = 0;
  let succeeded = 0;
  let failed = 0;

  for (const violation of violations) {
    if (violation.severity !== "blocking") continue;
    attempted++;

    if (violation.type === "missing_prop_insert" || violation.type === "missing_weapon_insert") {
      const idx = findFirstGenericCutaway(result, usedIndices);
      if (idx >= 0) {
        result[idx] = convertToPropInsert(result[idx]!);
        usedIndices.add(idx);
        succeeded++;
      } else {
        failed++;
      }
    } else if (violation.type === "missing_npc_population") {
      const idx = findFirstGenericCutaway(result, usedIndices);
      if (idx >= 0) {
        result[idx] = convertToNpcPanel(result[idx]!);
        usedIndices.add(idx);
        succeeded++;
      } else {
        failed++;
      }
    } else if (violation.type === "missing_environment") {
      const idx = findFirstGenericCutaway(result, usedIndices);
      if (idx >= 0) {
        result[idx] = convertToEnvironment(result[idx]!);
        usedIndices.add(idx);
        succeeded++;
      } else {
        failed++;
      }
    } else {
      failed++;
    }
  }

  console.info(
    `[focus-repair] attempted=${attempted} repaired=${succeeded} failed=${failed}`,
  );

  return { repaired: result, attempted, succeeded, failed };
}
