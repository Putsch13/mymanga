import type { VisualWorldContract, VisualWorldLocation } from "./visual-world-contract";
import { requireVisualWorldLocationForBeat } from "./narrative-location-from-contract";

/**
 * Lieu visuel canon pour un beat — premium strict (pas de fallback silencieux).
 * Délègue à `requireVisualWorldLocationForBeat` pour des messages d’erreur homogènes.
 */
export function selectBeatLocationFromVisualWorld(input: {
  beatId: string;
  visualWorld: VisualWorldContract;
}): VisualWorldLocation {
  return requireVisualWorldLocationForBeat(input.visualWorld, input.beatId);
}
