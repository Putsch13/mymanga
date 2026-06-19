/**
 * snapshot.ts
 *
 * Helpers de manipulation du snapshot studio :
 *   - `resolveChapterStudioStatus`
 *   - `canTransitionChapterStudioStatus`
 *   - `createEmptyChapterStudioSnapshot`
 *   - `updateChapterStudioSnapshot`
 *
 * Extrait de `chapter-studio-helpers.ts` (audit-v9, < 500 lignes/fichier).
 */

import {
  chapterStudioSnapshotSchema,
  type ChapterStudioData,
  type ChapterStudioSnapshot,
  type ChapterStudioStatus,
  type ChapterStudioStep,
} from "../chapter-studio";
import { buildChapterReadinessReport } from "./readiness";

export function resolveChapterStudioStatus(snapshot: ChapterStudioSnapshot): ChapterStudioStatus {
  const readinessReport = snapshot.data.readinessReport ?? buildChapterReadinessReport(snapshot);
  const qaReport = snapshot.data.qaReport;

  if (
    (snapshot.data.readinessReport?.imageCounts.generatedImages ?? 0) > 0 &&
    readinessReport.imageCounts.acceptedImages < readinessReport.imageCounts.minimumImages
  ) {
    return "GENERATION_PARTIAL";
  }

  if (qaReport && readinessReport.imageCounts.acceptedImages >= readinessReport.imageCounts.minimumImages) {
    return qaReport.rejectedPanelCount > 0 ? "NEEDS_FIXES" : "COMPLETED";
  }

  if (readinessReport.imageCounts.generatedImages > 0) return "QA_REVIEW";
  if (snapshot.status === "GENERATING") return "GENERATING";
  if (readinessReport.status === "ready") return "READY_FOR_GENERATION";
  if (snapshot.data.productionPlan) return "PRODUCTION_PLAN_READY";
  if ((snapshot.data.productionOutline?.beats.length ?? 0) > 0) return "OUTLINE_PRODUCTION_READY";
  if ((snapshot.data.editorialOutline?.beats.length ?? 0) > 0) return "OUTLINE_EDITORIAL_READY";
  if (snapshot.data.chapterCanon) return "CANON_READY";
  if (snapshot.data.narrativeContract) return "NARRATIVE_CONTRACT_READY";
  return "DRAFT";
}

export function canTransitionChapterStudioStatus(
  from: ChapterStudioStatus,
  to: ChapterStudioStatus,
): boolean {
  const transitions: Record<ChapterStudioStatus, ChapterStudioStatus[]> = {
    DRAFT: ["NARRATIVE_CONTRACT_READY"],
    NARRATIVE_CONTRACT_READY: ["CANON_READY"],
    CANON_READY: ["OUTLINE_EDITORIAL_READY"],
    OUTLINE_EDITORIAL_READY: ["OUTLINE_PRODUCTION_READY"],
    OUTLINE_PRODUCTION_READY: ["PRODUCTION_PLAN_READY"],
    PRODUCTION_PLAN_READY: ["READY_FOR_GENERATION"],
    READY_FOR_GENERATION: ["GENERATING"],
    GENERATING: ["GENERATION_PARTIAL", "QA_REVIEW"],
    GENERATION_PARTIAL: ["GENERATING", "QA_REVIEW", "NEEDS_FIXES"],
    QA_REVIEW: ["NEEDS_FIXES", "COMPLETED"],
    NEEDS_FIXES: ["GENERATING", "QA_REVIEW", "COMPLETED"],
    COMPLETED: ["PUBLISHED"],
    PUBLISHED: [],
  };

  return transitions[from].includes(to);
}

export function createEmptyChapterStudioSnapshot(): ChapterStudioSnapshot {
  return chapterStudioSnapshotSchema.parse({
    data: {
      characterCanons: [],
      locationCanons: [],
    },
  });
}

export function updateChapterStudioSnapshot(
  snapshot: ChapterStudioSnapshot | null | undefined,
  patch: Partial<ChapterStudioData>,
  input?: {
    currentStep?: ChapterStudioStep;
    transitionReason?: string;
  },
): ChapterStudioSnapshot {
  const base = snapshot ? chapterStudioSnapshotSchema.parse(snapshot) : createEmptyChapterStudioSnapshot();
  const merged = chapterStudioSnapshotSchema.parse({
    ...base,
    currentStep: input?.currentStep ?? base.currentStep,
    data: {
      ...base.data,
      ...patch,
      characterCanons: patch.characterCanons ?? base.data.characterCanons,
      locationCanons: patch.locationCanons ?? base.data.locationCanons,
    },
    updatedAt: new Date().toISOString(),
    autosaveVersion: base.autosaveVersion + 1,
  });

  const readinessReport = buildChapterReadinessReport(merged);
  const nextStatus = resolveChapterStudioStatus({
    ...merged,
    data: {
      ...merged.data,
      readinessReport,
    },
  });

  return {
    ...merged,
    status: nextStatus,
    data: {
      ...merged.data,
      readinessReport,
    },
    history:
      merged.status !== nextStatus && canTransitionChapterStudioStatus(merged.status, nextStatus)
        ? [
            ...merged.history,
            {
              from: merged.status,
              to: nextStatus,
              at: new Date().toISOString(),
              reason: input?.transitionReason ?? null,
            },
          ]
        : merged.history,
  };
}
