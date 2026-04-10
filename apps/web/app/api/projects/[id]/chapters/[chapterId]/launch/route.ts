import { NextResponse } from "next/server";
import {
  buildChapterReadinessReport,
  buildLegacyApprovedOutlineFromStudio,
  parseApprovedOutline,
} from "@manga-ai-studio/core";
import { estimateChapterTextTokensFromRules } from "@manga-ai-studio/billing";
import { prisma, type Prisma } from "@manga-ai-studio/db";
import { runFullChapterPipelineFromJob, sendChapterGenerateRequested } from "@manga-ai-studio/workflow";
import { getAppUser } from "@/lib/auth/get-app-user";
import { canAccessMatureContent, getAgeGateMessage, projectRequiresAgeGate } from "@/lib/age-gate";
import { badRequest, notFound, unauthorized, validationError } from "@/lib/api-response";
import { getGenerationStackStatus } from "@/lib/generation/stack-readiness";
import { checkRateLimit } from "@/lib/rate-limit";
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

  const rl = checkRateLimit(user.id, "pipeline");
  if (!rl.ok) {
    return NextResponse.json({ error: rl.message }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSecs) } });
  }

  const { id: projectId, chapterId } = await ctx.params;
  const stack = getGenerationStackStatus();
  if (!stack.canGenerateChapters) {
    return validationError("La stack de génération n'est pas prête pour un chapitre complet.", stack);
  }

  const chapter = await prisma.chapter.findFirst({
    where: { id: chapterId, projectId, project: { userId: user.id } },
    include: { project: { include: { user: { include: { preferences: true } } } } },
  });
  if (!chapter) return notFound();

  if (projectRequiresAgeGate(chapter.project.contentRating, chapter.project.intensityLayer) && !canAccessMatureContent(chapter.project.user, chapter.project.user.preferences)) {
    return validationError(getAgeGateMessage(chapter.project.contentRating));
  }

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
  const readiness = snapshot.data.readinessReport ?? buildChapterReadinessReport(snapshot);
  if (readiness.status === "blocked") {
    return validationError("Le chapitre n'est pas prêt pour la génération.", readiness);
  }

  const approvedOutline = buildLegacyApprovedOutlineFromStudio(snapshot) ?? parseApprovedOutline(asRecord(chapter.outline).approvedOutline);
  if (!approvedOutline) {
    return badRequest("Aucun outline validé n'est disponible pour lancer la génération.");
  }

  const nextSnapshot = {
    ...snapshot,
    status: "GENERATING" as const,
    data: {
      ...snapshot.data,
      readinessReport: {
        ...readiness,
        imageCounts: {
          ...readiness.imageCounts,
          estimatedImages: snapshot.data.productionPlan?.estimatedImages ?? readiness.imageCounts.estimatedImages,
          targetImages: snapshot.data.productionPlan?.targetImages ?? readiness.imageCounts.targetImages,
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
    missingImages: chapter.missingImages ?? (nextSnapshot.data.readinessReport?.imageCounts.minimumImages ?? 55),
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
      outline: ({
        ...asRecord(chapter.outline),
        studio: nextSnapshot,
        approvedOutline,
      } as unknown) as Prisma.InputJsonValue,
    },
  });

  const estimatedCost = await estimateChapterTextTokensFromRules();
  const job = await prisma.job.create({
    data: {
      userId: user.id,
      projectId,
      chapterId,
      type: "GENERATE_CHAPTER_SCRIPT",
      status: "queued",
      estimatedTokenCost: estimatedCost,
      input: {
        source: "chapter_studio_launch",
        chapterId,
        approvedOutlineVersion: approvedOutline.approvalVersion,
      },
      output: {
        currentStep: "queued",
        steps: [],
        operationalStatus: stack.operationalStatus,
        degradedModes: stack.degradedModes,
        stackWarnings: stack.warnings,
      },
    },
  });

  const sent = await sendChapterGenerateRequested({
    jobId: job.id,
    projectId,
    chapterId,
    userId: user.id,
  });

  if (!sent.ok) {
    const run = await runFullChapterPipelineFromJob(job.id);
    return NextResponse.json({
      ok: run.ok,
      jobId: job.id,
      message: run.ok ? "Pipeline exécuté immédiatement." : `Échec pipeline : ${run.error ?? "inconnu"}`,
      operationalStatus: stack.operationalStatus,
      degradedModes: stack.degradedModes,
    });
  }

  return NextResponse.json({
    ok: true,
    jobId: job.id,
    operationalStatus: stack.operationalStatus,
    degradedModes: stack.degradedModes,
    message: "Génération lancée depuis le Chapter Studio.",
  });
}
