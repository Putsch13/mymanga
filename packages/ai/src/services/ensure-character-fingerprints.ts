/**
 * B2-1 — Helper centralisé pour charger et garantir la disponibilité
 * des CharacterFingerprints pour tous les personnages d'un chapitre.
 */

import type { PrismaClient } from "@manga-ai-studio/db";
import type { CharacterFingerprint } from "@manga-ai-studio/core";

export type CharacterFingerprintMap = Record<string, CharacterFingerprint>;

/**
 * Charge les fingerprints de tous les personnages demandés depuis la DB.
 * Loggue un warning si un personnage n'a pas de fingerprint disponible.
 *
 * @param characterIds - IDs des personnages à charger
 * @param prisma - Instance Prisma
 * @returns Map characterId → CharacterFingerprint (uniquement ceux qui ont un fingerprint valide)
 */
export async function ensureCharacterFingerprints(
  characterIds: string[],
  prisma: PrismaClient,
): Promise<CharacterFingerprintMap> {
  if (characterIds.length === 0) return {};

  const characters = await prisma.character.findMany({
    where: { id: { in: characterIds } },
    select: {
      id: true,
      name: true,
      roleType: true,
      characterFingerprint: true,
    },
  });

  const result: CharacterFingerprintMap = {};

  for (const character of characters) {
    const fp = character.characterFingerprint;
    if (
      fp &&
      typeof fp === "object" &&
      !Array.isArray(fp) &&
      Object.keys(fp as object).length > 0
    ) {
      result[character.id] = fp as unknown as CharacterFingerprint;
    } else {
      console.warn(
        `[ensureCharacterFingerprints] WARN: character ${character.id} (${character.name}, role=${character.roleType ?? "unknown"}) has no fingerprint — visual consistency may be degraded`,
      );
    }
  }

  return result;
}

/**
 * Extrait le fingerprint d'un personnage depuis un Record déjà chargé.
 * Retourne null si absent.
 */
export function getFingerprintForCharacter(
  characterId: string,
  fingerprintMap: CharacterFingerprintMap,
): CharacterFingerprint | null {
  return fingerprintMap[characterId] ?? null;
}
