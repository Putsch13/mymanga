import type { CanonicalChapterProductionPlan } from "./canonical-production-plan";
import type { ChapterFormat } from "./production-rules";
import { buildCanonicalChapterProductionPlan } from "./build-canonical-production-plan";

export interface EnsureCanonicalProductionPlanInput {
  projectId: string;
  chapterId: string;
  chapterNumber: number;
  chapterTitle: string;
  format: ChapterFormat;
  /** Outline normalisable (productionOutline persisté, estimate, etc.) */
  rawOutline: unknown;
  /**
   * Si true : échec QA canonique après auto-repair → exception.
   * À utiliser en premium-only / prod stricte.
   */
  strictQa?: boolean;
}

/**
 * Point d’entrée unique : outline → plan canonique QA-compatible.
 * `productionPlan` historique n’est pas utilisé ici : l’outline résolu doit
 * déjà refléter le contrat studio (voir `resolveProductionOutlineForPremiumPipeline`).
 */
export function ensureCanonicalProductionPlan(
  input: EnsureCanonicalProductionPlanInput,
): CanonicalChapterProductionPlan {
  const plan = buildCanonicalChapterProductionPlan({
    chapterId: input.chapterId,
    projectId: input.projectId,
    chapterNumber: input.chapterNumber,
    chapterTitle: input.chapterTitle,
    format: input.format,
    rawOutline: input.rawOutline,
  });

  if (input.strictQa && !plan.qa.valid) {
    throw new Error(
      `canonical_production_plan_qa_failed: ${plan.qa.errors.join(" | ")}`,
    );
  }

  return plan;
}
