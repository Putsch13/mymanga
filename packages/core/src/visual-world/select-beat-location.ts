import type { VisualWorldContract, VisualWorldLocation } from "./visual-world-contract";
import { requireVisualWorldLocationForBeat, tryRequireVisualWorldLocationForBeat } from "./narrative-location-from-contract";

/**
 * Lieu visuel canon pour un beat — premium strict (pas de fallback silencieux).
 * Délègue à `requireVisualWorldLocationForBeat` pour des messages d'erreur homogènes.
 */
export function selectBeatLocationFromVisualWorld(input: {
  beatId: string;
  visualWorld: VisualWorldContract;
}): VisualWorldLocation {
  return requireVisualWorldLocationForBeat(input.visualWorld, input.beatId);
}

/**
 * Version non-throwing avec fallback : retourne `null` si le beat n'a pas de
 * locationId bindé et aucune location n'est disponible pour fallback.
 * Si le beat n'a pas de binding explicite mais que le contrat a au moins un lieu,
 * retourne le premier lieu comme fallback et log un warning.
 */
export function trySelectBeatLocationFromVisualWorld(input: {
  beatId: string;
  visualWorld: VisualWorldContract;
}): VisualWorldLocation | null {
  const loc = tryRequireVisualWorldLocationForBeat(input.visualWorld, input.beatId);
  if (loc) return loc;
  if (input.visualWorld.locations.length > 0) {
    console.warn(
      `[env-dna:fallback] beat=${input.beatId} has no locationId binding — using first location "${input.visualWorld.locations[0]!.label}" as fallback`,
    );
    return input.visualWorld.locations[0]!;
  }
  return null;
}
