import { NextResponse } from "next/server";
import {
  buildCanonicalProductionPlanFromPremiumBlueprints,
  buildChapterReadinessReport,
  buildPanelTraceabilityReport,
  computeNarrativeMemoryDigestFromOutline,
  computePanelContinuityPreflights,
  continuityPreflightBlockingReasons,
  canonPackPreflightBlockingReasons,
  buildIntentNarrativeContract,
  runIntentCoverageQa,
  logPreflight,
  logNarrative,
  logIntentContract,
  logOutlineCoverage,
  getPremiumReadinessLaunchMinScore,
  hydratePanelProvenanceOnBlueprints,
  isPipelineV3PremiumOnlyEnabled,
  isPremiumStrictMode,
  hydrateBlueprintsWithCharacterDna,
  hydrateBlueprintsWithEnvironmentDna,
  hydrateBlueprintsWithNpcDna,
  hydrateBlueprintsWithPropDna,
  visualWorldContractSchema,
  PREMIUM_PANEL_RANGE,
  applyHeroInvariant,
  buildChapterCastContract,
  assertValidChapterCastContract,
  ChapterCastContractError,
  resolveCharacterRefsToIds,
  type ChapterStudioSnapshot,
  type PanelBlueprintPremium,
} from "@manga-ai-studio/core";
import { computeShotVarietyBudget, computeContractualFocusAdequacy, computePremiumReadinessScore, type PremiumReadinessCastContext } from "@manga-ai-studio/ai";
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
import { getGenerationStackStatus, logGenerationStackReadiness } from "@/lib/generation/stack-readiness";
import { computePremiumAiReadiness } from "@/lib/compute-premium-ai-readiness";
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
import { canonViolationsToPremiumErrors } from "@/shared/errors/generation-errors";
import { buildPremiumReadinessDashboard } from "@/lib/readiness/build-premium-readiness-dashboard";
import { toPrismaInputJson } from "@/lib/to-prisma-input-json";
import { premiumVisualQaPreflightResponse } from "@/lib/generation/premium-visual-qa-preflight";
import { isVisualContractPrelaunchBlocked } from "@/lib/visual-contract-prelaunch-gate";
import { premiumCharacterStudioSelect, toCharacterRowsForDnaHydration, type PremiumCharacterStudioRow } from "@/lib/premium-character-studio-select";
import {
  buildUnresolvedCharacterLabelsPayload,
  mapCharacterLabelsToIdsSequential,
} from "@/lib/characters/resolve-character-labels";

type Ctx = { params: Promise<{ id: string; chapterId: string }> };

function logLaunchBlock(
  projectId: string,
  chapterId: string,
  code: string,
  reason: string,
  extra?: Record<string, unknown>,
) {
  console.warn("[launch:block]", { projectId, chapterId, code, reason, ...extra });
}

