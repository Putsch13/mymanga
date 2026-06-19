import {
  CAST_CONTRACT_ERROR_CODES,
  ChapterCastContractError,
  type CastContractValidationIssue,
  type CastContractValidationResult,
} from "./error-codes";
import { uniqueStringIds } from "./utils";

/**
 * P0.2 — Garantit que le héros principal est présent dans active, core et locked.
 * À appeler lors de la persistance studio ou avant launch/estimate premium.
 */
export type HeroInvariantSelectionInput = {
  heroCharacterId?: string | null;
  secondaryHeroCharacterId?: string | null;
  deuteragonistCharacterId?: string | null;
  coreCastCharacterIds?: readonly string[] | null;
  activeCharacterIds?: readonly string[] | null;
  lockedCharacterIds?: readonly string[] | null;
  speakingCharacterIds?: readonly string[] | null;
  evolvingCharacterIds?: readonly string[] | null;
  antagonistCharacterIds?: readonly string[] | null;
  recurringNpcIds?: readonly string[] | null;
};

export function applyHeroInvariant<T extends HeroInvariantSelectionInput>(
  selection: T,
  heroCharacterId: string,
): T {
  const hero = heroCharacterId.trim();
  if (!hero) return selection;
  return {
    ...selection,
    heroCharacterId: hero,
    activeCharacterIds: uniqueStringIds([
      ...(selection.activeCharacterIds ?? []),
      hero,
    ]),
    coreCastCharacterIds: uniqueStringIds([
      ...(selection.coreCastCharacterIds ?? []),
      hero,
    ]),
    lockedCharacterIds: uniqueStringIds([
      ...(selection.lockedCharacterIds ?? []),
      hero,
    ]),
  };
}

/**
 * P0.2 — Valide les invariants studio (héros dans active + core + locked,
 * co-héros ≠ héros) puis optionnellement le ChapterCastContract construit.
 */
export function validateStudioCastHeroInvariants(
  selection: HeroInvariantSelectionInput,
): CastContractValidationResult {
  const issues: CastContractValidationIssue[] = [];
  const hero = selection.heroCharacterId?.trim();
  if (!hero) {
    issues.push({
      code: CAST_CONTRACT_ERROR_CODES.HERO_MISSING,
      message: "heroCharacterId is required for cast invariants",
    });
    return { ok: false, issues };
  }

  const active = new Set(uniqueStringIds(selection.activeCharacterIds));
  const core = new Set(uniqueStringIds(selection.coreCastCharacterIds));
  const locked = new Set(uniqueStringIds(selection.lockedCharacterIds));

  if (!active.has(hero)) {
    issues.push({
      code: CAST_CONTRACT_ERROR_CODES.HERO_NOT_IN_ACTIVE,
      message: `heroCharacterId=${hero} must be in activeCharacterIds`,
      characterId: hero,
    });
  }
  if (!core.has(hero)) {
    issues.push({
      code: CAST_CONTRACT_ERROR_CODES.HERO_NOT_IN_CORE_CAST,
      message: `heroCharacterId=${hero} must be in coreCastCharacterIds`,
      characterId: hero,
    });
  }
  if (!locked.has(hero)) {
    issues.push({
      code: CAST_CONTRACT_ERROR_CODES.HERO_NOT_IN_LOCKED,
      message: `heroCharacterId=${hero} must be in lockedCharacterIds`,
      characterId: hero,
    });
  }

  const secondary = selection.secondaryHeroCharacterId?.trim();
  if (secondary && secondary === hero) {
    issues.push({
      code: CAST_CONTRACT_ERROR_CODES.SECONDARY_SAME_AS_HERO,
      message: "secondaryHeroCharacterId must differ from heroCharacterId",
      characterId: secondary,
    });
  }
  if (secondary && !active.has(secondary)) {
    issues.push({
      code: CAST_CONTRACT_ERROR_CODES.SECONDARY_NOT_IN_ACTIVE,
      message: `secondaryHeroCharacterId=${secondary} must be in activeCharacterIds`,
      characterId: secondary,
    });
  }

  return { ok: issues.length === 0, issues };
}

export function assertStudioCastHeroInvariants(
  selection: HeroInvariantSelectionInput,
): void {
  const r = validateStudioCastHeroInvariants(selection);
  if (!r.ok) {
    throw new ChapterCastContractError(r);
  }
}
