import {
  CAST_CONTRACT_ERROR_CODES,
  ChapterCastContractError,
  type CastContractValidationIssue,
  type CastContractValidationResult,
} from "./error-codes";
import type { ChapterCastContract } from "./schemas";

/**
 * Valide un ChapterCastContract.
 * Retourne les issues trouvées. Si ok=false, le pipeline doit s'arrêter.
 */
export function validateChapterCastContract(
  contract: ChapterCastContract,
): CastContractValidationResult {
  const issues: CastContractValidationIssue[] = [];

  if (!contract.heroCharacterId?.trim()) {
    issues.push({
      code: CAST_CONTRACT_ERROR_CODES.HERO_MISSING,
      message: "heroCharacterId is required — the chapter must have exactly one hero",
    });
  }

  if (!contract.activeCharacterIds?.length) {
    issues.push({
      code: CAST_CONTRACT_ERROR_CODES.ACTIVE_EMPTY,
      message: "activeCharacterIds must contain at least the hero",
    });
  }

  if (
    contract.heroCharacterId
    && contract.activeCharacterIds?.length
    && !contract.activeCharacterIds.includes(contract.heroCharacterId)
  ) {
    issues.push({
      code: CAST_CONTRACT_ERROR_CODES.HERO_NOT_IN_ACTIVE,
      message: `heroCharacterId=${contract.heroCharacterId} must be in activeCharacterIds`,
      characterId: contract.heroCharacterId,
    });
  }

  const secondaryTrimmed = contract.secondaryHeroCharacterId?.trim();
  const activeSet = new Set(contract.activeCharacterIds ?? []);

  if (secondaryTrimmed) {
    if (secondaryTrimmed === contract.heroCharacterId) {
      issues.push({
        code: CAST_CONTRACT_ERROR_CODES.SECONDARY_SAME_AS_HERO,
        message: "secondaryHeroCharacterId must differ from heroCharacterId",
        characterId: secondaryTrimmed,
      });
    }
    if (!activeSet.has(secondaryTrimmed)) {
      issues.push({
        code: CAST_CONTRACT_ERROR_CODES.SECONDARY_NOT_IN_ACTIVE,
        message: `secondaryHeroCharacterId=${secondaryTrimmed} must be in activeCharacterIds`,
        characterId: secondaryTrimmed,
      });
    }
  }

  for (const supportId of contract.supportCharacterIds ?? []) {
    if (!activeSet.has(supportId)) {
      issues.push({
        code: CAST_CONTRACT_ERROR_CODES.SUPPORT_NOT_IN_ACTIVE,
        message: `supportCharacterId=${supportId} must be in activeCharacterIds`,
        characterId: supportId,
      });
    }
  }

  const heroes = (contract.members ?? []).filter((m) => m.role === "hero");
  if (heroes.length > 1) {
    issues.push({
      code: CAST_CONTRACT_ERROR_CODES.DUPLICATE_HERO,
      message: `Found ${heroes.length} heroes in members — only one allowed`,
    });
  }

  for (const member of contract.members ?? []) {
    if (!activeSet.has(member.characterId)) {
      issues.push({
        code: CAST_CONTRACT_ERROR_CODES.MEMBER_NOT_IN_ACTIVE,
        message: `member ${member.name} (${member.characterId}) not in activeCharacterIds`,
        characterId: member.characterId,
      });
    }
  }

  // P2.7 — Le héros officiel doit avoir le rôle "hero" dans members
  if (contract.heroCharacterId && contract.members?.length) {
    const heroMember = contract.members.find(
      (m) => m.characterId === contract.heroCharacterId,
    );
    if (heroMember && heroMember.role !== "hero") {
      issues.push({
        code: CAST_CONTRACT_ERROR_CODES.HERO_ROLE_MISMATCH,
        message: `heroCharacterId=${contract.heroCharacterId} has role="${heroMember.role}" but should be "hero"`,
        characterId: contract.heroCharacterId,
      });
    }
  }

  // P2.7 — Aucun personnage non-héros ne doit avoir le rôle "hero"
  for (const member of contract.members ?? []) {
    if (
      member.role === "hero"
      && member.characterId !== contract.heroCharacterId
    ) {
      issues.push({
        code: CAST_CONTRACT_ERROR_CODES.NON_HERO_AS_PROTAGONIST,
        message: `member ${member.name} (${member.characterId}) has role="hero" but is not heroCharacterId`,
        characterId: member.characterId,
      });
    }
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}

export function assertValidChapterCastContract(
  contract: ChapterCastContract,
): void {
  const result = validateChapterCastContract(contract);
  if (!result.ok) {
    throw new ChapterCastContractError(result);
  }
}
