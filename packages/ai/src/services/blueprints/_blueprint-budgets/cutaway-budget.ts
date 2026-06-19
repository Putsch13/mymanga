/**
 * `computeCutawayBudget` — qualité des plans de coupe (environnement, ennemi,
 * insert prop, réaction) et recommandations associées.
 */
import type { PanelBlueprintPremium } from "@manga-ai-studio/core";

export interface CutawayBudgetReport {
  totalCutaways: number;
  cutawayRatio: number;
  hasEnvironmentCutaway: boolean;
  hasEnemyCutaway: boolean;
  hasPropInsert: boolean;
  hasReactionCutaway: boolean;
  meetsMinimum: boolean;
  recommendations: string[];
}

export function computeCutawayBudget(
  blueprints: PanelBlueprintPremium[],
): CutawayBudgetReport {
  const total = blueprints.length;
  const cutaways = blueprints.filter((bp) => bp.cutawayType !== "none");
  const cutawayRatio = total > 0 ? cutaways.length / total : 0;

  const hasEnvironmentCutaway = cutaways.some((bp) => bp.cutawayType === "environment");
  const hasEnemyCutaway = cutaways.some((bp) => bp.cutawayType === "enemy");
  const hasPropInsert = cutaways.some((bp) => bp.cutawayType === "prop_insert");
  const hasReactionCutaway = cutaways.some((bp) => bp.cutawayType === "reaction");

  const meetsMinimum = cutawayRatio >= 0.2 && hasEnvironmentCutaway;

  const recommendations: string[] = [];
  if (!hasEnvironmentCutaway) {
    recommendations.push("Ajouter au moins un plan décor/environnement");
  }
  if (!hasEnemyCutaway && blueprints.some((bp) => bp.mustShowEnemy)) {
    recommendations.push("Ajouter un plan ennemi (mustShowEnemy détecté)");
  }
  if (!hasPropInsert && blueprints.some((bp) => bp.requiredProps.length > 0)) {
    recommendations.push("Ajouter un insert prop (props obligatoires détectés)");
  }
  if (!hasReactionCutaway && total > 4) {
    recommendations.push("Ajouter un plan de réaction pour équilibrer");
  }

  return {
    totalCutaways: cutaways.length,
    cutawayRatio,
    hasEnvironmentCutaway,
    hasEnemyCutaway,
    hasPropInsert,
    hasReactionCutaway,
    meetsMinimum,
    recommendations,
  };
}
