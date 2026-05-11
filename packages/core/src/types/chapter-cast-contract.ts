/**
 * P0.1 — ChapterCastContract : contrat de cast unifié pour un chapitre.
 *
 * Source de vérité pour l'identité des personnages dans le pipeline. Garantit :
 *   - Un héros principal unique et explicite (heroCharacterId)
 *   - Une distinction claire entre héros, personnages actifs, supports et PNJ
 *   - Le héros est toujours dans activeCharacterIds
 *   - focusCharacterIds ne remplace jamais heroCharacterId
 *   - secondaryHeroCharacterId (optionnel) : co‑protagoniste / héros 2 — reste
 *     « support » dans members (P2.7) mais est priorisé pour l'éditeur storyboard
 *     et les scènes duo.
 *
 * Le pipeline DOIT valider ce contrat AVANT de construire le storyboard.
 * Si le contrat est invalide, le job échoue tôt avec une erreur claire.
 *
 * Façade fine — l'implémentation est découpée dans `_chapter-cast-contract/*`.
 */

export {
  chapterCastContractSchema,
  chapterCastMemberSchema,
  chapterCastRoleSchema,
  chapterNpcGroupSchema,
} from "./_chapter-cast-contract/schemas";
export type {
  ChapterCastContract,
  ChapterCastMember,
  ChapterCastRole,
  ChapterNpcGroup,
} from "./_chapter-cast-contract/schemas";

export {
  CAST_CONTRACT_ERROR_CODES,
  ChapterCastContractError,
} from "./_chapter-cast-contract/error-codes";
export type {
  CastContractErrorCode,
  CastContractValidationIssue,
  CastContractValidationResult,
} from "./_chapter-cast-contract/error-codes";

export {
  applyHeroInvariant,
  assertStudioCastHeroInvariants,
  validateStudioCastHeroInvariants,
} from "./_chapter-cast-contract/hero-invariants";
export type { HeroInvariantSelectionInput } from "./_chapter-cast-contract/hero-invariants";

export {
  assertValidChapterCastContract,
  validateChapterCastContract,
} from "./_chapter-cast-contract/validate";

export { buildChapterCastContract } from "./_chapter-cast-contract/build";
export type { BuildChapterCastContractInput } from "./_chapter-cast-contract/build";

export {
  formatCastContractLog,
  getCastRole,
  isActiveInCast,
  isHeroInCast,
  orderedEditorHeroCharacterIds,
} from "./_chapter-cast-contract/queries";
