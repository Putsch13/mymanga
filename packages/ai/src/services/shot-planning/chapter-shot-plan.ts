/**
 * Chapter Shot Plan — Sprint B (façade)
 *
 * Produit un **plan narratif lisible** des 70-75 cases avant génération FAL.
 * C'est l'équivalent d'un pitch storyboard textuel que l'IA s'engage à
 * respecter pour tout le chapitre.
 *
 * Implémentation découpée dans `_chapter-shot-plan/*`.
 */

import { buildHeadline, categorize } from "./_chapter-shot-plan/categorize";
import { computeDistribution } from "./_chapter-shot-plan/distribution";
import { buildHumanReadable } from "./_chapter-shot-plan/human-readable";
import { evaluateReliability } from "./_chapter-shot-plan/reliability";
import type {
  ChapterShotPlan,
  ChapterShotPlanInput,
  ShotPlanEntry,
} from "./_chapter-shot-plan/types";

export type {
  ChapterShotPlan,
  ChapterShotPlanInput,
  CutawayPlan,
  CutawayQaResult,
  NarrativeCutawayPanel,
  NarrativeCutawayType,
  ShotCategory,
  ShotPlanDistribution,
  ShotPlanEntry,
  ShotPlanReliability,
  ShotPlanWarning,
} from "./_chapter-shot-plan/types";
export { buildCutawayPlan, runCutawayQa } from "./_chapter-shot-plan/cutaway-plan";
export { SHOT_PLAN_THRESHOLDS } from "./_chapter-shot-plan/reliability";

export function buildChapterShotPlan(input: ChapterShotPlanInput): ChapterShotPlan {
  const entries: ShotPlanEntry[] = input.blueprints.map((bp) => {
    const category = categorize(bp);
    return {
      panelNumber: bp.panelNumber ?? (bp.panelIndex != null ? bp.panelIndex + 1 : 0),
      pageNumber: bp.pageNumber ?? null,
      headline: buildHeadline(bp, category),
      category,
      subjectFocus: bp.subjectFocus,
      shotType: bp.shotType,
      cutawayType: bp.cutawayType,
      contractualCritical: Boolean(bp.contractualCritical),
      criticality: bp.criticality,
    };
  });

  const distribution = computeDistribution(entries);
  const reliability = evaluateReliability(distribution, entries);

  const planWithoutText: Omit<ChapterShotPlan, "humanReadable"> = {
    projectTitle: input.projectTitle ?? null,
    chapterTitle: input.chapterTitle ?? null,
    entries,
    distribution,
    reliability,
  };

  return {
    ...planWithoutText,
    humanReadable: buildHumanReadable(planWithoutText),
  };
}
