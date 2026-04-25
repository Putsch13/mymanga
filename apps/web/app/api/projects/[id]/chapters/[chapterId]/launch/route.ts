import { NextResponse } from "next/server";
import {
  buildCanonicalProductionPlanFromPremiumBlueprints,
  buildChapterReadinessReport,
  PREMIUM_PANEL_RANGE,
  type PanelBlueprintPremium,
} from "@manga-ai-studio/core";
import { computeShotVarietyBudget, computeContractualFocusAdequacy } from "@manga-ai-studio/ai";
import { estimateChapterTextTokensFromRules } from "@manga-ai-studio/billing";
import { isUnlimitedAdminEmail } from "@/lib/auth/get-app-user";
import { prisma } from "@manga-ai-studio/db";
import {
  runFullChapterPipelineFromJob,
  sendChapterGenerateRequested,
  isPipelineV3StoryboardEnabled,
} from "@manga-ai-studio/workflow";
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
  IncompletePlanError,
  resolveApprovedOutlineFromSnapshot,
} from "@/lib/premium-chapter-contract";
import { assertChapterCanonReadiness } from "@/lib/canon/assert-chapter-canon-readiness";
import { toPrismaInputJson } from "@/lib/to-prisma-input-json";
import { premiumVisualQaPreflightResponse } from "@/lib/generation/premium-visual-qa-preflight";
import { isVisualContractPrelaunchBlocked } from "@/lib/visual-contract-prelaunch-gate";

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

  // HARD GUARD : le launch premium DOIT tourner via la pipeline v3 (Story
  // Architect → Manga Editor → Panel Renderer). Le legacy path cumule trop
  // de bugs (padding 40→75, routing aveugle, prompts contradictoires,
  // referencePolicy NONE sur héros, coverage mensongère). On refuse
  // explicitement la launch si le flag v3 n'est pas actif — pas de
  // fallback silencieux.
  if (!isPipelineV3StoryboardEnabled()) {
    console.warn(
      `[launch] premium_pipeline_v3_required chapterId=${chapterId} — set PIPELINE_V3_STORYBOARD=true to enable premium rendering`,
    );
    return NextResponse.json(
      {
        error: "premium_pipeline_v3_required",
        code: "PREMIUM_PIPELINE_V3_REQUIRED",
        message:
          "Le lancement premium nécessite la pipeline v3 (PIPELINE_V3_STORYBOARD=true). Le chemin legacy est désactivé pour les chapitres premium.",
      },
      { status: 409 },
    );
  }

  const visualQaBlocked = premiumVisualQaPreflightResponse();
  if (visualQaBlocked) {
    console.warn(
      `[launch] premium_visual_qa_preflight_failed chapterId=${chapterId} — job non créé (config serveur)`,
    );
    return visualQaBlocked;
  }

  // P0.4 — V3 premium nécessite FAL + storage durable
  if (!stack.canRunV3Premium) {
    const missingComponents: string[] = [];
    if (!stack.hasFal) missingComponents.push("FAL_KEY");
    if (!stack.hasStoragePersistence) missingComponents.push("SUPABASE storage (SUPABASE_SERVICE_ROLE_KEY + STORAGE_BUCKET)");
    if (!stack.hasOpenAI) missingComponents.push("OPENAI_API_KEY");
    if (process.env.NODE_ENV === "production" && !stack.visionPremiumQaEnvReady) {
      missingComponents.push("VISUAL_PANEL_QA_VISION=true et ENABLE_PREMIUM_VISION_QA=true");
    }

    console.warn(
      `[launch] v3_premium_stack_incomplete chapterId=${chapterId} missing=[${missingComponents.join(", ")}]`,
    );
    return NextResponse.json(
      {
        error: "v3_premium_stack_incomplete",
        code: "V3_PREMIUM_STACK_INCOMPLETE",
        message: `Le pipeline V3 premium nécessite: ${missingComponents.join(", ")}`,
        missingComponents,
      },
      { status: 409 },
    );
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

  const chapterCharacterSelection = asRecord(snapshot.data.characterSelection);
  const snapshotDataRecord = asRecord(snapshot.data);
  const focusCharacterIds = Array.isArray(chapterCharacterSelection.activeCharacterIds)
    ? chapterCharacterSelection.activeCharacterIds.filter(
        (id): id is string => typeof id === "string" && id.length > 0,
      )
    : [];
  const lockedCharacterIds = Array.isArray(chapterCharacterSelection.lockedCharacterIds)
    ? chapterCharacterSelection.lockedCharacterIds.filter(
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
  const requiredCanonCharacterIds = Array.from(new Set([...focusCharacterIds, ...lockedCharacterIds]));

  const chapterOutlineRecord = asRecord(chapter.outline);

  // Résoudre l'approvedOutline depuis le contrat premium persisté — jamais de builder legacy
  const approvedOutline = resolveApprovedOutlineFromSnapshot(snapshot, chapterOutlineRecord);
  if (!approvedOutline) {
    return badRequest("Aucun outline validé n'est disponible pour lancer la génération.");
  }

  // BUG-22 fix : resolveApprovedOutlineFromSnapshot peut reconstruire l'outline depuis
  // productionOutline (fallback) sans l'écrire dans chapterOutlineRecord. On synchronise
  // l'objet en mémoire pour que assertPremiumContract le voit correctement.
  chapterOutlineRecord.approvedOutline = approvedOutline as Record<string, unknown>;

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

  // QA structurelle canonique sur les blueprints réels (même logique que /estimate → canonicalProductionPlan).
  const outlineForStructuralQa =
    snapshot.data.productionOutline && typeof snapshot.data.productionOutline === "object"
      ? snapshot.data.productionOutline
      : {
          source: "approved_fallback",
          chapterGoal: typeof approvedOutline.summary === "string" ? approvedOutline.summary : "",
          cliffhanger: typeof approvedOutline.cliffhanger === "string" ? approvedOutline.cliffhanger : "",
          beats: approvedOutline.beats,
        };
  const bpStructural = snapshot.data.productionPlan?.panelBlueprints;
  if (Array.isArray(bpStructural) && bpStructural.length > 0) {
    const fmt = chapter.project.format === "webtoon" ? "webtoon" : "manga";
    const structuralPlan = buildCanonicalProductionPlanFromPremiumBlueprints({
      chapterId,
      projectId,
      chapterNumber: chapter.chapterNumber,
      chapterTitle: chapter.title ?? "",
      format: fmt,
      productionOutline: outlineForStructuralQa,
      blueprints: bpStructural as PanelBlueprintPremium[],
    });
    if (!structuralPlan.qa.valid) {
      console.warn(
        `[launch] production_plan_structural_qa_failed chapterId=${chapterId} errors=${JSON.stringify(structuralPlan.qa.errors)}`,
      );
      return NextResponse.json(
        {
          error: "production_plan_structural_qa_failed",
          code: "PRODUCTION_PLAN_STRUCTURAL_QA_FAILED",
          message:
            "Le plan de production ne passe pas la QA structurelle (panels, ratios cutaway / actor-driven, couverture des beats). Corrige le plan avant de lancer.",
          structuralQa: structuralPlan.qa,
        },
        { status: 422 },
      );
    }
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

    // P1.2 + P1.3 + P3.1 + P3.2 : variété de cadrage ≠ variété de sujet.
    // On lit le focusBudget persisté (P1.1) et on refuse les plans trop
    // héros-centrés, ou sans plans de coupe contractuels (arme, décor,
    // ennemi, PNJ). Complémentaire du shotVariety check ci-dessus.
    try {
      const contractualFocus = computeContractualFocusAdequacy(
        blueprintsForVariety as Parameters<typeof computeContractualFocusAdequacy>[0],
      );
      const persistedFocusBudget = snapshot.data.productionPlan?.focusBudget ?? null;
      const persistedBlockingViolations = persistedFocusBudget?.violations?.filter(
        (v) => v.severity === "blocking",
      ) ?? [];

      if (contractualFocus.blocking || persistedBlockingViolations.length > 0) {
        const mergedViolations = [
          ...contractualFocus.violations,
          ...persistedBlockingViolations,
        ];
        console.warn(
          `[launch] contractual_focus_inadequate chapterId=${chapterId} ` +
          `score=${contractualFocus.score.toFixed(2)} ` +
          `heroCenterRatio=${contractualFocus.heroCenterRatio.toFixed(2)} ` +
          `envPanels=${contractualFocus.environmentPanels} ` +
          `propInserts=${contractualFocus.propInsertPanels} ` +
          `enemyFocus=${contractualFocus.enemyFocusPanels} ` +
          `npcPanels=${contractualFocus.npcPanels} ` +
          `violations=${JSON.stringify(mergedViolations.map((v) => v.type))}`,
        );
        return NextResponse.json(
          {
            error:
              "Le plan est trop centré héros ou manque de cutaways contractuels " +
              "(décor, arme, PNJ, ennemi). Régénère le plan de production.",
            code: "CONTRACTUAL_FOCUS_INADEQUATE",
            score: contractualFocus.score,
            heroCenterRatio: contractualFocus.heroCenterRatio,
            violations: mergedViolations,
            counters: {
              environmentPanels: contractualFocus.environmentPanels,
              propInsertPanels: contractualFocus.propInsertPanels,
              enemyFocusPanels: contractualFocus.enemyFocusPanels,
              npcPanels: contractualFocus.npcPanels,
              reactionPanels: contractualFocus.reactionPanels,
              aftermathPanels: contractualFocus.aftermathPanels,
            },
          },
          { status: 422 },
        );
      }
    } catch (focusErr) {
      console.warn(
        `[launch] contractual_focus_check_failed (non-blocking): ${focusErr instanceof Error ? focusErr.message : focusErr}`,
      );
    }

    // Sprint B — Shot Plan reliability guard. On relit le shot plan persisté
    // dans `productionPlan.shotPlan` (produit par /estimate) et on bloque
    // la launch si un blocker est présent (HERO_OVERLOAD, MISSING_CUTAWAYS,
    // MISSING_ENVIRONMENT, SHOT_MONOTONY, EMPTY_PLAN). C'est un filet en plus
    // du contractual focus, avec un rapport human-readable pour l'auteur.
    try {
      const productionPlanRec = asRecord(snapshot.data.productionPlan ?? undefined);
      const shotPlanRaw = productionPlanRec.shotPlan;
      const persistedShotPlan =
        shotPlanRaw && typeof shotPlanRaw === "object" && !Array.isArray(shotPlanRaw)
          ? asRecord(shotPlanRaw)
          : null;
      const reliabilityRaw = persistedShotPlan?.reliability;
      const reliability =
        reliabilityRaw && typeof reliabilityRaw === "object" && !Array.isArray(reliabilityRaw)
          ? asRecord(reliabilityRaw)
          : null;
      if (reliability && reliability.launchAllowed === false) {
        const blockers = Array.isArray(reliability.blockers) ? reliability.blockers : [];
        const blockerCodes = blockers.map((b) =>
          b && typeof b === "object" && !Array.isArray(b) && typeof (b as Record<string, unknown>).code === "string"
            ? (b as Record<string, unknown>).code
            : "unknown",
        );
        console.warn(
          `[launch] shot_plan_unreliable chapterId=${chapterId} ` +
            `score=${(typeof reliability.score === "number" ? reliability.score : 0).toFixed(2)} ` +
            `blockers=${JSON.stringify(blockerCodes)}`,
        );
        return NextResponse.json(
          {
            error:
              "Le shot plan du chapitre a des blocages critiques " +
              "(héros trop centré, pas assez de coupes, décor absent, cadrages monotones). " +
              "Régénère le plan de production.",
            code: "SHOT_PLAN_UNRELIABLE",
            score: typeof reliability.score === "number" ? reliability.score : null,
            blockers,
            humanReadable:
              persistedShotPlan && typeof persistedShotPlan.humanReadable === "string"
                ? persistedShotPlan.humanReadable
                : undefined,
          },
          { status: 422 },
        );
      }
    } catch (shotPlanErr) {
      console.warn(
        `[launch] shot_plan_check_failed (non-blocking): ${shotPlanErr instanceof Error ? shotPlanErr.message : shotPlanErr}`,
      );
    }
  }

  // P0.5 : garde "canon health" sur les personnages critiques (hero,
  // antagonist, lockés). Un chapitre avec un héros sans assise canonique
  // génère quasi mécaniquement du drift : on bloque.
  try {
    const canonReport = await assertChapterCanonReadiness({
      projectId,
      requiredCharacterIds: requiredCanonCharacterIds.length > 0 ? requiredCanonCharacterIds : null,
    });
    if (canonReport.blocking) {
      console.warn(
        `[launch] canon_readiness_blocked chapterId=${chapterId} ` +
        `violations=${JSON.stringify(
          canonReport.violations
            .filter((v) => v.severity === "blocking")
            .map((v) => ({ id: v.characterId, score: v.score, reason: v.reason })),
        )}`,
      );
      return NextResponse.json(
        {
          error:
            "Un ou plusieurs personnages critiques (héros, antagoniste, lockés) " +
            "n'ont pas une assise canonique suffisante pour lancer le chapitre. " +
            "Régénère leurs visuels canoniques ou active leur visual lock.",
          code: "CANON_READINESS_BLOCKED",
          violations: canonReport.violations,
          thresholds: canonReport.thresholds,
        },
        { status: 422 },
      );
    }
    if (canonReport.violations.length > 0) {
      console.warn(
        `[launch] canon_readiness_warnings chapterId=${chapterId} count=${canonReport.violations.length}`,
      );
    }
  } catch (canonErr) {
    console.warn(
      `[launch] canon_readiness_check_failed (non-blocking): ${canonErr instanceof Error ? canonErr.message : canonErr}`,
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
    missingImages: chapter.missingImages ?? (nextSnapshot.data.readinessReport?.imageCounts.minimumImages ?? PREMIUM_PANEL_RANGE.min),
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

  // Construire le job input premium — même helper que /pipeline
  let jobInput: Record<string, unknown>;
  try {
    jobInput = buildGenerationJobInputFromSnapshot({
      chapterId,
      source: "chapter_studio_launch",
      snapshot,
      approvedOutline,
      selectedPlotLabel: snapshot.data.selectedPlotLabel ?? "bold",
      creativityControls:
        snapshot.data.creativityControls == null ? null : asRecord(snapshot.data.creativityControls),
      heroCharacterId,
      focusCharacterIds,
      activeNpcIds,
      activeCreatureIds,
      locationIds,
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
    // P0.6 : plan incomplet = refus propre, pas d'expansion silencieuse.
    if (err instanceof IncompletePlanError) {
      // P1.2 — observabilité structurée. On cherche combien de chapitres
      // sortent incomplets en prod, avec quel gap et sous quelle source de
      // contrat (premium vs legacy_adapted).
      const productionPlanRec = asRecord(snapshot.data.productionPlan ?? undefined);
      const productionPlanSource =
        typeof productionPlanRec.source === "string" ? productionPlanRec.source : "unknown";
      const productionOutlineRec = asRecord(snapshot.data.productionOutline ?? undefined);
      const productionOutlineSource =
        typeof productionOutlineRec.source === "string" ? productionOutlineRec.source : "unknown";
      console.warn(
        `[launch] incomplete_plan userId=${user.id} projectId=${projectId} chapterId=${chapterId} ` +
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
      input: toPrismaInputJson(jobInput),
      output: {
        currentStep: "queued",
        steps: [],
        operationalStatus: stack.operationalStatus,
        degradedModes: stack.degradedModes,
        stackWarnings: stack.warnings,
        focusCharacterIds,
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
