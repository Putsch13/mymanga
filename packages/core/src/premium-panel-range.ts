/**
 * premium-panel-range — contrat produit du nombre de panels premium.
 *
 * L'ancien modèle figé `minimumImages = 75` a été remplacé par une RANGE :
 *   - `min` : plancher dur (un chapitre < min est REFUSÉ)
 *   - `target` : cible produit (communication client, devis, quotas)
 *   - `max` : plafond dur (un chapitre > max est REFUSÉ)
 *
 * Motivation : on ne veut plus bloquer un storyboard à 71 / 72 / 73 / 74
 * panels produits nativement par l'éditeur manga sous prétexte qu'un
 * constant `minimumImages = 75` forcerait du padding legacy. On valide
 * désormais la range 70-75 comme livrable premium.
 */

export const PREMIUM_PANEL_RANGE = {
  min: 70,
  target: 72,
  max: 75,
} as const;

export type PremiumPanelCountStatus =
  | "ok"
  | "under_min"
  | "over_max";

export function classifyPremiumPanelCount(count: number): PremiumPanelCountStatus {
  if (!Number.isFinite(count) || count < PREMIUM_PANEL_RANGE.min) return "under_min";
  if (count > PREMIUM_PANEL_RANGE.max) return "over_max";
  return "ok";
}

export function isPremiumPanelCountValid(count: number): boolean {
  return classifyPremiumPanelCount(count) === "ok";
}
