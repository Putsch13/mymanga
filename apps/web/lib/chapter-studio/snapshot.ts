/**
 * P5.3 — Snapshot studio (lecture, merge, patch, normalisation premium).
 * Extrait de lib/chapter-studio.ts — logique inchangée.
 */

import {
  aggregateChapterImageCounts,
  buildChapterReadinessReport,
  buildProductionPlanFromOutline,
  buildStudioSnapshotFromLegacy,
  type ChapterStudioData,
  type ChapterStudioSnapshot,
  updateChapterStudioSnapshot,
} from "@manga-ai-studio/core";
import type { Prisma } from "@manga-ai-studio/db";
import { asRecord } from "./utils";

export function readChapterStudioSnapshotFromOutline(input: {
  outline: unknown;
  chapterNumber?: number | null;
  chapterTitle?: string | null;
  chapterSummary?: string | null;
  cliffhanger?: string | null;
  userIntent?: string | null;
  studioStatus?: string | null;
  studioCurrentStep?: string | null;
  studioUpdatedAt?: Date | string | null;
  studioAutosaveVersion?: number | null;
  minimumImages?: number | null;
  generatedImages?: number | null;
  acceptedImages?: number | null;
  rejectedImages?: number | null;
  missingImages?: number | null;
  criticalPanelsCount?: number | null;
  criticalPanelsBlocked?: number | null;
  criticalPanelsMissingQa?: number | null;
  reviewBlockedReason?: string | null;
}): ChapterStudioSnapshot {
  const outlineRecord = asRecord(input.outline);
  const studio = asRecord(outlineRecord.studio);
  const hydrateStructuredFields = (snapshot: ChapterStudioSnapshot) => {
    const next = { ...snapshot };
    if (input.studioStatus && typeof input.studioStatus === "string") {
      next.status = input.studioStatus as ChapterStudioSnapshot["status"];
    }
    if (input.studioCurrentStep && typeof input.studioCurrentStep === "string") {
      next.currentStep = input.studioCurrentStep as ChapterStudioSnapshot["currentStep"];
    }
    if (input.studioUpdatedAt) {
      next.updatedAt = typeof input.studioUpdatedAt === "string" ? input.studioUpdatedAt : input.studioUpdatedAt.toISOString();
    }
    if (typeof input.studioAutosaveVersion === "number") {
      next.autosaveVersion = input.studioAutosaveVersion;
    }
    const currentReadiness = next.data.readinessReport ?? buildChapterReadinessReport(next);
    next.data = {
      ...next.data,
      readinessReport: {
        ...currentReadiness,
        imageCounts: aggregateChapterImageCounts({
          estimatedImages: currentReadiness.imageCounts.estimatedImages,
          targetImages: currentReadiness.imageCounts.targetImages,
          minimumImages: input.minimumImages ?? currentReadiness.imageCounts.minimumImages,
          generatedImages: input.generatedImages ?? currentReadiness.imageCounts.generatedImages,
          acceptedImages: input.acceptedImages ?? currentReadiness.imageCounts.acceptedImages,
          rejectedImages: input.rejectedImages ?? currentReadiness.imageCounts.rejectedImages,
        }),
      },
      qaReport: next.data.qaReport
        ? {
            ...next.data.qaReport,
            missingCriticalPanels: next.data.qaReport.missingCriticalPanels,
          }
        : next.data.qaReport,
    };
    return next;
  };

  if (Object.keys(studio).length > 0) {
    return hydrateStructuredFields(updateChapterStudioSnapshot(
      studio as ChapterStudioSnapshot,
      {},
      { transitionReason: "refresh_snapshot" },
    ));
  }

  const approvedOutline =
    outlineRecord.approvedOutline && typeof outlineRecord.approvedOutline === "object"
      ? (outlineRecord.approvedOutline as Prisma.JsonObject)
      : null;

  return hydrateStructuredFields(buildStudioSnapshotFromLegacy({
    approvedOutline: approvedOutline as never,
    chapterNumber: input.chapterNumber,
    chapterTitle: input.chapterTitle,
    chapterSummary: input.chapterSummary,
    cliffhanger: input.cliffhanger,
    userIntent: input.userIntent,
  }));
}

