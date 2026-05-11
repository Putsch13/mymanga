/**
 * chapter-studio-helpers — façade publique des helpers studio chapitre.
 *
 * Le module a été splitté (audit-v9, < 500 lignes/fichier). Tous les imports
 * historiques restent valides via ce fichier.
 *
 * Couches :
 *   - `chapter-studio-helpers/production-plan` : production plan / image counts
 *   - `chapter-studio-helpers/readiness`       : `buildChapterReadinessReport`
 *   - `chapter-studio-helpers/snapshot`        : status / transitions / snapshot
 *   - `chapter-studio-helpers/legacy-bridge`   : adaptateurs legacy ↔ studio
 */

export {
  buildProductionPlanFromOutline,
  enforceMinimumChapterImages,
  normalizeChapterImageCounts,
} from "./chapter-studio-helpers/production-plan";

export { buildChapterReadinessReport } from "./chapter-studio-helpers/readiness";

export {
  resolveChapterStudioStatus,
  canTransitionChapterStudioStatus,
  createEmptyChapterStudioSnapshot,
  updateChapterStudioSnapshot,
} from "./chapter-studio-helpers/snapshot";

export {
  buildLegacyApprovedOutlineFromStudio,
  buildApprovedOutlineFromProductionOutline,
  buildProductionContractFromApprovedOutline,
  buildStudioSnapshotFromLegacy,
} from "./chapter-studio-helpers/legacy-bridge";
