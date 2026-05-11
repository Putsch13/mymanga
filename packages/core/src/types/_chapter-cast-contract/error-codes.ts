export const CAST_CONTRACT_ERROR_CODES = {
  HERO_MISSING: "E_CAST_HERO_MISSING",
  HERO_NOT_IN_ACTIVE: "E_CAST_HERO_NOT_IN_ACTIVE",
  ACTIVE_EMPTY: "E_CAST_ACTIVE_EMPTY",
  SUPPORT_NOT_IN_ACTIVE: "E_CAST_SUPPORT_NOT_IN_ACTIVE",
  DUPLICATE_HERO: "E_CAST_DUPLICATE_HERO",
  MEMBER_NOT_IN_ACTIVE: "E_CAST_MEMBER_NOT_IN_ACTIVE",
  /** P2.7 — Plusieurs personnages ont le rôle "hero" alors qu'un seul est autorisé */
  MULTIPLE_PROTAGONISTS: "E_CAST_MULTIPLE_PROTAGONISTS",
  /** P2.7 — Le héros officiel a un rôle autre que "hero" dans members */
  HERO_ROLE_MISMATCH: "E_CAST_HERO_ROLE_MISMATCH",
  /** P2.7 — Un personnage non-héros a le rôle "hero" */
  NON_HERO_AS_PROTAGONIST: "E_CAST_NON_HERO_AS_PROTAGONIST",
  /** Héros secondaire identique au héros principal */
  SECONDARY_SAME_AS_HERO: "E_CAST_SECONDARY_SAME_AS_HERO",
  /** Héros secondaire absent des actifs */
  SECONDARY_NOT_IN_ACTIVE: "E_CAST_SECONDARY_NOT_IN_ACTIVE",
  /** Héros secondaire inconnu du cast fourni */
  SECONDARY_UNKNOWN_CHARACTER: "E_CAST_SECONDARY_UNKNOWN_CHARACTER",
  /** P0.2 — héros absent de coreCastCharacterIds (studio) */
  HERO_NOT_IN_CORE_CAST: "E_CAST_HERO_NOT_IN_CORE_CAST",
  /** P0.2 — héros absent de lockedCharacterIds (studio) */
  HERO_NOT_IN_LOCKED: "E_CAST_HERO_NOT_IN_LOCKED",
} as const;

export type CastContractErrorCode =
  (typeof CAST_CONTRACT_ERROR_CODES)[keyof typeof CAST_CONTRACT_ERROR_CODES];

export interface CastContractValidationIssue {
  code: CastContractErrorCode;
  message: string;
  characterId?: string;
}

export interface CastContractValidationResult {
  ok: boolean;
  issues: CastContractValidationIssue[];
}

/** Assertion : lance une erreur si le contrat est invalide. */
export class ChapterCastContractError extends Error {
  code: string = "E_CAST_CONTRACT_INVALID";
  issues: CastContractValidationIssue[];
  constructor(result: CastContractValidationResult) {
    const summary = result.issues.map((i) => `${i.code}: ${i.message}`).join(" | ");
    super(`chapter_cast_contract_invalid: ${summary}`);
    this.name = "ChapterCastContractError";
    this.issues = result.issues;
  }
}
