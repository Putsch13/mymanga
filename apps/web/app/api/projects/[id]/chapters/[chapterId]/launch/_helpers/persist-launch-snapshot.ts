/**
 * P5.2 — Construction du snapshot final + update DB chapitre pré-dispatch.
 *
 * Étape "GENERATING" : on écrit l'état `ready_for_render` sur le chapitre, en
 * embarquant le snapshot studio mis à jour (compteur d'images recalculé) et
 * l'`approvedOutline` dans `outline.studio` / `outline.approvedOutline`.
 *
 * Sortie :
 *   - `nextSnapshot` : le `ChapterStudioSnapshot` à passer ensuite au
 *      dispatcher Inngest (`buildAndDispatchLaunchJob`).
 *   - `chapterOutlineRecord` : la version sérialisable mise à jour de l'outline.
 */
import {
  PREMIUM_PANEL_RANGE,
  type ChapterStudioSnapshot,
} from "@manga-ai-studio/core";
import { prisma } from "@manga-ai-studio/db";
import { buildChapterStructuredRuntimePrismaFields } from "@/lib/chapter-studio";
import { toPrismaInputJson } from "@/lib/to-prisma-input-json";
import type { GenerationJobInputOptions } from "@/lib/premium-chapter-contract";

type LaunchChapter = {
  generatedImages: number | null;
  acceptedImages: number | null;
  rejectedImages: number | null;
  missingImages: number | null;
  criticalPanelsCount: number | null;
  criticalPanelsBlocked: number | null;
  criticalPanelsMissingQa: number | null;
  reviewBlockedReason: string | null;
};

export async function persistLaunchSnapshot(args: {
  chapterId: string;
  chapter: LaunchChapter;
  studioSnapshotForLaunch: ChapterStudioSnapshot;
  readiness: NonNullable<ChapterStudioSnapshot["data"]["readinessReport"]>;
  approvedOutline: GenerationJobInputOptions["approvedOutline"];
  chapterOutlineRecord: Record<string, unknown>;
}): Promise<{ nextSnapshot: ChapterStudioSnapshot }> {
  const {
    chapterId,
    chapter,
    studioSnapshotForLaunch,
    readiness,
    approvedOutline,
    chapterOutlineRecord,
  } = args;

  const nextSnapshot: ChapterStudioSnapshot = {
    ...studioSnapshotForLaunch,
    status: "GENERATING" as const,
    data: {
      ...studioSnapshotForLaunch.data,
      readinessReport: {
        ...readiness,
        imageCounts: {
          ...readiness.imageCounts,
          estimatedImages:
            studioSnapshotForLaunch.data.productionPlan?.estimatedImages
            ?? readiness.imageCounts.estimatedImages,
          targetImages:
            studioSnapshotForLaunch.data.productionPlan?.targetImages
            ?? readiness.imageCounts.targetImages,
        },
      },
    },
  };

  const structuredRuntime = buildChapterStructuredRuntimePrismaFields({
    snapshot: nextSnapshot,
    minimumImages: nextSnapshot.data.readinessReport?.imageCounts.minimumImages,
    generatedImages: chapter.generatedImages ?? 0,
    acceptedImages: chapter.acceptedImages ?? 0,
    rejectedImages: chapter.rejectedImages ?? 0,
    missingImages:
      chapter.missingImages
      ?? nextSnapshot.data.readinessReport?.imageCounts.minimumImages
      ?? PREMIUM_PANEL_RANGE.min,
    criticalPanelsCount: chapter.criticalPanelsCount ?? 0,
    criticalPanelsBlocked: chapter.criticalPanelsBlocked ?? 0,
    criticalPanelsMissingQa: chapter.criticalPanelsMissingQa ?? 0,
    reviewBlockedReason: chapter.reviewBlockedReason,
  });

  await prisma.chapter.update({
    where: { id: chapterId },
    data: {
      status: "ready_for_render",
      ...structuredRuntime,
      outline: toPrismaInputJson({
        ...chapterOutlineRecord,
        studio: nextSnapshot,
        approvedOutline,
      }),
    },
  });

  return { nextSnapshot };
}
