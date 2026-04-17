import { NextResponse } from "next/server";
import { buildChapterReadinessReport } from "@manga-ai-studio/core";
import { computeShotVarietyBudget } from "@manga-ai-studio/ai";
import { estimateChapterTextTokensFromRules } from "@manga-ai-studio/billing";
import { isUnlimitedAdminEmail } from "@/lib/auth/get-app-user";
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
  InvalidBlueprintsError,
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

  const rl = await checkRateLimit(user.id, "pipeline");
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

  // BUG-22 fix : resolveApprovedOutlineFromSnapshot peut reconstruire l'outline depuis
  // productionOutline (fallback) sans l'écrire dans chapterOutlineRecord. On synchronise
  // l'objet en mémoire pour que assertPremiumContract le voit correctement.
  chapterOutlineRecord.approvedOutline = approvedOutline as unknown as Record<string, unknown>;

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

  // B3-3 : Shot Variety Enforcer — vérifier la variété des plans avant lancement
  const blueprintsForVariety = snapshot.data.productionPlan?.panelBlueprints;
  if (Array.isArray(blueprintsForVariety) && blueprintsForVariety.length > 0) {
    try {
      const shotVariety = computeShotVarietyBudget(blueprintsForVariety as Parameters<typeof computeShotVarietyBudget>[0]);
      if (shotVariety.varietyScore < 0.4) {
        console.warn(
          `[launch] shot_monotony chapterId=${chapterId} varietyScore=${shotVariety.varietyScore.toFixed(2)} missingShots=${JSON.stringify(shotVariety.missingShots ?? [])}`,
        );
        return NextResponse.json(
          {
            error: "Variété de plans insuffisante pour lancer la génération.",
            code: "SHOT_MONOTONY",
            varietyScore: shotVariety.varietyScore,
            missingShots: shotVariety.missingShots ?? [],
          },
          { status: 422 },
        );
      }
    } catch (varietyErr) {
      console.warn(`[launch] shot_variety_check_failed (non-blocking): ${varietyErr instanceof Error ? varietyErr.message : varietyErr}`);
    }
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
    missingImages: chapter.missingImages ?? (nextSnapshot.data.readinessReport?.imageCounts.minimumImages ?? 75),
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
  let jobInput: Record<string, unknown>;
  try {
    jobInput = buildGenerationJobInputFromSnapshot({
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
  } catch (err) {
    // P1-3 : blueprints invalides = refus propre du lancement.
    if (err instanceof InvalidBlueprintsError) {
      console.warn(
        `[launch] invalid_blueprints chapterId=${chapterId} total=${err.totalInvalid} sample=${JSON.stringify(err.invalidBlueprints.slice(0, 3))}`,
      );
      return NextResponse.json(
        {
          error: "invalid_blueprints",
          code: err.code,
          totalInvalid: err.totalInvalid,
          invalidBlueprints: err.invalidBlueprints,
          message: err.message,
        },
        { status: 422 },
      );
    }
    throw err;
  }

  const estimatedCost = await estimateChapterTextTokensFromRules();

  // F1 : Vérification du solde wallet avant lancement (non-bloquant pour les admins)
  if (!isUnlimitedAdminEmail(user.email)) {
    const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
    if (wallet && wallet.balance < estimatedCost) {
      console.warn(
        `[launch] insufficient_balance userId=${user.id} required=${estimatedCost} available=${wallet.balance} shortfall=${estimatedCost - wallet.balance}`,
      );
      return NextResponse.json(
        {
          error: "Solde insuffisant pour lancer la génération.",
          code: "INSUFFICIENT_BALANCE",
          required: estimatedCost,
          available: wallet.balance,
          shortfall: estimatedCost - wallet.balance,
        },
        { status: 402 },
      );
    }
  }

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
