/**
 * P5.3 — Runtime fields + list items du studio.
 * Extrait de lib/chapter-studio.ts — logique inchangée.
 */

import {
  buildChapterReadinessReport,
  buildStructuredChapterRuntimeFields,
  resolveEffectiveChapterCanonState as resolveEffectiveChapterCanonStateCore,
  resolveEffectiveProductionSource as resolveEffectiveProductionSourceCore,
  type ChapterStudioSnapshot,
  type StructuredChapterRuntimeFields,
} from "@manga-ai-studio/core";
import type { Prisma } from "@manga-ai-studio/db";
import { readChapterStudioSnapshotFromOutline } from "./snapshot";

export function resolveEffectiveChapterCanonState(snapshot: ChapterStudioSnapshot) {
  return resolveEffectiveChapterCanonStateCore(snapshot);
}

export function resolveEffectiveProductionSource(snapshot: ChapterStudioSnapshot) {
  return resolveEffectiveProductionSourceCore(snapshot);
}

export function buildChapterStudioListItem(input: {
  id: string;
  chapterNumber: number;
  title: string | null;
  status: string;
  summary: string | null;
  cliffhanger: string | null;
  outline: unknown;
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
}) {
  const snapshot = readChapterStudioSnapshotFromOutline({
    outline: input.outline,
    chapterNumber: input.chapterNumber,
    chapterTitle: input.title,
    chapterSummary: input.summary,
    cliffhanger: input.cliffhanger,
    studioStatus: input.studioStatus,
    studioCurrentStep: input.studioCurrentStep,
    studioUpdatedAt: input.studioUpdatedAt,
    studioAutosaveVersion: input.studioAutosaveVersion,
    minimumImages: input.minimumImages,
    generatedImages: input.generatedImages,
    acceptedImages: input.acceptedImages,
    rejectedImages: input.rejectedImages,
    missingImages: input.missingImages,
    criticalPanelsCount: input.criticalPanelsCount,
    criticalPanelsBlocked: input.criticalPanelsBlocked,
    criticalPanelsMissingQa: input.criticalPanelsMissingQa,
    reviewBlockedReason: input.reviewBlockedReason,
  });

  return {
    id: input.id,
    chapterNumber: input.chapterNumber,
    title: input.title,
    status: input.status,
    studioStatus: snapshot.status,
    readinessReport: snapshot.data.readinessReport ?? buildChapterReadinessReport(snapshot),
    currentStep: snapshot.currentStep,
    summary: input.summary,
    cliffhanger: input.cliffhanger,
  };
}

export function buildChapterStructuredRuntimeFields(input: {
  snapshot: ChapterStudioSnapshot;
  counts?: Partial<StructuredChapterRuntimeFields>;
  minimumImages?: number | null;
  generatedImages?: number | null;
  acceptedImages?: number | null;
  rejectedImages?: number | null;
  missingImages?: number | null;
  criticalPanelsCount?: number | null;
  criticalPanelsBlocked?: number | null;
  criticalPanelsMissingQa?: number | null;
  reviewBlockedReason?: string | null;
}): StructuredChapterRuntimeFields {
  return buildStructuredChapterRuntimeFields({
    snapshot: input.snapshot,
    counts: {
      minimumImages: input.minimumImages ?? input.counts?.minimumImages,
      generatedImages: input.generatedImages ?? input.counts?.generatedImages,
      acceptedImages: input.acceptedImages ?? input.counts?.acceptedImages,
      rejectedImages: input.rejectedImages ?? input.counts?.rejectedImages,
      missingImages: input.missingImages ?? input.counts?.missingImages,
    },
    criticalPanelsCount: input.criticalPanelsCount ?? input.counts?.criticalPanelsCount,
    criticalPanelsBlocked: input.criticalPanelsBlocked ?? input.counts?.criticalPanelsBlocked,
    criticalPanelsMissingQa: input.criticalPanelsMissingQa ?? input.counts?.criticalPanelsMissingQa,
    reviewBlockedReason: input.reviewBlockedReason ?? input.counts?.reviewBlockedReason ?? null,
  });
}

export function buildChapterStructuredRuntimePrismaFields(input: {
  snapshot: ChapterStudioSnapshot;
  counts?: Partial<StructuredChapterRuntimeFields>;
  minimumImages?: number | null;
  generatedImages?: number | null;
  acceptedImages?: number | null;
  rejectedImages?: number | null;
  missingImages?: number | null;
  criticalPanelsCount?: number | null;
  criticalPanelsBlocked?: number | null;
  criticalPanelsMissingQa?: number | null;
  reviewBlockedReason?: string | null;
}): Prisma.ChapterUpdateInput {
  const fields = buildChapterStructuredRuntimeFields(input);
  return {
    studioStatus: fields.studioStatus,
    studioCurrentStep: fields.studioCurrentStep,
    studioUpdatedAt: fields.studioUpdatedAt ? new Date(fields.studioUpdatedAt) : null,
    studioAutosaveVersion: fields.studioAutosaveVersion,
    minimumImages: fields.minimumImages,
    generatedImages: fields.generatedImages,
    acceptedImages: fields.acceptedImages,
    rejectedImages: fields.rejectedImages,
    missingImages: fields.missingImages,
    criticalPanelsCount: fields.criticalPanelsCount,
    criticalPanelsBlocked: fields.criticalPanelsBlocked,
    criticalPanelsMissingQa: fields.criticalPanelsMissingQa,
    reviewBlockedReason: fields.reviewBlockedReason,
  };
}

export function buildChapterStructuredRuntimeCreateFields(input: {
  snapshot: ChapterStudioSnapshot;
  counts?: Partial<StructuredChapterRuntimeFields>;
  minimumImages?: number | null;
  generatedImages?: number | null;
  acceptedImages?: number | null;
  rejectedImages?: number | null;
  missingImages?: number | null;
  criticalPanelsCount?: number | null;
  criticalPanelsBlocked?: number | null;
  criticalPanelsMissingQa?: number | null;
  reviewBlockedReason?: string | null;
}) {
  const fields = buildChapterStructuredRuntimeFields(input);
  return {
    studioStatus: fields.studioStatus,
    studioCurrentStep: fields.studioCurrentStep,
    studioUpdatedAt: fields.studioUpdatedAt ? new Date(fields.studioUpdatedAt) : null,
    studioAutosaveVersion: fields.studioAutosaveVersion,
    minimumImages: fields.minimumImages,
    generatedImages: fields.generatedImages,
    acceptedImages: fields.acceptedImages,
    rejectedImages: fields.rejectedImages,
    missingImages: fields.missingImages,
    criticalPanelsCount: fields.criticalPanelsCount,
    criticalPanelsBlocked: fields.criticalPanelsBlocked,
    criticalPanelsMissingQa: fields.criticalPanelsMissingQa,
    reviewBlockedReason: fields.reviewBlockedReason,
  };
}
