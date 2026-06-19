/**
 * `computeShotVarietyBudget` — variété des CADRAGES (wide / medium / closeup
 * / insert / over-shoulder) et `varietyScore` ∈ [0,1].
 */
import type { PanelBlueprintPremium } from "@manga-ai-studio/core";

export interface ShotVarietyReport {
  hasWide: boolean;
  hasMedium: boolean;
  hasCloseup: boolean;
  hasInsert: boolean;
  hasOverShoulder: boolean;
  varietyScore: number;
  missingShots: string[];
}

export function computeShotVarietyBudget(
  blueprints: PanelBlueprintPremium[],
): ShotVarietyReport {
  const shots = new Set(blueprints.map((bp) => bp.shotType));
  const hasWide = shots.has("wide");
  const hasMedium = shots.has("medium");
  const hasCloseup = shots.has("closeup") || shots.has("extreme_closeup");
  const hasInsert = blueprints.some((bp) => bp.cutawayType === "prop_insert");
  const hasOverShoulder = shots.has("over_shoulder");

  const present = [hasWide, hasMedium, hasCloseup, hasInsert, hasOverShoulder].filter(
    Boolean,
  ).length;
  const varietyScore = present / 5;

  const missingShots: string[] = [];
  if (!hasWide) missingShots.push("wide");
  if (!hasMedium) missingShots.push("medium");
  if (!hasCloseup) missingShots.push("closeup");
  if (!hasInsert) missingShots.push("insert");
  if (!hasOverShoulder) missingShots.push("over_shoulder");

  return {
    hasWide,
    hasMedium,
    hasCloseup,
    hasInsert,
    hasOverShoulder,
    varietyScore,
    missingShots,
  };
}
