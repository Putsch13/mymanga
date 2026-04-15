import { NextResponse } from "next/server";
import { z } from "zod";
import { buildChapterReadinessReport } from "@manga-ai-studio/core";
import { estimateChapterTextTokensFromRules } from "@manga-ai-studio/billing";
import { prisma } from "@manga-ai-studio/db";
import { runFullChapterPipelineFromJob, sendChapterGenerateRequested } from "@manga-ai-studio/workflow";
import { getAppUser } from "@/lib/auth/get-app-user";
import { canAccessMatureContent, getAgeGateMessage, projectRequiresAgeGate } from "@/lib/age-gate";
import { notFound, unauthorized, badRequest, validationError } from "@/lib/api-response";
import { getGenerationStackStatus } from "@/lib/generation/stack-readiness";
import { checkRateLimit } from "@/lib/rate-limit";
import { readChapterStudioSnapshotFromOutline } from "@/lib/chapter-studio";
import {
  assertPremiumContract,
  buildGenerationJobInputFromSnapshot,
  resolveApprovedOutlineFromSnapshot,
} from "@/lib/premium-chapter-contract";
import type { Prisma } from "@manga-ai-studio/db";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  chapterId: z.string().min(1),
  focusCharacterIds: z.array(z.string()).optional(),
  selectedPlotLabel: z.enum(["safe", "bold", "shock"]).optional(),
  creativityControls: z.object({
    noveltyLevel: z.number().int().min(0).max(100).optional(),
    worldStrictness: z.number().int().min(0).max(100).optional(),
    visualExoticism: z.number().int().min(0).max(100).optional(),
    npcVariety: z.number().int().min(0).max(100).optional(),
    environmentRichness: z.number().int().min(0).max(100).optional(),
  }).optional(),
});

const draftSetupSchema = z.object({
  focusCharacterIds: z.array(z.string()).optional(),
  selectedPlotLabel: z.enum(["safe", "bold", "shock"]).nullable().optional(),
  creativityControls: z.object({
    noveltyLevel: z.number().int().min(0).max(100).optional(),
    worldStrictness: z.number().int().min(0).max(100).optional(),
    visualExoticism: z.number().int().min(0).max(100).optional(),
    npcVariety: z.number().int().min(0).max(100).optional(),
    environmentRichness: z.number().int().min(0).max(100).optional(),
  }).optional(),
});

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Enfile le pipeline Inngest manga-first (texte + DA découpée).
 * Utilise exclusivement le contrat premium persisté — aucun fallback legacy.
 */
