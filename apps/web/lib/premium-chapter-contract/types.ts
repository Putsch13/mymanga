/**
 * Types et constantes du contrat premium chapitre. Extrait de
 * `apps/web/lib/premium-chapter-contract.ts` (audit-v9).
 */

import type {
  ApprovedChapterOutline,
  ChapterStudioSnapshot,
  ProductionOutline,
  ProductionPlan,
  VisualWorldContract,
  buildChapterReadinessReport,
} from "@manga-ai-studio/core";

/**
 * Liste exhaustive des champs premium du productionPlan.
 * Utiliser cette constante partout où l'on merge/valide/persiste.
 */
export const PREMIUM_PRODUCTION_PLAN_KEYS = [
  "panelBlueprints",
  "focusDistribution",
  "shotDistribution",
  "focusBudget",
  "propCoverage",
  "enemyCoverage",
  "npcCoverage",
  "cutawayCoverage",
  "dialogueAnchorCoverage",
  "heroCenterRatio",
  "premiumReadinessScore",
  "objectStateTimeline",
] as const;

export type PremiumProductionPlanKey = typeof PREMIUM_PRODUCTION_PLAN_KEYS[number];

export interface PremiumContractCoverage {
  focusDistribution?: Record<string, number>;
  propCoverage?: { covered: string[]; missing: string[] };
  enemyCoverage?: { panelCount: number; beatsCovered: string[] };
  npcCoverage?: { panelCount: number; avgNpcCount: number };
  cutawayCoverage?: { count: number; ratio: number };
  dialogueAnchorCoverage?: { anchored: number; floating: number };
  heroCenterRatio?: number;
  premiumReadinessScore?: number;
}

export interface PremiumChapterContractResult {
  productionOutline: ProductionOutline;
  productionPlan: ProductionPlan;
  readinessReport: ReturnType<typeof buildChapterReadinessReport> | null;
  panelBlueprints: unknown[];
  coverage: PremiumContractCoverage;
  /** Monde visuel IA composé en même temps que le contrat (persisté au snapshot). */
  visualWorldContract?: VisualWorldContract;
}

export interface BuildPremiumContractInput {
  approvedOutline: ApprovedChapterOutline;
  /** Pour aligner le plan canonique avec le chapitre / projet persistés. */
  chapterId?: string;
  projectId?: string;
  projectFormat?: "manga" | "webtoon" | "simple" | null;
  projectGenre?: string | null;
  projectTone?: string | null;
  chapterNumber?: number | null;
  chapterTitle?: string | null;
  chapterSummary?: string | null;
  cliffhanger?: string | null;
  userIntent?: string | null;
  heroCharacterId?: string | null;
  existingStudioData?: Record<string, unknown> | null;
  /**
   * P2.1 — contrainte remontée depuis `Chapter.minimumImages` (plancher premium 70).
   * Si omis, le builder retombe sur 75 pour rester compatible avec l'ancien
   * comportement. Quand fourni, la reconstruction du plan garantit que le
   * nombre de blueprints atteint cette cible.
   */
  minimumPanels?: number | null;
  /**
   * Snapshot studio courant (canons personnages) pour hydrater `characterVisualDna`
   * sur les blueprints après merge.
   */
  studioSnapshot?: ChapterStudioSnapshot | null;
  /** Héros 2 / co‑protagoniste (snapshot studio) — hydratation DNA alignée launch/estimate. */
  secondaryHeroCharacterId?: string | null;
}

export interface PremiumContractAssertionResult {
  ok: boolean;
  missing: string[];
  message: string;
}

export interface GenerationJobInputOptions {
  chapterId: string;
  source: string;
  snapshot: ChapterStudioSnapshot;
  approvedOutline: ApprovedChapterOutline;
  heroCharacterId?: string | null;
  /** Co-protagoniste / héros 2 (studio `characterSelection`). */
  secondaryHeroCharacterId?: string | null;
  selectedPlotLabel?: string | null;
  creativityControls?: Record<string, unknown> | null;
  focusCharacterIds?: string[];
  activeNpcIds?: string[];
  activeCreatureIds?: string[];
  locationIds?: string[];
  estimateContext?: Record<string, unknown> | null;
}

export interface PremiumContractValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export interface NarrativeContractConsistencyResult {
  ok: boolean;
  issues: string[];
}
