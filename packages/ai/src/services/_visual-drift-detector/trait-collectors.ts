import type { DriftTraitMismatch } from "./types";

export function pushMissingTrait(
  list: DriftTraitMismatch[],
  reasons: string[],
  characterName: string,
  trait: string,
  expected: string,
  reason: string,
) {
  list.push({ characterName, trait, expected, reason });
  reasons.push(`${characterName}: ${reason}`);
}

export function pushConflictingTrait(
  list: DriftTraitMismatch[],
  reasons: string[],
  characterName: string,
  trait: string,
  expected: string,
  actual: string | null | undefined,
  reason: string,
) {
  list.push({ characterName, trait, expected, actual: actual ?? null, reason });
  reasons.push(`${characterName}: ${reason}`);
}
