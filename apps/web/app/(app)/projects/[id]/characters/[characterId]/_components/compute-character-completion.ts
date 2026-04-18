/**
 * P5.4 — Score de complétion d'une fiche personnage.
 * Pure function : consommée par le header de la page pour guider l'user.
 */

import type { CharacterPayload } from "./character-types";

export function computeCharacterCompletionScore(character: CharacterPayload): number {
  const checks: boolean[] = [
    Boolean(character.name),
    Boolean(character.roleType),
    Boolean(character.gender),
    Boolean(character.biography),
    Boolean(character.appearance),
    Boolean(character.hairColor),
    Boolean(character.eyeColor),
    Boolean(character.outfitDefault),
    Boolean(character.objective),
    Boolean(character.fear),
    (character.traits ?? []).length > 0,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

export function isCharacterAdult(character: CharacterPayload): boolean {
  return character.adultVerified && (character.age ?? 0) >= 18;
}
