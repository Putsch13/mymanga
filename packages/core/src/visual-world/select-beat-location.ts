import type { VisualWorldContract, VisualWorldLocation } from "./visual-world-contract";

/**
 * Lieu visuel canon pour un beat — premium strict (pas de fallback silencieux).
 */
export function selectBeatLocationFromVisualWorld(input: {
  beatId: string;
  visualWorld: VisualWorldContract;
}): VisualWorldLocation {
  const binding = input.visualWorld.beatBindings.find((b) => b.beatId === input.beatId);
  if (!binding?.locationId) {
    throw new Error(`premium_missing_beat_location:${input.beatId}`);
  }
  const loc = input.visualWorld.locations.find((l) => l.id === binding.locationId);
  if (!loc) {
    throw new Error(`premium_missing_location_record:${binding.locationId}`);
  }
  return loc;
}
