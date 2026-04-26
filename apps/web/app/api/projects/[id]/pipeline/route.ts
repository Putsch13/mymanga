import { NextResponse } from "next/server";
import { z } from "zod";
import { buildChapterReadinessReport } from "@manga-ai-studio/core";
import { estimateChapterTextTokensFromRules } from "@manga-ai-studio/billing";
import { prisma } from "@manga-ai-studio/db";
import { runFullChapterPipelineFromJob, sendChapterGenerateRequested } from "@manga-ai-studio/workflow";
import { getAppUser } from "@/lib/auth/get-app-user";
import { canAccessMatureContent, canBypassMatureContent, getAgeGateMessage, projectRequiresAgeGate } from "@/lib/age-gate";
import { notFound, unauthorized, badRequest, validationError } from "@/lib/api-response";
import { getGenerationStackStatus } from "@/lib/generation/stack-readiness";
import { premiumVisualQaPreflightResponse } from "@/lib/generation/premium-visual-qa-preflight";
import { checkRateLimit } from "@/lib/rate-limit";
import { readChapterStudioSnapshotFromOutline } from "@/lib/chapter-studio";
import {
  assertPremiumContract,
  buildGenerationJobInputFromSnapshot,
  InvalidBlueprintsError,
  IncompletePlanError,
  resolveApprovedOutlineFromSnapshot,
} from "@/lib/premium-chapter-contract";
import { isVisualContractPrelaunchBlocked } from "@/lib/visual-contract-prelaunch-gate";
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

  const visualQaBlocked = premiumVisualQaPreflightResponse();
  if (visualQaBlocked) {
    console.warn(`[pipeline] premium_visual_qa_preflight_failed — job non créé (config serveur)`);
    return visualQaBlocked;
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
  if (canBypassMatureContent(project.user.email)) {
    console.warn(`[adult-bypass] ${project.user.email} bypassed mature gate on /api/projects/${projectId}/pipeline (NODE_ENV=${process.env.NODE_ENV})`);
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

  // ─── Extraction des données canoniques du cast (aligné avec /launch) ───────
  const chapterCharacterSelection = asRecord(snapshot.data.characterSelection);
  const snapshotDataRecord = asRecord(snapshot.data);
  const extractedFocusCharacterIds = Array.isArray(chapterCharacterSelection.activeCharacterIds)
    ? chapterCharacterSelection.activeCharacterIds.filter(
        (id): id is string => typeof id === "string" && id.length > 0,
      )
    : [];
  const heroCharacterId =
    typeof chapterCharacterSelection.heroCharacterId === "string" && chapterCharacterSelection.heroCharacterId.length > 0
      ? chapterCharacterSelection.heroCharacterId
      : null;
  const activeNpcIds = Array.isArray(snapshotDataRecord.activeNpcIds)
    ? snapshotDataRecord.activeNpcIds.filter(
        (id): id is string => typeof id === "string" && id.length > 0,
      )
    : [];
  const activeCreatureIds = Array.isArray(snapshotDataRecord.activeCreatureIds)
    ? snapshotDataRecord.activeCreatureIds.filter(
        (id): id is string => typeof id === "string" && id.length > 0,
      )
    : [];
  const locationIds = Array.isArray(snapshotDataRecord.locationIds)
    ? snapshotDataRecord.locationIds.filter(
        (id): id is string => typeof id === "string" && id.length > 0,
      )
    : [];

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

  // BUG-22 fix : synchroniser l'objet en mémoire avec ce qu'on vient de persister (ou ce qu'on
  // a résolu via resolveApprovedOutlineFromSnapshot). Sans ça, assertPremiumContract lit un
  // chapterOutlineRecord stale et remonte "approvedOutline.beats manquant ou vide" à tort.
  chapterOutlineRecord.approvedOutline = approvedOutline as unknown as Record<string, unknown>;

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

  if (isVisualContractPrelaunchBlocked(chapter.outline, chapter.generatedImages ?? 0)) {
    return NextResponse.json(
      {
        error: "visual_contract_prelaunch_required",
        code: "VISUAL_CONTRACT_PRELAUNCH_REQUIRED",
        message:
          "Avant le tout premier lancement, confirme dans le studio le panneau « Contrat visuel » (case de confirmation en bas).",
      },
      { status: 422 },
    );
  }

  const draftSetup = draftSetupSchema.safeParse(chapterOutlineRecord.draftSetup);
  // Priorité : body > snapshot characterSelection > draftSetup
  const focusCharacterIds =
    body.focusCharacterIds && body.focusCharacterIds.length > 0
      ? body.focusCharacterIds
      : extractedFocusCharacterIds.length > 0
        ? extractedFocusCharacterIds
        : draftSetup.success
          ? (draftSetup.data.focusCharacterIds ?? [])
          : [];
  const selectedPlotLabel =
    body.selectedPlotLabel ?? (draftSetup.success ? draftSetup.data.selectedPlotLabel ?? undefined : undefined);
  const creativityControls =
    body.creativityControls ?? (draftSetup.success ? draftSetup.data.creativityControls ?? undefined : undefined);

  // Log cast canonique (aligné avec les logs attendus)
  console.log(
    `[pipeline] cast_contract_input chapterId=${body.chapterId} ` +
    `hero=${heroCharacterId ?? "none"} ` +
    `focus=${focusCharacterIds.length} ` +
    `activeNpc=${activeNpcIds.length} ` +
    `locations=${locationIds.length}`,
  );

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
  // Alignement complet avec /launch : on passe le cast canonique
  let jobInput: Record<string, unknown>;
  try {
    jobInput = buildGenerationJobInputFromSnapshot({
      chapterId: body.chapterId,
      source: "pipeline_route",
      snapshot,
      approvedOutline,
      selectedPlotLabel: selectedPlotLabel ?? "bold",
      creativityControls: (creativityControls ?? null) as Record<string, unknown> | null,
      heroCharacterId,
      focusCharacterIds,
      activeNpcIds,
      activeCreatureIds,
      locationIds,
      estimateContext: null,
    });
  } catch (err) {
    // P1-3 : blueprints invalides = refus propre du lancement.
    if (err instanceof InvalidBlueprintsError) {
      console.warn(
        `[pipeline] invalid_blueprints chapterId=${body.chapterId} total=${err.totalInvalid} sample=${JSON.stringify(err.invalidBlueprints.slice(0, 3))}`,
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
    if (err instanceof IncompletePlanError) {
      // P1.2 — observabilité structurée : on veut mesurer combien de
      // chapitres sortent incomplets en prod et pour quelle raison.
      const productionPlanSource =
        (snapshot.data.productionPlan as { source?: string } | undefined)?.source ?? "unknown";
      const productionOutlineSource =
        (snapshot.data.productionOutline as { source?: string } | undefined)?.source ?? "unknown";
      console.warn(
        `[pipeline] incomplete_plan userId=${user.id} projectId=${projectId} chapterId=${body.chapterId} ` +
        `blueprints=${err.panelBlueprintCount} minimum=${err.minimumImages} ` +
        `gap=${err.minimumImages - err.panelBlueprintCount} ` +
        `productionPlanSource=${productionPlanSource} ` +
        `productionOutlineSource=${productionOutlineSource} ` +
        `contractStatus=${snapshot.data.readinessReport?.contractStatus ?? "n/a"} ` +
        `readinessLaunchBlocked=${snapshot.data.readinessReport?.launchBlocked ?? "n/a"}`,
      );
      return NextResponse.json(
        {
          error: "incomplete_plan",
          code: err.code,
          panelBlueprintCount: err.panelBlueprintCount,
          minimumImages: err.minimumImages,
          message: err.message,
        },
        { status: 422 },
      );
    }
    throw err;
  }

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
