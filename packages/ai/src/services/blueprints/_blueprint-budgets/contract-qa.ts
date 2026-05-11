/**
 * `runPremiumPlanContractQa` (P0-3) — source de vérité unique pour la validité
 * contractuelle d'un plan premium. Appelée par `estimate` ET `launch`.
 *
 * Combine `computeContractualFocusAdequacy` + `computeChapterFocusBudget`
 * + une heuristique sur la "weak location binding" du blueprint.
 */
import type { PanelBlueprintPremium } from "@manga-ai-studio/core";
import { computeContractualFocusAdequacy } from "./contractual-adequacy";
import { computeChapterFocusBudget } from "./focus-budget";

export interface PremiumPlanContractQaResult {
  ok: boolean;
  blocking: string[];
  warnings: string[];
  repairable: string[];
  metrics: {
    propInserts: number;
    weaponInserts: number;
    envPanels: number;
    npcPanels: number;
    enemyFocus: number;
    heroCenterRatio: number;
    weakLocationBinding: number;
  };
}

const REPAIRABLE_VIOLATION_TYPES: ReadonlySet<string> = new Set([
  "missing_prop_insert",
  "missing_weapon_insert",
  "missing_npc_population",
  "missing_environment",
]);

function countWeakLocationBindings(blueprints: PanelBlueprintPremium[]): number {
  let weak = 0;
  for (const bp of blueprints) {
    const env = bp.environmentVisualDna as { locationName?: string } | null | undefined;
    if (!env || typeof env.locationName !== "string") {
      weak++;
      continue;
    }
    const n = env.locationName.trim().toLowerCase();
    if (n.length === 0 || n === "unknown" || n === "story-consistent setting") {
      weak++;
    }
  }
  return weak;
}

export function runPremiumPlanContractQa(input: {
  blueprints: PanelBlueprintPremium[];
}): PremiumPlanContractQaResult {
  const { blueprints } = input;
  const adequacy = computeContractualFocusAdequacy(blueprints);
  const budget = computeChapterFocusBudget(blueprints);

  const blocking: string[] = [];
  const warnings: string[] = [];
  const repairable: string[] = [];

  const weakLocationBinding = countWeakLocationBindings(blueprints);

  for (const v of adequacy.violations) {
    if (v.severity === "blocking") {
      if (REPAIRABLE_VIOLATION_TYPES.has(v.type)) repairable.push(v.type);
      blocking.push(v.type);
    } else {
      warnings.push(v.type);
    }
  }

  for (const v of budget.violations) {
    const key = v.type;
    if (v.severity === "blocking" && !blocking.includes(key)) {
      if (REPAIRABLE_VIOLATION_TYPES.has(key)) repairable.push(key);
      blocking.push(key);
    } else if (v.severity === "warning" && !warnings.includes(key)) {
      warnings.push(key);
    }
  }

  const total = blueprints.length;
  const weakRatio = total > 0 ? weakLocationBinding / total : 0;
  // Dégradé de blocking → warning : les panels obtiennent leur décor depuis le
  // VisualWorldContract au moment de la génération d'image, même si
  // `environmentVisualDna.locationName` est vide dans le blueprint persisté.
  if (weakRatio >= 0.6) {
    repairable.push("weak_location_binding_critical");
    warnings.push("weak_location_binding_critical");
  } else if (weakRatio > 0.3) {
    repairable.push("weak_location_binding_high");
    warnings.push("weak_location_binding_high");
  }

  if (weakRatio >= 1 && total > 0) {
    console.error(
      `[contract-qa] 100%_weak_location_binding — probable hydration bug panelCount=${total}`,
    );
  }

  const propInsertPanels = blueprints.filter(
    (bp) => bp.subjectFocus === "prop" || bp.cutawayType === "prop_insert",
  ).length;
  const weaponInsertPanels = blueprints.filter(
    (bp) =>
      bp.subjectFocus === "prop" &&
      bp.requiredProps?.some((p) => p.mustBeVisible === true),
  ).length;

  return {
    ok: blocking.length === 0,
    blocking,
    warnings,
    repairable,
    metrics: {
      propInserts: propInsertPanels,
      weaponInserts: weaponInsertPanels,
      envPanels: adequacy.environmentPanels,
      npcPanels: adequacy.npcPanels,
      enemyFocus: adequacy.enemyFocusPanels,
      heroCenterRatio: adequacy.heroCenterRatio,
      weakLocationBinding,
    },
  };
}
