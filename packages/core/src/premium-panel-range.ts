/**
 * premium-panel-range — contrat produit du nombre de panels premium.
 *
 * Les valeurs numériques proviennent de `PRODUCTION_RULES` (source unique).
 * Ce fichier reste le point d'import historique pour le reste du monorepo.
 */

import {
  PRODUCTION_RULES,
  classifyPanelCount,
  isValidPanelCount,
} from "./production/production-rules";

export const PREMIUM_PANEL_RANGE = {
  min: PRODUCTION_RULES.panelCount.minimum,
  target: PRODUCTION_RULES.panelCount.target,
  max: PRODUCTION_RULES.panelCount.maximum,
} as const;

export type PremiumPanelCountStatus = ReturnType<typeof classifyPanelCount>;

export function classifyPremiumPanelCount(count: number): PremiumPanelCountStatus {
  return classifyPanelCount(count);
}

export function isPremiumPanelCountValid(count: number): boolean {
  return isValidPanelCount(count);
}
