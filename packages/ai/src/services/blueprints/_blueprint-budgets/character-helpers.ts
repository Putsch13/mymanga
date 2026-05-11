/**
 * Helpers de référencement de personnages dans un blueprint.
 *
 * `PremiumReadinessCastContext` capture les IDs studio (héros principal, héros 2,
 * déuteragoniste) afin que le score de readiness puisse pénaliser les plans qui
 * configurent un cast secondaire mais n'en exploitent pas les blueprints.
 */
import type { PanelBlueprintPremium } from "@manga-ai-studio/core";

export type PremiumReadinessCastContext = {
  heroCharacterId?: string | null;
  secondaryHeroCharacterId?: string | null;
  deuteragonistCharacterId?: string | null;
};

export function panelBlueprintReferencesCharacterId(
  bp: PanelBlueprintPremium,
  characterId: string,
): boolean {
  const cid = characterId.trim();
  if (!cid) return false;
  const inList = (arr: string[] | undefined) => (arr ?? []).some((x) => x === cid);
  if (inList(bp.mustShowCharacterIds)) return true;
  if (inList(bp.requiredCharacterIds)) return true;
  if (inList(bp.requiredCharacters)) return true;
  if (inList(bp.mayShowCharacterIds)) return true;
  if (bp.speakerAnchorCharacterId?.trim() === cid) return true;
  if (
    Array.isArray(bp.characterVisualDna) &&
    bp.characterVisualDna.some((d) => d.characterId === cid)
  ) {
    return true;
  }
  return false;
}

export function countPanelsReferencingCharacter(
  blueprints: PanelBlueprintPremium[],
  characterId: string | null | undefined,
): number {
  if (!characterId?.trim()) return 0;
  return blueprints.filter((bp) =>
    panelBlueprintReferencesCharacterId(bp, characterId),
  ).length;
}
