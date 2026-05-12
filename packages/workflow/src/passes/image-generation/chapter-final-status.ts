/* eslint-disable @typescript-eslint/no-explicit-any -- TODO(Sprint 4 / TASK-4.2): typer après split de image-generation-pass.ts. */
/**
 * Persiste l'état final du chapitre après l'image-generation pass :
 *   - lit `SceneImage.metadata` + `consistencyScore` pour calculer le quality report,
 *   - met à jour `chapter.status`, `studio*`, `outline`, `script` avec le résumé,
 *   - retourne le `chapterQualityReport` + `generationRunSummary`.
 *
 * Extrait depuis `image-generation-pass.ts` pour réduire la taille du gros legacy.
 */

import { prisma, type Prisma } from "@manga-ai-studio/db";
import { computeChapterQualityReport } from "../../pipeline-quality";
import {
  buildPersistedChapterRuntimeState,
  buildRuntimeDebugSummary,
} from "../../chapter-runtime-helpers";

export interface ChapterFinalStatusInput {
  chapterId: string;
  chapterNumber: number;
  jobId: string;
  studioSnapshot: any;
  productionSource: { source: string; fallbackUsed: boolean; legacyBridgeUsed: boolean };
  revisedBundle: any;
  plannedImagesCount: number;
  generatedCount: number;
  failedCount: number;
}

export interface ChapterFinalStatusResult {
  chapterQualityReport: ReturnType<typeof computeChapterQualityReport>;
  generationRunSummary: ReturnType<typeof buildRuntimeDebugSummary>;
}

export async function persistChapterFinalStatus(
  input: ChapterFinalStatusInput,
): Promise<ChapterFinalStatusResult> {
  const {
    chapterId,
    chapterNumber,
    jobId,
    studioSnapshot,
    productionSource,
    revisedBundle,
    plannedImagesCount,
    generatedCount,
    failedCount,
  } = input;

  const chapterQualityRows = await prisma.sceneImage.findMany({
    where: { scene: { chapterId } },
    select: { consistencyScore: true, metadata: true },
  });
  const chapterQualityReport = computeChapterQualityReport(chapterQualityRows);

  // P10 — log honnête : distinguer "QA absente" de "QA ratée".
  if (!chapterQualityReport.qaDataAvailable) {
    console.warn(
      `[pipeline:quality] qa_data_missing total=${chapterQualityReport.totalPanels} panelsWithQa=0 — accepted=false signifie "pas de QA" et non "mauvaise qualité"`,
    );
  } else {
    console.log(
      `[pipeline:quality] average=${chapterQualityReport.averageReleaseScore.toFixed(2)} threshold=${chapterQualityReport.releaseThreshold.toFixed(2)} accepted=${chapterQualityReport.premiumReleaseAccepted} panelsWithQa=${chapterQualityReport.panelsWithQa}/${chapterQualityReport.totalPanels} weakPanels=${chapterQualityReport.weakPanels.length}`,
    );
  }

  const persistedRuntime = buildPersistedChapterRuntimeState({
    studioSnapshot,
    chapterId,
    chapterNumber,
    jobId,
    totalPlannedImages: plannedImagesCount,
    generatedCount,
    failedCount,
    qualityReport: chapterQualityReport,
  });
  const generationRunSummary = buildRuntimeDebugSummary({
    generationRunSummary: persistedRuntime.generationRunSummary,
    productionSource,
  });

  const imageStats = {
    total: plannedImagesCount,
    generated: generatedCount,
    failed: failedCount,
    accepted: chapterQualityReport.acceptedImages,
    rejected: chapterQualityReport.rejectedImages,
    minimumAcceptedImages: chapterQualityReport.minimumAcceptedImages,
    missingImages: chapterQualityReport.missingImages,
  };
  const runtimeSources = {
    outlineSource: productionSource.source,
    fallbackUsed: productionSource.fallbackUsed,
    legacyBridgeUsed: productionSource.legacyBridgeUsed,
  };

  await prisma.chapter.update({
    where: { id: chapterId },
    data: {
      status: persistedRuntime.persistedChapterStatus,
      ...(persistedRuntime.structuredRuntimeFields
        ? {
            studioStatus: persistedRuntime.structuredRuntimeFields.studioStatus,
            studioCurrentStep: persistedRuntime.structuredRuntimeFields.studioCurrentStep,
            studioUpdatedAt: persistedRuntime.structuredRuntimeFields.studioUpdatedAt
              ? new Date(persistedRuntime.structuredRuntimeFields.studioUpdatedAt)
              : null,
            studioAutosaveVersion: persistedRuntime.structuredRuntimeFields.studioAutosaveVersion,
            minimumImages: persistedRuntime.structuredRuntimeFields.minimumImages,
            generatedImages: persistedRuntime.structuredRuntimeFields.generatedImages,
            acceptedImages: persistedRuntime.structuredRuntimeFields.acceptedImages,
            rejectedImages: persistedRuntime.structuredRuntimeFields.rejectedImages,
            missingImages: persistedRuntime.structuredRuntimeFields.missingImages,
            criticalPanelsCount: persistedRuntime.structuredRuntimeFields.criticalPanelsCount,
            criticalPanelsBlocked: persistedRuntime.structuredRuntimeFields.criticalPanelsBlocked,
            criticalPanelsMissingQa: persistedRuntime.structuredRuntimeFields.criticalPanelsMissingQa,
            reviewBlockedReason: persistedRuntime.structuredRuntimeFields.reviewBlockedReason,
          }
        : {}),
      outline: {
        ...revisedBundle.outline,
        operationalStatus: revisedBundle.generationDiagnostics.operationalStatus,
        degradedModes: revisedBundle.generationDiagnostics.degradedModes,
        generationDiagnostics: revisedBundle.generationDiagnostics.outline,
        generationRunSummary,
        imageStats,
        runtimeSources,
        qualityReport: chapterQualityReport,
      } as unknown as Prisma.InputJsonValue,
      script: {
        ...revisedBundle.script,
        operationalStatus: revisedBundle.generationDiagnostics.operationalStatus,
        degradedModes: revisedBundle.generationDiagnostics.degradedModes,
        generationDiagnostics: revisedBundle.generationDiagnostics.dialogue,
        generationRunSummary,
        imageStats,
        runtimeSources,
        qualityReport: chapterQualityReport,
      } as unknown as Prisma.InputJsonValue,
    },
  });

  return { chapterQualityReport, generationRunSummary };
}
