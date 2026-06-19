/**
 * Service partagé pour le contrat premium de chapitre.
 * Centralise toute reconstruction premium et supprime les ponts legacy dispersés.
 *
 * Le module a été splitté (audit-v9) pour rester sous 500 lignes.
 * Tous les imports historiques restent valides via cette façade.
 *
 * Couches :
 *   - `premium-chapter-contract/types`                   : interfaces + clés premium
 *   - `premium-chapter-contract/build`                   : reconstruction async
 *   - `premium-chapter-contract/merge-validate`          : merge / validate / assert
 *   - `premium-chapter-contract/reconcile-and-narrative` : réconciliation + cohérence narrative
 *   - `premium-chapter-contract/job-input`               : `buildGenerationJobInputFromSnapshot` + erreurs
 */

export type {
  BuildPremiumContractInput,
  GenerationJobInputOptions,
  NarrativeContractConsistencyResult,
  PremiumChapterContractResult,
  PremiumContractAssertionResult,
  PremiumContractCoverage,
  PremiumContractValidationResult,
  PremiumProductionPlanKey,
} from "./premium-chapter-contract/types";

export { PREMIUM_PRODUCTION_PLAN_KEYS } from "./premium-chapter-contract/types";

export { buildPremiumChapterContractFromApprovedOutline } from "./premium-chapter-contract/build";

export {
  assertPremiumContract,
  mergePremiumContractIntoSnapshot,
  mergePremiumProductionPlan,
  mergePremiumStudioDraft,
  resolveApprovedOutlineFromSnapshot,
  validatePremiumContract,
} from "./premium-chapter-contract/merge-validate";

export {
  reconcileIncomingPremiumContract,
  validateNarrativeContractConsistency,
} from "./premium-chapter-contract/reconcile-and-narrative";

export {
  IncompletePlanError,
  InvalidBlueprintsError,
  buildGenerationJobInputFromSnapshot,
} from "./premium-chapter-contract/job-input";
