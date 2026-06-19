import type { VisualWorldContract, VisualWorldLocation } from "./visual-world-contract";
import { requireVisualWorldLocationForBeat, tryRequireVisualWorldLocationForBeat } from "./narrative-location-from-contract";

/** Un beat peut hydrater dizaines de panels — on ne loggue le fallback qu'une fois par beatId. */
const fallbackWarnSeen = new Set<string>();

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

export interface TrySelectBeatLocationResult {
  /** Lieu sélectionné — `null` si aucune location dans le contrat. */
  location: VisualWorldLocation | null;
  /** `true` quand on a dû retomber sur le premier lieu faute de binding. */
  wasFallback: boolean;
}

/**
 * Version non-throwing avec fallback structuré : retourne le lieu et un flag
 * `wasFallback` permettant aux appelants de compter combien de beats sont en
 * fallback et de bloquer le chapitre si la proportion dépasse un seuil
 * (audit v7 : on voyait des chapitres "100% en jungle" sans aucun signal
 * remonté à l'utilisateur — ce résultat structuré rend la dérive mesurable).
 *
 * Conserve le warning console pour la rétrocompatibilité avec les outils
 * de log existants. Pour un appelant qui ne souhaite QUE l'objet, il peut
 * lire `result.location ?? null`.
 */
export function trySelectBeatLocationFromVisualWorld(input: {
  beatId: string;
  visualWorld: VisualWorldContract;
}): VisualWorldLocation | null {
  return trySelectBeatLocationFromVisualWorldWithMeta(input).location;
}

export function trySelectBeatLocationFromVisualWorldWithMeta(input: {
  beatId: string;
  visualWorld: VisualWorldContract;
}): TrySelectBeatLocationResult {
  const loc = tryRequireVisualWorldLocationForBeat(input.visualWorld, input.beatId);
  if (loc) return { location: loc, wasFallback: false };
  if (input.visualWorld.locations.length > 0) {
    if (!fallbackWarnSeen.has(input.beatId)) {
      if (fallbackWarnSeen.size > 500) fallbackWarnSeen.clear();
      fallbackWarnSeen.add(input.beatId);
      console.warn(
        `[env-dna:fallback] beat=${input.beatId} has no locationId binding — using first location "${input.visualWorld.locations[0]!.label}" as fallback`,
      );
    }
    return { location: input.visualWorld.locations[0]!, wasFallback: true };
  }
  return { location: null, wasFallback: false };
}
