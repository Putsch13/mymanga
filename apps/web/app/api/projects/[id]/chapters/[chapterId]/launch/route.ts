import { NextResponse } from "next/server";
import { buildChapterReadinessReport } from "@manga-ai-studio/core";
import { estimateChapterTextTokensFromRules } from "@manga-ai-studio/billing";
import { prisma, type Prisma } from "@manga-ai-studio/db";
import { runFullChapterPipelineFromJob, sendChapterGenerateRequested } from "@manga-ai-studio/workflow";
import { getAppUser } from "@/lib/auth/get-app-user";
import { canAccessMatureContent, getAgeGateMessage, projectRequiresAgeGate } from "@/lib/age-gate";
import { badRequest, notFound, unauthorized, validationError } from "@/lib/api-response";
import { getGenerationStackStatus } from "@/lib/generation/stack-readiness";
import { checkRateLimit } from "@/lib/rate-limit";
import { buildChapterStructuredRuntimePrismaFields, readChapterStudioSnapshotFromOutline } from "@/lib/chapter-studio";
import {
  assertPremiumContract,
  buildGenerationJobInputFromSnapshot,
  resolveApprovedOutlineFromSnapshot,
} from "@/lib/premium-chapter-contract";

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

  const chapterOutlineRecord = asRecord(chapter.outline);

  // Résoudre l'approvedOutline depuis le contrat premium persisté — jamais de builder legacy
  const approvedOutline = resolveApprovedOutlineFromSnapshot(snapshot, chapterOutlineRecord);
  if (!approvedOutline) {
    return badRequest("Aucun outline validé n'est disponible pour lancer la génération.");
  }

  // Vérifier le contrat premium complet avant lancement
  const contractCheck = assertPremiumContract(snapshot, chapterOutlineRecord);
  if (!contractCheck.ok) {
    console.warn(`[launch] premium_contract_incomplete chapterId=${chapterId} missing=${contractCheck.missing.join(", ")}`);
    return NextResponse.json(
      {
        error: "premium_contract_incomplete",
        missing: contractCheck.missing,
        message: contractCheck.message,
      },
      { status: 422 },
    );
  }

  // Traçabilité estimate → launch
  const estimateContext = snapshot.data.estimateContext;
  if (estimateContext?.targetChapterId && estimateContext.targetChapterId !== chapterId) {
    console.warn(
      `[launch] estimate_context_mismatch chapterId=${chapterId} estimateTargetChapterId=${estimateContext.targetChapterId} — invalidating context`,
    );
  }
  if (estimateContext) {
    console.log(
      `[launch] estimate_context chapterId=${chapterId} targetChapterId=${estimateContext.targetChapterId ?? "none"} estimateSource=${estimateContext.estimateSource ?? "unknown"} estimatedAt=${estimateContext.estimatedAt ?? "unknown"} divergence=${estimateContext.targetChapterId && estimateContext.targetChapterId !== chapterId ? "YES" : "NO"}`,
    );
  }

  // Logs premium structurés
  const _pp = snapshot.data.productionPlan;
  console.log(
    `[launch] premium_launch projectId=${projectId} chapterId=${chapterId} ` +
    `approvedOutlineVersion=${approvedOutline.approvalVersion} ` +
    `beatCount=${approvedOutline.beats.length} ` +
    `productionOutlineBeatCount=${snapshot.data.productionOutline?.beats?.length ?? 0} ` +
    `productionPlanPageCount=${Array.isArray(_pp?.pages) ? _pp.pages.length : 0} ` +
    `panelBlueprintCount=${Array.isArray(_pp?.panelBlueprints) ? _pp.panelBlueprints.length : 0} ` +
    `heroCenterRatio=${_pp?.heroCenterRatio ?? "n/a"} ` +
    `premiumReadinessScore=${_pp?.premiumReadinessScore ?? "n/a"} ` +
    `propCoverage=${JSON.stringify(_pp?.propCoverage ?? null)} ` +
    `enemyCoverage=${JSON.stringify(_pp?.enemyCoverage ?? null)} ` +
    `npcCoverage=${JSON.stringify(_pp?.npcCoverage ?? null)} ` +
    `cutawayCoverage=${JSON.stringify(_pp?.cutawayCoverage ?? null)} ` +
    `dialogueAnchorCoverage=${JSON.stringify(_pp?.dialogueAnchorCoverage ?? null)}`,
  );

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
        ...chapterOutlineRecord,
        studio: nextSnapshot,
        approvedOutline,
      } as unknown) as Prisma.InputJsonValue,
    },
  });

  // Construire le job input premium — même helper que /pipeline
  const jobInput = buildGenerationJobInputFromSnapshot({
    chapterId,
    source: "chapter_studio_launch",
    snapshot,
    approvedOutline,
    selectedPlotLabel: snapshot.data.selectedPlotLabel ?? "bold",
    creativityControls: snapshot.data.creativityControls as Record<string, unknown> | null ?? null,
    focusCharacterIds: [],
    estimateContext: estimateContext
      ? {
          targetChapterId: estimateContext.targetChapterId ?? null,
          targetChapterNumber: estimateContext.targetChapterNumber ?? null,
          estimateSource: estimateContext.estimateSource,
          estimatedAt: estimateContext.estimatedAt,
          divergenceDetected: !!(estimateContext.targetChapterId && estimateContext.targetChapterId !== chapterId),
        }
      : null,
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
      input: jobInput as unknown as Prisma.InputJsonValue,
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
