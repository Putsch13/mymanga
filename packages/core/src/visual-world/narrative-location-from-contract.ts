import type { VisualWorldContract, VisualWorldLocation } from "./visual-world-contract";

/**
 * Lieu visuel obligatoire pour un beat (premium) — lève si binding ou location absents.
 */
export function requireVisualWorldLocationForBeat(
  visualWorld: VisualWorldContract,
  beatId: string,
): VisualWorldLocation {
  const binding = visualWorld.beatBindings.find((b) => b.beatId === beatId);
  if (!binding?.locationId) {
    throw new Error(`premium_missing_beat_location_binding:${beatId}`);
  }
  const loc = visualWorld.locations.find((l) => l.id === binding.locationId);
  if (!loc) {
    throw new Error(`premium_missing_beat_location:${beatId}:locationId=${binding.locationId}`);
  }
  return loc;
}

/** Chaîne de décor / lieu pour le bundle chapitre (outline, scènes legacy). */
export function sceneStringFromVisualWorldLocation(loc: VisualWorldLocation): string {
  const label = loc.label.trim();
  const desc = loc.description.trim();
  if (label && desc) return `${label} — ${desc}`;
  return label || desc || "lieu";
}

/** Lieu narratif pour un beat si un binding existe dans le contrat monde visuel. */
export function beatLocationSceneStringFromVisualWorld(
  visualWorld: VisualWorldContract,
  beatId: string,
): string | null {
  const binding = visualWorld.beatBindings.find((b) => b.beatId === beatId);
  if (!binding?.locationId) return null;
  const loc = visualWorld.locations.find((l) => l.id === binding.locationId);
  if (!loc) return null;
  return sceneStringFromVisualWorldLocation(loc);
}

/** Pool cyclable (remplace `inferLocations` quand le contrat IA est présent). */
export function locationSceneStringsFromVisualWorldContract(
  visualWorld: VisualWorldContract,
): string[] {
  return visualWorld.locations.map((l) => sceneStringFromVisualWorldLocation(l));
}