export function mergeChapterStudioIntoOutline(input: {
  outline: unknown;
  snapshot: ChapterStudioSnapshot;
  includeLegacyBridge?: boolean;
}) {
  const outlineRecord = asRecord(input.outline);
  const next = {
    ...outlineRecord,
    studio: {
      ...input.snapshot,
      data: {
        ...input.snapshot.data,
        readinessReport: {
          ...(input.snapshot.data.readinessReport ?? buildChapterReadinessReport(input.snapshot)),
          imageCounts: aggregateChapterImageCounts(
            input.snapshot.data.readinessReport?.imageCounts
            ?? buildChapterReadinessReport(input.snapshot).imageCounts,
          ),
        },
      },
    },
  } as Record<string, unknown>;

  if (input.includeLegacyBridge && input.snapshot.data.productionOutline) {
    const approved = buildStudioSnapshotFromLegacy({
      approvedOutline: null,
    });
    void approved;
  }

  return next as Prisma.InputJsonValue;
}

export function patchChapterStudioSnapshot(
  outline: unknown,
  patch: Partial<ChapterStudioData>,
  input?: {
    chapterNumber?: number | null;
    chapterTitle?: string | null;
    chapterSummary?: string | null;
    cliffhanger?: string | null;
    userIntent?: string | null;
    currentStep?: ChapterStudioSnapshot["currentStep"];
    transitionReason?: string;
  },
) {
  const snapshot = readChapterStudioSnapshotFromOutline({
    outline,
    chapterNumber: input?.chapterNumber,
    chapterTitle: input?.chapterTitle,
    chapterSummary: input?.chapterSummary,
    cliffhanger: input?.cliffhanger,
    userIntent: input?.userIntent,
  });

  const nextData = { ...patch };
  if (!nextData.productionPlan && nextData.productionOutline) {
    nextData.productionPlan = buildProductionPlanFromOutline(nextData.productionOutline, {
      lockedCharacters: nextData.characterSelection?.lockedCharacterIds ?? snapshot.data.characterSelection?.lockedCharacterIds ?? [],
    });
  }

  return updateChapterStudioSnapshot(snapshot, nextData, {
    currentStep: input?.currentStep,
    transitionReason: input?.transitionReason,
  });
}

/**
 * Normalise un snapshot studio pour garantir la cohérence premium.
 * - Préserve les champs enrichis premium au lieu d'écraser par buildStudioSnapshotFromLegacy
 * - Recalcule readinessReport si les compteurs runtime ont changé
 */
export function normalizePremiumStudioSnapshot(
  snapshot: ChapterStudioSnapshot,
  outlineRecord?: Record<string, unknown>,
): ChapterStudioSnapshot {
  const data = snapshot.data;

  const hasPremiumOutline =
    data.productionOutline &&
    data.productionOutline.source !== "legacy_adapted" &&
    Array.isArray(data.productionOutline.beats) &&
    data.productionOutline.beats.length > 0;

  const hasPremiumPlan =
    data.productionPlan &&
    typeof data.productionPlan.minimumImages === "number" &&
    data.productionPlan.minimumImages > 0;

  if (!hasPremiumOutline && !hasPremiumPlan && outlineRecord) {
    const storedOutline = outlineRecord.productionOutline;
    const storedPlan = outlineRecord.productionPlan;
    if (storedOutline || storedPlan) {
      return {
        ...snapshot,
        data: {
          ...data,
          productionOutline: (storedOutline as ChapterStudioSnapshot["data"]["productionOutline"]) ?? data.productionOutline,
          productionPlan: (storedPlan as ChapterStudioSnapshot["data"]["productionPlan"]) ?? data.productionPlan,
        },
      };
    }
  }

  const currentReadiness = data.readinessReport ?? buildChapterReadinessReport(snapshot);
  return {
    ...snapshot,
    data: {
      ...data,
      readinessReport: currentReadiness,
    },
  };
}
