import { NextResponse } from "next/server";
import { buildChapterReadinessReport, isPipelineV3PremiumOnlyEnabled } from "@manga-ai-studio/core";
import { prisma } from "@manga-ai-studio/db";
import { getAppUser } from "@/lib/auth/get-app-user";
import { notFound, unauthorized } from "@/lib/api-response";
import { readChapterStudioSnapshotFromOutline } from "@/lib/chapter-studio";
import { getGenerationStackStatus } from "@/lib/generation/stack-readiness";
import { computePremiumAiReadiness } from "@/lib/compute-premium-ai-readiness";
import { buildPremiumReadinessDashboard } from "@/lib/readiness/build-premium-readiness-dashboard";

type Ctx = { params: Promise<{ id: string; chapterId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const { id: projectId, chapterId } = await ctx.params;

  const chapter = await prisma.chapter.findFirst({
    where: { id: chapterId, projectId, project: { userId: user.id } },
  });
  if (!chapter) return notFound();

  const snapshot = readChapterStudioSnapshotFromOutline({
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

  const stack = getGenerationStackStatus();
  const premiumOnly = isPipelineV3PremiumOnlyEnabled();
  const { aiReadiness, premiumBlockingReasons } = computePremiumAiReadiness({ stack, premiumOnly });
  const premiumDashboard = buildPremiumReadinessDashboard({
    snapshot,
    projectId,
    chapterId,
    chapterNumber: chapter.chapterNumber,
  });

  return NextResponse.json({
    ok: true,
    chapterId: chapter.id,
    readiness: snapshot.data.readinessReport ?? buildChapterReadinessReport(snapshot),
    studioStatus: snapshot.status,
    aiReadiness,
    premiumBlockingReasons,
    premiumDashboard,
  });
}
