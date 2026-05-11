/**
 * production-plan.ts
 *
 * Builders et normalisations autour du `ProductionPlan` chapitre :
 *   - `buildProductionPlanFromOutline`
 *   - `enforceMinimumChapterImages`
 *   - `normalizeChapterImageCounts`
 *
 * Extrait de `chapter-studio-helpers.ts` (audit-v9, < 500 lignes/fichier).
 */

import { PREMIUM_PANEL_RANGE } from "../../premium-panel-range";
import {
  chapterImageCountSchema,
  productionPlanSchema,
  type ChapterImageCount,
  type ProductionOutline,
  type ProductionPlan,
  type ProductionPlanAdjustment,
  type ProductionPlanPage,
} from "../chapter-studio";
import { sum } from "./_utils";

export function buildProductionPlanFromOutline(
  outline: ProductionOutline,
  input?: {
    minimumImages?: number;
    maxPanelsPerPage?: number;
    lockedCharacters?: string[];
  },
): ProductionPlan {
  const minimumImages = Math.max(1, input?.minimumImages ?? PREMIUM_PANEL_RANGE.min);
  const maxPanelsPerPage = Math.max(3, input?.maxPanelsPerPage ?? 6);
  const panels = outline.beats.map((beat) => Math.max(1, beat.estimatedPanels));
  const estimatedImages = sum(panels);
  const pages: ProductionPlanPage[] = [];
  let pageNumber = 1;
  let currentPanels = 0;
  let currentBeatIds: string[] = [];
  let currentCriticalCount = 0;

  for (const beat of outline.beats) {
    const beatPanels = Math.max(1, beat.estimatedPanels);
    if (currentPanels > 0 && currentPanels + beatPanels > maxPanelsPerPage) {
      pages.push({
        pageNumber,
        beatIds: currentBeatIds,
        panelCount: currentPanels,
        imageTarget: currentPanels,
        criticalPanelCount: currentCriticalCount,
      });
      pageNumber += 1;
      currentPanels = 0;
      currentBeatIds = [];
      currentCriticalCount = 0;
    }

    currentPanels += beatPanels;
    currentBeatIds.push(beat.beatId);
    if (beat.criticality === "high" || beat.criticality === "critical") {
      currentCriticalCount += 1;
    }
  }

  if (currentPanels > 0) {
    pages.push({
      pageNumber,
      beatIds: currentBeatIds,
      panelCount: currentPanels,
      imageTarget: currentPanels,
      criticalPanelCount: currentCriticalCount,
    });
  }

  const criticalPanels = outline.beats
    .filter((beat) => beat.criticality === "high" || beat.criticality === "critical")
    .map((beat) => beat.beatId);

  const compressionRisks = outline.beats
    .filter((beat) => beat.estimatedPanels <= 2 && beat.indispensabilityScore >= 75)
    .map((beat) => `${beat.beatId}: beat dense avec peu de panels estimés`);

  return enforceMinimumChapterImages(
    {
      pageCount: pages.length,
      pages,
      panelsPerPage: pages.map((page) => page.panelCount),
      estimatedImages,
      targetImages: estimatedImages,
      minimumImages,
      criticalPanels,
      lockedCharacters: input?.lockedCharacters ?? [],
      compressionRisks,
      enrichmentAdjustments: [],
      imageBudgetStatus: estimatedImages < minimumImages ? "under_target" : "on_target",
    },
    outline,
  );
}

export function enforceMinimumChapterImages(
  plan: ProductionPlan,
  outline?: ProductionOutline,
): ProductionPlan {
  if (plan.targetImages >= plan.minimumImages) {
    return productionPlanSchema.parse({
      ...plan,
      imageBudgetStatus: plan.targetImages > plan.minimumImages ? "over_target" : "on_target",
    });
  }

  const missing = plan.minimumImages - plan.targetImages;
  const adjustments: ProductionPlanAdjustment[] = [];
  const candidateBeats =
    outline?.beats
      ?.slice()
      .sort((a, b) => {
        const scoreA =
          a.indispensabilityScore +
          (a.criticality === "critical" ? 15 : a.criticality === "high" ? 8 : 0) -
          a.redundancyRisk;
        const scoreB =
          b.indispensabilityScore +
          (b.criticality === "critical" ? 15 : b.criticality === "high" ? 8 : 0) -
          b.redundancyRisk;
        return scoreB - scoreA;
      }) ?? [];

  for (let index = 0; index < missing; index += 1) {
    const beat = candidateBeats[index % Math.max(candidateBeats.length, 1)];
    adjustments.push({
      type:
        index % 5 === 0
          ? "establishing_shot"
          : index % 5 === 1
            ? "reaction_shot"
            : index % 5 === 2
              ? "transition_shot"
              : index % 5 === 3
                ? "beat_split"
                : "emotional_extension",
      beatId: beat?.beatId ?? null,
      reason: beat
        ? `Enrichissement narratif du beat ${beat.beatId} pour atteindre le minimum de ${plan.minimumImages} images`
        : `Enrichissement global pour atteindre le minimum de ${plan.minimumImages} images`,
      addedImages: 1,
    });
  }

  return productionPlanSchema.parse({
    ...plan,
    targetImages: plan.targetImages + missing,
    enrichmentAdjustments: [...plan.enrichmentAdjustments, ...adjustments],
    imageBudgetStatus: "on_target",
  });
}

export function normalizeChapterImageCounts(
  input?: Partial<ChapterImageCount> | null,
): ChapterImageCount {
  const normalized = chapterImageCountSchema.parse({
    estimatedImages: input?.estimatedImages ?? 0,
    targetImages: input?.targetImages ?? input?.estimatedImages ?? 0,
    minimumImages: input?.minimumImages ?? PREMIUM_PANEL_RANGE.min,
    generatedImages: input?.generatedImages ?? 0,
    acceptedImages: input?.acceptedImages ?? 0,
    rejectedImages: input?.rejectedImages ?? 0,
    missingImages: 0,
  });

  return {
    ...normalized,
    missingImages: Math.max(0, normalized.minimumImages - normalized.acceptedImages),
  };
}