export async function POST(req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const rl = await checkRateLimit(user.id, "pipeline");
  if (!rl.ok) {
    return NextResponse.json({ error: rl.message }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSecs) } });
  }
  const stack = getGenerationStackStatus();
  if (!stack.canGenerateChapters) {
    return validationError("La stack de generation n'est pas prete pour un chapitre complet.", stack);
  }
  const { id: projectId } = await ctx.params;
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: user.id },
    include: { user: { include: { preferences: true } } },
  });
  if (!project) return notFound();
  if (projectRequiresAgeGate(project.contentRating, project.intensityLayer) && !canAccessMatureContent(project.user, project.user.preferences)) {
    return validationError(getAgeGateMessage(project.contentRating));
  }
  if (canAccessMatureContent(project.user, project.user.preferences) && project.user.email?.toLowerCase() === "test@gmail.com") {
    console.warn(`[adult-bypass] test@gmail.com bypassed mature gate on /api/projects/${projectId}/pipeline`);
  }
  const body = bodySchema.parse(await req.json());
  const chapter = await prisma.chapter.findFirst({
    where: { id: body.chapterId, projectId },
  });
  if (!chapter) return badRequest("Chapitre introuvable");

  const chapterOutlineRecord = asRecord(chapter.outline);

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

  // Résoudre l'approvedOutline depuis le contrat premium — jamais de builder legacy
  const approvedOutline = resolveApprovedOutlineFromSnapshot(snapshot, chapterOutlineRecord);
  if (!approvedOutline) {
    return validationError("Valide d'abord le plan détaillé du chapitre avant de lancer la génération.");
  }

  const existingAo = chapterOutlineRecord.approvedOutline as Record<string, unknown> | undefined;
  const existingBeats = Array.isArray(existingAo?.beats) ? existingAo.beats : [];

  if (existingBeats.length === 0 && Array.isArray(approvedOutline.beats) && approvedOutline.beats.length > 0) {
    await prisma.chapter.update({
      where: { id: body.chapterId },
      data: { outline: { ...chapterOutlineRecord, approvedOutline } as never },
    });
    console.log(`[pipeline] approvedOutline persisted chapterId=${body.chapterId} beats=${approvedOutline.beats.length}`);
  }

  // Vérifier le contrat premium complet avant lancement
  const contractCheck = assertPremiumContract(snapshot, chapterOutlineRecord);
  if (!contractCheck.ok) {
    console.warn(`[pipeline] premium_contract_incomplete chapterId=${body.chapterId} missing=${contractCheck.missing.join(", ")}`);
    return NextResponse.json(
      {
        error: "premium_contract_incomplete",
        missing: contractCheck.missing,
        message: contractCheck.message,
      },
      { status: 422 },
    );
  }

  const draftSetup = draftSetupSchema.safeParse(chapterOutlineRecord.draftSetup);
  const focusCharacterIds =
    body.focusCharacterIds && body.focusCharacterIds.length > 0
      ? body.focusCharacterIds
      : draftSetup.success
        ? (draftSetup.data.focusCharacterIds ?? [])
        : [];
  const selectedPlotLabel =
    body.selectedPlotLabel ?? (draftSetup.success ? draftSetup.data.selectedPlotLabel ?? undefined : undefined);
  const creativityControls =
    body.creativityControls ?? (draftSetup.success ? draftSetup.data.creativityControls ?? undefined : undefined);

  // Logs premium structurés
  const _pp = snapshot.data.productionPlan;
  console.log(
    `[pipeline] premium_launch projectId=${projectId} chapterId=${body.chapterId} ` +
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

  // Construire le job input premium — même helper que /launch
  const jobInput = buildGenerationJobInputFromSnapshot({
    chapterId: body.chapterId,
    source: "pipeline_route",
    snapshot,
    approvedOutline,
    selectedPlotLabel: selectedPlotLabel ?? "bold",
    creativityControls: (creativityControls ?? null) as Record<string, unknown> | null,
    focusCharacterIds,
    estimateContext: null,
  });

  const estimatedCost = await estimateChapterTextTokensFromRules();
  const job = await prisma.job.create({
    data: {
      userId: user.id,
      projectId,
      chapterId: chapter.id,
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
    chapterId: chapter.id,
    userId: user.id,
  });

  if (!sent.ok) {
    try {
      const run = await runFullChapterPipelineFromJob(job.id);
      return NextResponse.json({
        ok: run.ok,
        jobId: job.id,
        operationalStatus: stack.operationalStatus,
        degradedModes: stack.degradedModes,
        message: run.ok
          ? "Pipeline exécuté immédiatement (Inngest non configuré)."
          : `Échec pipeline : ${run.error ?? "inconnu"}`,
      });
    } catch (pipelineError) {
      const msg = pipelineError instanceof Error ? pipelineError.message : "pipeline_crash";
      console.error("[pipeline/route] crash:", msg);
      return NextResponse.json({
        ok: false,
        jobId: job.id,
        operationalStatus: stack.operationalStatus,
        degradedModes: stack.degradedModes,
        message: `Crash pipeline : ${msg}`,
      }, { status: 500 });
    }
  }

  return NextResponse.json({
    ok: true,
    jobId: job.id,
    inngest: sent,
    operationalStatus: stack.operationalStatus,
    degradedModes: stack.degradedModes,
    stackWarnings: stack.warnings,
    message: "Pipeline enqueued (Inngest).",
  });
}
