import { NextResponse } from "next/server";
import { aggregateChapterImageCounts, classifyPanelCriticality } from "@manga-ai-studio/core";
import { prisma } from "@manga-ai-studio/db";
import { getAppUser } from "@/lib/auth/get-app-user";
import { notFound, unauthorized } from "@/lib/api-response";
import { readChapterStudioSnapshotFromOutline } from "@/lib/chapter-studio";

type Ctx = { params: Promise<{ id: string; chapterId: string }> };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function GET(_req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();

  const { id: projectId, chapterId } = await ctx.params;
  const chapter = await prisma.chapter.findFirst({
    where: { id: chapterId, projectId, project: { userId: user.id } },
    include: {
      scenes: {
        orderBy: { sceneNumber: "asc" },
        include: {
          images: {
            orderBy: { panelNumber: "asc" },
          },
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
  const minimumImages = studio.data.productionPlan?.minimumImages ?? studio.data.readinessReport?.imageCounts.minimumImages ?? 55;

  const panelResults = chapter.scenes.flatMap((scene) =>
    scene.images.map((image) => {
      const meta = asRecord(image.metadata);
      const validationDetails = asRecord(meta.validationDetails);
      const qualityScores = asRecord(validationDetails.qualityScores);
      const panelCriticality = asRecord(validationDetails.panelCriticality);
      const issues = Array.isArray(validationDetails.issues)
        ? validationDetails.issues as Array<{ message?: string; type?: string }>
        : [];
      const releaseScore =
        typeof qualityScores.releaseScore === "number"
          ? qualityScores.releaseScore
          : typeof image.consistencyScore === "number"
            ? image.consistencyScore
            : 0;
      const criticalityDecision = panelCriticality.level === "CRITICAL"
        ? {
            level: "CRITICAL" as const,
            reasons: Array.isArray(panelCriticality.reasons) ? panelCriticality.reasons.filter((reason): reason is string => typeof reason === "string") : [],
            qaWasRequired: true,
          }
        : classifyPanelCriticality({
            panelCategory: typeof meta.panelCategory === "string" ? meta.panelCategory : null,
            pageNumber: scene.sceneNumber,
            panelNumber: image.panelNumber,
            pagePanelCount: scene.images.length,
            visualPriority: typeof meta.visualPriority === "string" ? meta.visualPriority : null,
          });
      const qaWasRequired =
        validationDetails.qaWasRequired === true
        || meta.qaWasRequired === true
        || criticalityDecision.qaWasRequired;
      const qaWasExecuted = validationDetails.qaWasExecuted === true || meta.qaWasExecuted === true;
      const qaFailureReason =
        typeof validationDetails.qaFailureReason === "string"
          ? validationDetails.qaFailureReason
          : typeof meta.qaFailureReason === "string"
            ? meta.qaFailureReason
            : null;
      const rerollHistory = Array.isArray(meta.rerollHistory) ? meta.rerollHistory : [];
      const latestReroll = rerollHistory.at(-1);
      const latestRerollRecord =
        latestReroll && typeof latestReroll === "object" && !Array.isArray(latestReroll)
          ? (latestReroll as Record<string, unknown>)
          : {};
      return {
        panelId: image.id,
        sceneId: scene.id,
        panelNumber: image.panelNumber,
        imageUrl: image.imageUrl,
        previousImageUrl:
          typeof meta.previousImageUrl === "string"
            ? meta.previousImageUrl
            : typeof latestRerollRecord.previousImageUrl === "string"
              ? latestRerollRecord.previousImageUrl
              : null,
        critical: criticalityDecision.level === "CRITICAL",
        criticality: criticalityDecision.level,
        criticalityReasons: criticalityDecision.reasons,
        score: releaseScore,
        axisScores: {
          characterFidelity: typeof qualityScores.styleConsistencyScore === "number" ? qualityScores.styleConsistencyScore : releaseScore,
          narrativeRelevance: typeof qualityScores.interactionScore === "number" ? qualityScores.interactionScore : releaseScore,
          compositionReadability: typeof qualityScores.shotComplianceScore === "number" ? qualityScores.shotComplianceScore : releaseScore,
          environmentConsistency: typeof qualityScores.environmentReadabilityScore === "number" ? qualityScores.environmentReadabilityScore : releaseScore,
        },
        rejectionReasons: issues.map((issue) => issue.message ?? issue.type ?? "quality_issue"),
        repairSuggestions: issues.map((issue) => `Réparer ${issue.type ?? "quality_issue"}`),
        rerollCount:
          typeof meta.rerollCount === "number"
            ? meta.rerollCount
            : typeof asRecord(meta.generationLog).rerollCount === "number"
              ? Number(asRecord(meta.generationLog).rerollCount)
              : 0,
        promptDebug: asRecord(meta.promptDebug),
        prompt: typeof image.prompt === "string" ? image.prompt : null,
        referencePolicy: typeof meta.referencePolicy === "string" ? meta.referencePolicy : null,
        panelCategory: typeof meta.panelCategory === "string" ? meta.panelCategory : null,
        status: image.status,
        qaWasRequired,
        qaWasExecuted,
        qaFailureReason,
        qaBypassReason:
          typeof validationDetails.qaBypassReason === "string"
            ? validationDetails.qaBypassReason
            : typeof meta.qaBypassReason === "string"
              ? meta.qaBypassReason
              : null,
      };
    }),
  );

  const acceptedPanelCount = panelResults.filter((panel) => panel.status === "completed").length;
  const rejectedPanelCount = panelResults.filter((panel) => panel.status === "failed" || panel.status === "blocked").length;
  const imageCounts = aggregateChapterImageCounts({
    estimatedImages: studio.data.productionPlan?.estimatedImages ?? panelResults.length,
    targetImages: studio.data.productionPlan?.targetImages ?? panelResults.length,
    minimumImages,
    generatedImages: panelResults.length,
    acceptedImages: acceptedPanelCount,
    rejectedImages: rejectedPanelCount,
  });
  const chapterScore =
    panelResults.length > 0
      ? panelResults.reduce((acc, panel) => acc + panel.score, 0) / panelResults.length
      : 0;

  return NextResponse.json({
    ok: true,
    chapterId,
    report: {
      panelResults,
      pageScore: chapterScore,
      chapterScore,
      acceptedPanelCount,
      rejectedPanelCount,
      imageCounts,
      criticalPanelsCount: panelResults.filter((panel) => panel.critical).length,
      criticalPanelsWithVisualQA: panelResults.filter((panel) => panel.critical && panel.qaWasExecuted).length,
      criticalPanelsBlocked: panelResults.filter((panel) => panel.critical && panel.status === "blocked").length,
      criticalPanelsMissingQA: panelResults.filter((panel) => panel.critical && (!panel.qaWasExecuted || panel.qaFailureReason)).length,
      missingCriticalPanels: panelResults
        .filter((panel) => panel.critical && (panel.status !== "completed" || !panel.qaWasExecuted))
        .map((panel) => panel.panelId),
    },
  });
}
