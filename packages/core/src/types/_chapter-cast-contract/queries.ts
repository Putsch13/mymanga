import type { ChapterCastContract, ChapterCastRole } from "./schemas";

/** Log formaté pour debug/observabilité. */
export function formatCastContractLog(contract: ChapterCastContract): string {
  const hero = contract.heroCharacterId;
  const secondary = contract.secondaryHeroCharacterId?.trim();
  const active = contract.activeCharacterIds.join(",");
  const support = contract.supportCharacterIds.join(",") || "none";
  const npcGroups = contract.npcGroups.map((g) => g.label).join(",") || "none";
  const secondaryPart = secondary && secondary.length > 0 ? ` secondary=${secondary}` : "";
  return `[cast-contract] hero=${hero}${secondaryPart} active=${active} support=${support} npcGroups=${npcGroups}`;
}

/**
 * Ordre des IDs passés au manga editor / storyboard : héros, héros 2 si défini,
 * puis le reste des actifs (stable).
 */
export function orderedEditorHeroCharacterIds(
  contract: ChapterCastContract,
): string[] {
  const hero = contract.heroCharacterId;
  const sec = contract.secondaryHeroCharacterId?.trim();
  if (sec && sec.length > 0 && sec !== hero) {
    const rest = contract.activeCharacterIds.filter(
      (id) => id !== hero && id !== sec,
    );
    return [hero, sec, ...rest];
  }
  return [...contract.activeCharacterIds];
}

/** Récupère le rôle d'un personnage dans le cast. */
export function getCastRole(
  contract: ChapterCastContract,
  characterId: string,
): ChapterCastRole | null {
  if (characterId === contract.heroCharacterId) return "hero";
  const member = contract.members.find((m) => m.characterId === characterId);
  return member?.role ?? null;
}

/** Vérifie si un personnage est le héros. */
export function isHeroInCast(
  contract: ChapterCastContract,
  characterId: string,
): boolean {
  return characterId === contract.heroCharacterId;
}

/** Vérifie si un personnage est actif dans ce chapitre. */
export function isActiveInCast(
  contract: ChapterCastContract,
  characterId: string,
): boolean {
  return contract.activeCharacterIds.includes(characterId);
}