function logLaunchJobDispatched(projectId: string, chapterId: string, jobId: string, viaInngest: boolean) {
  console.info("[launch] job_dispatched", { projectId, chapterId, jobId, viaInngest });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function POST(_req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();

  const { id: projectId, chapterId } = await ctx.params;
  console.info("[launch] request_received", {
    projectId,
    chapterId,
    env: process.env.NODE_ENV,
    premiumOnly: isPipelineV3PremiumOnlyEnabled(),
  });

  const rl = await checkRateLimit(user.id, "pipeline");
  if (!rl.ok) {
    logLaunchBlock(projectId, chapterId, "RATE_LIMITED", "Too many launch requests", { retryAfterSecs: rl.retryAfterSecs });
    return NextResponse.json({ error: rl.message }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSecs) } });
  }

  const stack = getGenerationStackStatus();
  logGenerationStackReadiness(stack);

  const premiumOnly = isPipelineV3PremiumOnlyEnabled();
  const strictPremiumContinuity = premiumOnly || isPremiumStrictMode();
  const { aiReadiness, premiumBlockingReasons } = computePremiumAiReadiness({ stack, premiumOnly });
  if (premiumOnly && premiumBlockingReasons.length > 0) {
    logLaunchBlock(projectId, chapterId, "PREMIUM_AI_READINESS_FAILED", "Premium AI readiness gate", {
      premiumBlockingReasons,
    });
    return NextResponse.json(
      {
        error: "premium_ai_readiness_failed",
        code: "PREMIUM_AI_READINESS_FAILED",
        message:
          "Des moteurs IA requis pour le mode premium-only ne sont pas prêts (LLM, images, QA vision ou bindings). " +
          "Corrige la configuration du serveur ou utilise un environnement de développement.",
        aiReadiness,
        premiumBlockingReasons,
      },
      { status: 422 },
    );
  }

  if (!stack.canGenerateChapters) {
    logLaunchBlock(projectId, chapterId, "STACK_NOT_READY", "Generation stack not ready for full chapter", {
      blockers: stack.blockers,
    });
    return validationError("La stack de génération n'est pas prête pour un chapitre complet.", stack);
  }

  // HARD GUARD : le launch premium DOIT tourner via la pipeline v3 (Story
  // Architect → Manga Editor → Panel Renderer). Le legacy path cumule trop
  // de bugs (padding 40→75, routing aveugle, prompts contradictoires,
  // referencePolicy NONE sur héros, coverage mensongère). On refuse
  // explicitement la launch si le flag v3 n'est pas actif — pas de
  // fallback silencieux.
  if (!isPipelineV3StoryboardEnabled()) {
    logLaunchBlock(projectId, chapterId, "V3_PREMIUM_DISABLED", "PIPELINE_V3_STORYBOARD not enabled");
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
    logLaunchBlock(projectId, chapterId, "PREMIUM_VISUAL_QA_CONFIG_MISSING", "Premium visual QA preflight failed");
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

    logLaunchBlock(projectId, chapterId, "V3_PREMIUM_STACK_INCOMPLETE", "Missing providers or storage for V3 premium", {
      missingComponents,
    });
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
  if (!chapter) {
    logLaunchBlock(projectId, chapterId, "CHAPTER_NOT_FOUND", "Chapter or project mismatch");
    return notFound();
  }

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

  if (premiumOnly) {
    const ic = snapshot.data.chapterIntentContract;
    if (!ic) {
      logLaunchBlock(projectId, chapterId, "INTENT_CONTRACT_REQUIRED", "Premium launch requires compiled chapter intent");
      return NextResponse.json(
        {
          error: "intent_contract_required",
          code: "INTENT_CONTRACT_REQUIRED",
          message:
            "En mode premium, compile l’intention du chapitre (étape Intention du wizard) et enregistre le contrat avant de lancer.",
        },
        { status: 422 },
      );
    }
    if (typeof ic.confidenceScore !== "number" || ic.confidenceScore < 0.75) {
      logLaunchBlock(projectId, chapterId, "INTENT_CONFIDENCE_TOO_LOW", "Intent confidence below premium threshold", {
        confidenceScore: ic.confidenceScore,
      });
      return NextResponse.json(
        {
          error: "intent_confidence_too_low",
          code: "INTENT_CONFIDENCE_TOO_LOW",
          message:
            "La confiance sur l’intention compilée est trop faible (< 75 %). Précise le pitch, les contraintes ou réessaie la compilation.",
          confidenceScore: ic.confidenceScore,
          ambiguityFlags: ic.ambiguityFlags,
        },
        { status: 422 },
      );
    }
  }

  const readiness = snapshot.data.readinessReport ?? buildChapterReadinessReport(snapshot);
  if (readiness.status === "blocked") {
    return validationError("Le chapitre n'est pas prêt pour la génération.", readiness);
  }

  if (premiumOnly) {
    const premiumDashboard = buildPremiumReadinessDashboard({
      snapshot,
      projectId,
      chapterId,
      chapterNumber: chapter.chapterNumber,
    });
    if (premiumDashboard.status === "blocked") {
      logLaunchBlock(projectId, chapterId, "PREMIUM_READINESS_DASHBOARD_BLOCKED", "Premium readiness dashboard blocked launch", {
        issueCodes: premiumDashboard.issues.filter((i) => i.severity === "blocked").map((i) => i.code),
      });
      return NextResponse.json(
        {
          error: "premium_readiness_blocked",
          code: "PREMIUM_READINESS_DASHBOARD_BLOCKED",
          message:
            "Des blocages premium empêchent le lancement (intention, monde visuel, script, couverture). Corrige les points listés puis réessaie.",
          premiumReadiness: {
            status: premiumDashboard.status,
            score: premiumDashboard.score,
            issues: premiumDashboard.issues,
            catalogErrors: premiumDashboard.catalogErrors,
            dialogueQaSummary: premiumDashboard.dialogueQaSummary,
          },
        },
        { status: 422 },
      );
    }
  }

  const chapterCharacterSelection = asRecord(snapshot.data.characterSelection);
  const snapshotDataRecord = asRecord(snapshot.data);
  let focusCharacterIds = Array.isArray(chapterCharacterSelection.activeCharacterIds)
    ? chapterCharacterSelection.activeCharacterIds.filter(
        (id): id is string => typeof id === "string" && id.length > 0,
      )
    : [];
  let lockedCharacterIds = Array.isArray(chapterCharacterSelection.lockedCharacterIds)
    ? chapterCharacterSelection.lockedCharacterIds.filter(
        (id): id is string => typeof id === "string" && id.length > 0,
      )
    : [];
  let coreCastCharacterIds = Array.isArray(chapterCharacterSelection.coreCastCharacterIds)
    ? chapterCharacterSelection.coreCastCharacterIds.filter(
        (id): id is string => typeof id === "string" && id.length > 0,
      )
    : [];
  let heroCharacterId =
    typeof chapterCharacterSelection.heroCharacterId === "string" && chapterCharacterSelection.heroCharacterId.length > 0
      ? chapterCharacterSelection.heroCharacterId
      : null;
  let secondaryHeroCharacterId =
    typeof chapterCharacterSelection.secondaryHeroCharacterId === "string"
    && chapterCharacterSelection.secondaryHeroCharacterId.length > 0
      ? chapterCharacterSelection.secondaryHeroCharacterId
      : null;

  let deuteragonistCharacterId =
    typeof chapterCharacterSelection.deuteragonistCharacterId === "string"
    && chapterCharacterSelection.deuteragonistCharacterId.trim().length > 0
      ? chapterCharacterSelection.deuteragonistCharacterId.trim()
      : null;

  const bpForContinuityProbe = snapshot.data.productionPlan?.panelBlueprints;
  const strictContinuityNeedsChars =
    strictPremiumContinuity
    && Array.isArray(bpForContinuityProbe)
    && bpForContinuityProbe.length > 0;

  let chapterProjectCharacters: PremiumCharacterStudioRow[] = [];
  if (premiumOnly || strictContinuityNeedsChars) {
    chapterProjectCharacters = await prisma.character.findMany({
      where: { projectId },
      select: premiumCharacterStudioSelect,
    });
  }

  const charRefsForLabels = chapterProjectCharacters.map((c) => ({
    id: c.id,
    name: c.name,
    displayName: null as string | null,
    roleType: c.roleType,
  }));

  if (premiumOnly) {
    const unresolvedCollector: string[] = [];

    if (heroCharacterId) {
      const h = resolveCharacterRefsToIds([heroCharacterId], charRefsForLabels);
      if (h.unresolved.length > 0) unresolvedCollector.push(...h.unresolved);
      else if (h.ids.length > 0) heroCharacterId = h.ids[0]!;
    }

    if (secondaryHeroCharacterId) {
      const s = resolveCharacterRefsToIds([secondaryHeroCharacterId], charRefsForLabels);
      if (s.unresolved.length > 0) unresolvedCollector.push(...s.unresolved);
      else if (s.ids.length > 0) secondaryHeroCharacterId = s.ids[0]!;
    }

    if (deuteragonistCharacterId) {
      const d = resolveCharacterRefsToIds([deuteragonistCharacterId], charRefsForLabels);
      if (d.unresolved.length > 0) unresolvedCollector.push(...d.unresolved);
      else if (d.ids.length > 0) deuteragonistCharacterId = d.ids[0]!;
    }

    const focusSan = mapCharacterLabelsToIdsSequential(focusCharacterIds, charRefsForLabels);
    unresolvedCollector.push(...focusSan.unresolvedLabels);
    focusCharacterIds = focusSan.sanitizedIds;

    const lockedSan = mapCharacterLabelsToIdsSequential(lockedCharacterIds, charRefsForLabels);
    unresolvedCollector.push(...lockedSan.unresolvedLabels);
    lockedCharacterIds = lockedSan.sanitizedIds;

    const coreSan = mapCharacterLabelsToIdsSequential(coreCastCharacterIds, charRefsForLabels);
    unresolvedCollector.push(...coreSan.unresolvedLabels);
    coreCastCharacterIds = coreSan.sanitizedIds;

    const uniqueUnresolved = [...new Set(unresolvedCollector)];
    if (uniqueUnresolved.length > 0) {
      const { suggestions } = buildUnresolvedCharacterLabelsPayload(uniqueUnresolved, charRefsForLabels);
      logLaunchBlock(projectId, chapterId, "CHARACTER_LABELS_UNRESOLVED", "Cast contains unresolved character labels", {
        unresolvedLabels: uniqueUnresolved,
      });
      return NextResponse.json(
        {
          error: "character_labels_unresolved",
          code: "CHARACTER_LABELS_UNRESOLVED",
          message:
            "Certains personnages du cast sont encore des noms ou des libellés non reliés à un personnage du projet. Associe-les à un personnage existant ou crée le personnage avant de lancer.",
          unresolvedLabels: uniqueUnresolved,
          suggestions,
        },
        { status: 422 },
      );
    }
  }

  if (premiumOnly && heroCharacterId) {
    const merged = applyHeroInvariant(
      {
        heroCharacterId,
        secondaryHeroCharacterId,
        activeCharacterIds: focusCharacterIds,
        coreCastCharacterIds,
        lockedCharacterIds,
      },
      heroCharacterId,
    );
    focusCharacterIds = [...(merged.activeCharacterIds ?? [])];
    lockedCharacterIds = [...(merged.lockedCharacterIds ?? [])];
    coreCastCharacterIds = [...(merged.coreCastCharacterIds ?? [])];
  }

  if (premiumOnly && heroCharacterId) {
    try {
      const castContract = buildChapterCastContract({
        chapterId,
        heroCharacterId,
        secondaryHeroCharacterId,
        activeCharacterIds: focusCharacterIds,
        characters: chapterProjectCharacters.map((c) => ({ id: c.id, name: c.name, roleType: c.roleType })),
      });
      assertValidChapterCastContract(castContract);
    } catch (err) {
      if (err instanceof ChapterCastContractError) {
        logLaunchBlock(projectId, chapterId, "CAST_CONTRACT_INVALID", err.message, { issues: err.issues });
        return NextResponse.json(
          {
            error: "chapter_cast_contract_invalid",
            code: "CAST_CONTRACT_INVALID",
            message: err.message,
            issues: err.issues,
          },
          { status: 422 },
        );
      }
      throw err;
    }
  }

  const coProtagonistCharacterIdsForHydration = [...new Set(
    [secondaryHeroCharacterId, deuteragonistCharacterId].filter((x): x is string => Boolean(x)),
  )];
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

  // QA structurelle canonique en premier (même entrée que /estimate). C'est la barre « fidèle »
  // sur le plan ; le score heuristique `computePremiumReadinessScore` pénalise souvent des champs
  // peu remplis après merge canonique (lieux unknown, dialogueCarrier) sans invalider cette QA.
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
  let structuralCanonicalQaPassed = false;
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
          structuralMetrics: structuralPlan.metrics,
        },
        { status: 422 },
      );
    }
    structuralCanonicalQaPassed = true;
  }

  const bpForContinuityRaw = snapshot.data.productionPlan?.panelBlueprints;
  let bpForContinuity = bpForContinuityRaw;
  if (Array.isArray(bpForContinuity) && bpForContinuity.length > 0 && strictPremiumContinuity) {
    const charsForHydration =
      chapterProjectCharacters.length > 0
        ? chapterProjectCharacters
        : await prisma.character.findMany({
            where: { projectId },
            select: premiumCharacterStudioSelect,
          });
    const canonList = snapshot.data.characterCanons ?? [];
    const canonMap = new Map(canonList.map((c) => [c.characterId, c] as const));
    bpForContinuity = hydrateBlueprintsWithCharacterDna({
      blueprints: bpForContinuity as PanelBlueprintPremium[],
      characters: toCharacterRowsForDnaHydration(charsForHydration),
      characterCanonsById: canonMap,
      strict: true,
      ...(coProtagonistCharacterIdsForHydration.length > 0
        ? { coProtagonistCharacterIds: coProtagonistCharacterIdsForHydration as readonly string[] }
        : {}),
    }) as typeof bpForContinuity;
    const vwLaunch = visualWorldContractSchema.safeParse(snapshot.data.visualWorldContract);
    if (vwLaunch.success) {
      bpForContinuity = hydrateBlueprintsWithEnvironmentDna({
        blueprints: bpForContinuity as PanelBlueprintPremium[],
        visualWorld: vwLaunch.data,
        strict: true,
      }) as typeof bpForContinuity;
      bpForContinuity = hydrateBlueprintsWithPropDna({
        blueprints: bpForContinuity as PanelBlueprintPremium[],
        visualWorld: vwLaunch.data,
        strict: true,
      }) as typeof bpForContinuity;
      bpForContinuity = hydrateBlueprintsWithNpcDna({
        blueprints: bpForContinuity as PanelBlueprintPremium[],
        visualWorld: vwLaunch.data,
        strict: true,
      }) as typeof bpForContinuity;
    }
  }
  const canonListForCheck = snapshot.data.characterCanons ?? [];
  if (strictPremiumContinuity && canonListForCheck.length > 0) {
    const canonPackChecks = canonListForCheck.map((canon) => {
      const tier = canon.importanceTier;
      const roleType =
        tier === "MAIN_HERO" ? "hero"
          : tier === "SECONDARY_CORE" ? "deuteragonist"
            : (canon.role ?? "supporting");
      return {
        characterId: canon.characterId,
        roleType,
        hasCanonPack: canon.hasCanonPack === true,
        canonPackCompleteness:
          typeof canon.canonPackCompleteness === "number" ? canon.canonPackCompleteness : 0,
      };
    });
    const canonPackBlockers = canonPackPreflightBlockingReasons(canonPackChecks);
    if (canonPackBlockers.length > 0) {
      logNarrative({
        domain: "canon-pack",
        level: "error",
        message: `canon_pack_blockers count=${canonPackBlockers.length}`,
        data: { blockers: canonPackBlockers.join(",") },
      });
      logLaunchBlock(
        projectId,
        chapterId,
        "CANON_PACK_INCOMPLETE",
        "Premium hero/deuteragonist CanonPack incomplete",
        { canonPackBlockers },
      );
      return NextResponse.json(
        {
          error: "canon_pack_incomplete",
          code: "CANON_PACK_INCOMPLETE",
          message:
            "Le pack canonique d'un personnage principal est incomplet. " +
            "Complète la fiche personnage dans le studio pour éviter la dérive visuelle, puis relance.",
          canonPackBlockers,
        },
        { status: 422 },
      );
    }
  }

  // Intent Coverage QA — premium only, blocking when score < 60
  if (strictPremiumContinuity && chapter.userIntent && chapter.userIntent.length > 8) {
    try {
      const knownLocations = (canonListForCheck.length > 0 ? canonListForCheck : [])
        .map((c) => c.canonicalName)
        .filter((n): n is string => Boolean(n));
      const intentNarrative = buildIntentNarrativeContract({
        chapterId,
        userIntent: chapter.userIntent,
        knownLocationNames: knownLocations,
      });
      logIntentContract({
        requiredEvents: intentNarrative.requiredEvents.length,
        requiredNpcGroups: intentNarrative.requiredNpcGroups.length,
        requiredLocations: intentNarrative.requiredLocations.length,
      });

      const productionPlan = snapshot.data.productionPlan as { panelBlueprints?: Array<{ purpose?: string; beatId?: string }> } | undefined;
      const beatSummariesSet = new Set<string>();
      for (const bp of productionPlan?.panelBlueprints ?? []) {
        if (typeof bp.purpose === "string") beatSummariesSet.add(bp.purpose);
      }
      const visualWorld = snapshot.data.visualWorldContract as
        | { locations?: Array<{ canonicalName?: string }>; npcGroups?: Array<{ label?: string }> }
        | undefined;
      const vwLocs = (visualWorld?.locations ?? [])
        .map((l) => l.canonicalName)
        .filter((n): n is string => Boolean(n));
      const vwNpcs = (visualWorld?.npcGroups ?? [])
        .map((g) => g.label)
        .filter((n): n is string => Boolean(n));

      const coverage = runIntentCoverageQa({
        intentContract: intentNarrative,
        beatSummaries: [...beatSummariesSet],
        visualWorldLocationNames: vwLocs,
        visualWorldNpcGroupLabels: vwNpcs,
        strict: false,
      });

      logOutlineCoverage({
        covered: coverage.requiredEventsCovered,
        total: coverage.requiredEventsTotal,
        missingEventIds: coverage.missingEvents,
      });

      if (coverage.intentCoverageScore < 60 && intentNarrative.requiredEvents.length > 0) {
        logLaunchBlock(
          projectId,
          chapterId,
          "INTENT_COVERAGE_TOO_LOW",
          `Intent coverage score=${coverage.intentCoverageScore} below threshold=60`,
          { missingEvents: coverage.missingEvents, issues: coverage.issues.slice(0, 5) },
        );
        return NextResponse.json(
          {
            error: "intent_coverage_too_low",
            code: "INTENT_COVERAGE_TOO_LOW",
            message:
              `Le plan ne couvre que ${coverage.intentCoverageScore}% de ton intention narrative. ` +
              "Régénère le plan ou vérifie l'intention dans le wizard.",
            intentCoverageScore: coverage.intentCoverageScore,
            missingEvents: coverage.missingEvents,
            coverageIssues: coverage.issues.slice(0, 10),
          },
          { status: 422 },
        );
      }
    } catch (err) {
      console.warn("[launch] intent_coverage_qa_failed", err);
    }
  }

  if (Array.isArray(bpForContinuity) && bpForContinuity.length > 0 && strictPremiumContinuity) {
    const continuityPreflights = computePanelContinuityPreflights(bpForContinuity as PanelBlueprintPremium[], {
      strictEnvironmentLocationBinding: strictPremiumContinuity,
      strictCharacterDnaBinding: strictPremiumContinuity,
      strictPropVisualBinding: strictPremiumContinuity,
    });
    const continuityBlockers = continuityPreflightBlockingReasons(continuityPreflights);
    logPreflight({
      blockers: continuityBlockers.length,
      dominantReason: continuityBlockers[0]?.split(":")[1],
    });
    if (continuityBlockers.length > 0) {
      logLaunchBlock(
        projectId,
        chapterId,
        "PREMIUM_CONTINUITY_PREFLIGHT_FAILED",
        "Premium continuity preflight failed (character or environment visual DNA)",
        { continuityBlockers },
      );
      return NextResponse.json(
        {
          error: "premium_continuity_preflight_failed",
          code: "PREMIUM_CONTINUITY_PREFLIGHT_FAILED",
          message:
            "Le preflight continuité premium a échoué : DNA personnage incomplet et/ou décor (environmentVisualDna) manquant là où le plan l’exige. " +
            "Consulte continuityBlockers, complète le plan dans le studio, puis relance.",
          continuityBlockers,
          continuityPreflightBlockingCount: continuityBlockers.length,
        },
        { status: 422 },
      );
    }
  }

  let studioSnapshotForLaunch: ChapterStudioSnapshot = snapshot;
  if (
    strictPremiumContinuity
    && Array.isArray(bpForContinuity)
    && bpForContinuity.length > 0
    && snapshot.data.productionPlan
    && typeof snapshot.data.productionPlan === "object"
  ) {
    studioSnapshotForLaunch = {
      ...snapshot,
      data: {
        ...snapshot.data,
        productionPlan: {
          ...(snapshot.data.productionPlan as Record<string, unknown>),
          panelBlueprints: bpForContinuity,
        },
      },
    } as ChapterStudioSnapshot;
  }

  if (isPipelineV3PremiumOnlyEnabled()) {
    const pp = studioSnapshotForLaunch.data.productionPlan;
    const ppRec = pp && typeof pp === "object" ? (pp as Record<string, unknown>) : null;
    const bps = ppRec?.panelBlueprints;
    let score: number | null = null;
    let scoreSource: "recomputed_from_blueprints" | "persisted_metadata" = "persisted_metadata";
    if (Array.isArray(bps) && bps.length > 0) {
      const premiumReadinessCast: PremiumReadinessCastContext = {
        heroCharacterId,
        secondaryHeroCharacterId,
        deuteragonistCharacterId,
      };
      score = computePremiumReadinessScore(bps as PanelBlueprintPremium[], premiumReadinessCast);
      scoreSource = "recomputed_from_blueprints";
    } else if (ppRec && typeof ppRec.premiumReadinessScore === "number") {
      score = ppRec.premiumReadinessScore as number;
    }
    const minReadiness = getPremiumReadinessLaunchMinScore();
    if (score !== null && score < minReadiness) {
      if (structuralCanonicalQaPassed) {
        console.info(
          `[launch] premium_readiness_advisory chapterId=${chapterId} premiumReadinessScore=${score.toFixed(2)} ` +
            `threshold=${minReadiness.toFixed(2)} scoreSource=${scoreSource} structuralCanonicalQaPassed=true ` +
            "— lancement autorisé : la QA structurelle canonique prime sur le score heuristique",
        );
      } else {
        console.warn(
          `[launch] premium_readiness_blocked chapterId=${chapterId} premiumReadinessScore=${score.toFixed(2)} ` +
            `threshold=${minReadiness.toFixed(2)} scoreSource=${scoreSource}`,
        );
        return NextResponse.json(
          {
            error: "premium_readiness_too_low",
            code: "PREMIUM_READINESS_TOO_LOW",
            message:
              `Le score de préparation premium (${score.toFixed(2)}) est sous le seuil requis (${minReadiness.toFixed(2)}) ` +
              "et la QA structurelle n'a pas pu valider des blueprints présents. Renforce le plan ou baisse le seuil via PREMIUM_READINESS_LAUNCH_MIN_SCORE.",
            premiumReadinessScore: score,
            minReadinessScore: minReadiness,
          },
          { status: 422 },
        );
      }
    }
  }

  if (Array.isArray(bpStructural) && bpStructural.length > 0) {
    const traceDigest = computeNarrativeMemoryDigestFromOutline(outlineForStructuralQa);
    const tracedBlueprints = hydratePanelProvenanceOnBlueprints(bpStructural as PanelBlueprintPremium[], {
      narrativeMemoryDigest: traceDigest,
    });
    console.info(
      `[launch] panel_traceability chapterId=${chapterId}`,
      buildPanelTraceabilityReport(tracedBlueprints),
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

  // B3-3 : Shot Variety Enforcer — vérifier la variété des plans avant lancement
  const blueprintsForVariety = studioSnapshotForLaunch.data.productionPlan?.panelBlueprints;
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
      const persistedFocusBudget = studioSnapshotForLaunch.data.productionPlan?.focusBudget ?? null;
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
      const productionPlanRec = asRecord(studioSnapshotForLaunch.data.productionPlan ?? undefined);
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
      const blockingViolations = canonReport.violations.filter((v) => v.severity === "blocking");
      const premiumErrors = canonViolationsToPremiumErrors(blockingViolations, { projectId, chapterId });
      const leadUserMessage =
        premiumErrors[0]?.userMessage
        ?? "Un ou plusieurs personnages critiques n’ont pas une assise canonique suffisante pour lancer le chapitre.";
      console.warn(
        `[launch] canon_readiness_blocked chapterId=${chapterId} ` +
        `violations=${JSON.stringify(
          blockingViolations.map((v) => ({ id: v.characterId, score: v.score, reason: v.reason })),
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
          leadUserMessage,
          premiumErrors,
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
    if (estimateContext.launchAlignedReady === false) {
      console.warn(
        `[launch] estimate_snapshot_not_launch_aligned chapterId=${chapterId} ` +
          `continuity_ok=${estimateContext.continuityPreflight?.ok ?? "n/a"} ` +
          `blockers_count=${estimateContext.continuityPreflight?.blockers?.length ?? 0} — ` +
          "le snapshot indique que le dernier estimate n’était pas prêt ; le launch vérifie quand même les blueprints actuels.",
      );
    }
  }

  // Logs premium structurés
  const _pp = studioSnapshotForLaunch.data.productionPlan;
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
    ...studioSnapshotForLaunch,
    status: "GENERATING" as const,
    data: {
      ...studioSnapshotForLaunch.data,
      readinessReport: {
        ...readiness,
        imageCounts: {
          ...readiness.imageCounts,
          estimatedImages:
            studioSnapshotForLaunch.data.productionPlan?.estimatedImages ?? readiness.imageCounts.estimatedImages,
          targetImages:
            studioSnapshotForLaunch.data.productionPlan?.targetImages ?? readiness.imageCounts.targetImages,
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
      snapshot: nextSnapshot,
      approvedOutline,
      selectedPlotLabel: nextSnapshot.data.selectedPlotLabel ?? "bold",
      creativityControls:
        nextSnapshot.data.creativityControls == null ? null : asRecord(nextSnapshot.data.creativityControls),
      heroCharacterId,
      secondaryHeroCharacterId,
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
      const productionPlanRec = asRecord(studioSnapshotForLaunch.data.productionPlan ?? undefined);
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
    logLaunchJobDispatched(projectId, chapterId, job.id, false);
    return NextResponse.json({
      ok: run.ok,
      jobId: job.id,
      message: run.ok ? "Pipeline exécuté immédiatement." : `Échec pipeline : ${run.error ?? "inconnu"}`,
      operationalStatus: stack.operationalStatus,
      degradedModes: stack.degradedModes,
    });
  }

  logLaunchJobDispatched(projectId, chapterId, job.id, true);
  return NextResponse.json({
    ok: true,
    jobId: job.id,
    operationalStatus: stack.operationalStatus,
    degradedModes: stack.degradedModes,
    message: "Génération lancée depuis le Chapter Studio.",
  });
}
