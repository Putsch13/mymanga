import { NextResponse } from "next/server";
import { aggregateChapterImageCounts, buildChapterReadinessReport, resolveChapterRuntimeStatus } from "@manga-ai-studio/core";
import { prisma, type Prisma } from "@manga-ai-studio/db";
import { getAppUser } from "@/lib/auth/get-app-user";
import { notFound, unauthorized, validationError } from "@/lib/api-response";
import { buildChapterStructuredRuntimePrismaFields, readChapterStudioSnapshotFromOutline } from "@/lib/chapter-studio";

type Ctx = { params: Promise<{ id: string; chapterId: string }> };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function POST(_req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();

  const { id: projectId, chapterId } = await ctx.params;
  const chapter = await prisma.chapter.findFirst({
    where: { id: chapterId, projectId, project: { userId: user.id } },
    include: {
      scenes: {
        include: {
          images: true,
        },
      },
    },
  });
  if (!chapter) return notFound();

  const studio = readChapterStudioSnapshotFromOutline({
    outline: chapter.outline,
    chapterNumber: chapter.chapterNumber,
    chapterTitle: chapter.title,
    chapterSummary: chapter.summary,
    cliffhanger: chapter.cliffhanger,
    userIntent: chapter.userIntent,
    studioStatus: chapter.studioStatus,
    studioCurrentStep: chapter.studioCurrentStep,
    studioUpdatedAt: chapter.studioUpdatedAt,
    studioAutosaveVersion: chapter.studioAutosaveVersion,
    minimumImages: chapter.minimumImages,
    generatedImages: chapter.generatedImages,
    acceptedImages: chapter.acceptedImages,
    rejectedImages: chapter.rejectedImages,
    missingImages: chapter.missingImages,
    criticalPanelsCount: chapter.criticalPanelsCount,
    criticalPanelsBlocked: chapter.criticalPanelsBlocked,
    criticalPanelsMissingQa: chapter.criticalPanelsMissingQa,
    reviewBlockedReason: chapter.reviewBlockedReason,
  });
  const readiness = studio.data.readinessReport ?? buildChapterReadinessReport(studio);
  const images = chapter.scenes.flatMap((scene) => scene.images);
  const acceptedImages = images.filter((image) => image.status === "completed").length;
  const rejectedImages = images.filter((image) => image.status === "failed" || image.status === "blocked").length;
  const imageCounts = aggregateChapterImageCounts({
    estimatedImages: readiness.imageCounts.estimatedImages,
    targetImages: readiness.imageCounts.targetImages,
    minimumImages: readiness.imageCounts.minimumImages,
    generatedImages: images.length,
    acceptedImages,
    rejectedImages,
  });
  const criticalPanelsMissingQa = images
    .filter((image) => {
      const meta = asRecord(image.metadata);
      const validationDetails = asRecord(meta.validationDetails);
      const qaRequired = validationDetails.qaWasRequired === true || meta.qaWasRequired === true;
      const qaExecuted = validationDetails.qaWasExecuted === true || meta.qaWasExecuted === true;
      return qaRequired && !qaExecuted;
    })
    .map((image) => image.id);

  if (imageCounts.acceptedImages < imageCounts.minimumImages) {
    return validationError(
      `Impossible de clôturer le chapitre: ${imageCounts.acceptedImages} images acceptées, minimum requis ${imageCounts.minimumImages}.`,
      {
        acceptedImages: imageCounts.acceptedImages,
        minimumImages: imageCounts.minimumImages,
        missingImages: imageCounts.missingImages,
      },
    );
  }
  if (criticalPanelsMissingQa.length > 0) {
    return validationError(
      "Impossible de clôturer le chapitre: des panels critiques n'ont pas de QA visuelle exploitable.",
      {
        missingCriticalQaPanelIds: criticalPanelsMissingQa,
      },
    );
  }

  const outline = asRecord(chapter.outline);
  const qaReport = asRecord(outline.qualityReport);
  const runtimeStatus = resolveChapterRuntimeStatus({
    counts: imageCounts,
    hasCriticalQaMissing: criticalPanelsMissingQa.length > 0,
    hasRejectedPanels: rejectedImages > 0,
    hasGeneratedPanels: images.length > 0,
    hasQaResults: true,
    publishRequested: true,
  });
  const nextStudio = {
    ...studio,
    status: runtimeStatus,
    data: {
      ...studio.data,
      readinessReport: {
        ...readiness,
        imageCounts,
      },
      qaReport: {
        panelResults: [],
        pageScore: typeof qaReport.averageReleaseScore === "number" ? qaReport.averageReleaseScore : 0,
        chapterScore: typeof qaReport.averageReleaseScore === "number" ? qaReport.averageReleaseScore : 0,
        acceptedPanelCount: imageCounts.acceptedImages,
        rejectedPanelCount: imageCounts.rejectedImages,
        missingCriticalPanels: criticalPanelsMissingQa,
      },
    },
    history: [
      ...studio.history,
      {
        from: studio.status,
        to: runtimeStatus,
        at: new Date().toISOString(),
        reason: "complete_chapter_review",
      },
    ],
  };

  await prisma.chapter.update({
    where: { id: chapterId },
    data: {
      status: runtimeStatus === "PUBLISHED" ? "published" : "review_required",
      ...buildChapterStructuredRuntimePrismaFields({
        snapshot: nextStudio,
        minimumImages: imageCounts.minimumImages,
        generatedImages: imageCounts.generatedImages,
        acceptedImages: imageCounts.acceptedImages,
        rejectedImages: imageCounts.rejectedImages,
        missingImages: imageCounts.missingImages,
        criticalPanelsCount: chapter.criticalPanelsCount ?? 0,
        criticalPanelsBlocked: criticalPanelsMissingQa.length,
        criticalPanelsMissingQa: criticalPanelsMissingQa.length,
        reviewBlockedReason: criticalPanelsMissingQa.length > 0 ? "critical_qa_missing" : null,
      }),
      outline: ({
        ...outline,
        studio: nextStudio,
      } as unknown) as Prisma.InputJsonValue,
    },
  });

  return NextResponse.json({
    ok: true,
    chapterId,
    acceptedImages: imageCounts.acceptedImages,
    status: runtimeStatus === "PUBLISHED" ? "published" : "review_required",
  });
}
