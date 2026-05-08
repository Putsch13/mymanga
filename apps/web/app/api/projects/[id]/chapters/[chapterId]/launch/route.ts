import { NextResponse } from "next/server";
import {
  buildChapterReadinessReport,
  buildPanelTraceabilityReport,
  computeNarrativeMemoryDigestFromOutline,
  computePanelContinuityPreflights,
  continuityPreflightBlockingReasons,
  canonPackPreflightBlockingReasons,
  logPreflight,
  logNarrative,
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
import { computeShotVarietyBudget, computePremiumReadinessScore, runPremiumPlanContractQa, type PremiumReadinessCastContext } from "@manga-ai-studio/ai";
import { repairProductionPlanContractualFocus, type FocusViolation } from "@manga-ai-studio/core";
import { prisma } from "@manga-ai-studio/db";
import {
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
  resolveApprovedOutlineFromSnapshot,
} from "@/lib/premium-chapter-contract";
import { buildAndDispatchLaunchJob } from "./_helpers/dispatch-launch-job";
import { runStructuralQa } from "./_helpers/run-structural-qa";
import { runIntentCoverageQaForLaunch } from "./_helpers/run-intent-coverage-qa";
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
    // Seuil produit aligné avec le score post-traitement de
    // `recomputeConfidenceFromContract`. À 0.5 on bloque uniquement les
    // pitchs vraiment trop pauvres (pas de personnages + pas de plot goal).
    const INTENT_CONFIDENCE_THRESHOLD = 0.5;
    if (typeof ic.confidenceScore !== "number" || ic.confidenceScore < INTENT_CONFIDENCE_THRESHOLD) {
      logLaunchBlock(projectId, chapterId, "INTENT_CONFIDENCE_TOO_LOW", "Intent confidence below premium threshold", {
        confidenceScore: ic.confidenceScore,
        threshold: INTENT_CONFIDENCE_THRESHOLD,
        ambiguityFlags: ic.ambiguityFlags,
      });
      const pct = Math.round((ic.confidenceScore ?? 0) * 100);
      const flags = ic.ambiguityFlags?.length ? ` Causes : ${ic.ambiguityFlags.join(", ")}.` : "";
      return NextResponse.json(
        {
          error: "intent_confidence_too_low",
          code: "INTENT_CONFIDENCE_TOO_LOW",
          message:
            `La confiance sur l’intention compilée est de ${pct}% (seuil ${Math.round(INTENT_CONFIDENCE_THRESHOLD * 100)}%).${flags}`
            + " Précise le pitch, ajoute des personnages/lieux requis ou un objectif émotionnel, puis relance « Analyser l’histoire ».",
          confidenceScore: ic.confidenceScore,
          confidenceThreshold: INTENT_CONFIDENCE_THRESHOLD,
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

  const structuralQaResult = await runStructuralQa({
    chapterId,
    projectId,
    chapter,
    snapshot,
    approvedOutline,
    charRefsForLabels,
  });
  if (!structuralQaResult.ok) return structuralQaResult.response;
  const structuralCanonicalQaPassed = structuralQaResult.structuralCanonicalQaPassed;
  const bpStructural = structuralQaResult.bpStructural;
  const outlineForStructuralQa = structuralQaResult.outlineForStructuralQa;

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
    const canonPackBlockers = canonPackPreflightBlockingReasons(canonPackChecks, { minCompleteness: 0.7 });
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

  const intentCoverageResult = await runIntentCoverageQaForLaunch({
    projectId,
    chapterId,
    chapter,
    snapshot,
    charRefsForLabels,
    strictPremiumContinuity,
  });
  if (!intentCoverageResult.ok) return intentCoverageResult.response;

  if (Array.isArray(bpForContinuity) && bpForContinuity.length > 0 && strictPremiumContinuity) {
    // Only enforce strict environment DNA check if the VisualWorldContract
    // actually exists and has locations. Otherwise the hydration had nothing
    // to inject and every panel would be a false-positive blocker.
    const vwForPreflight = visualWorldContractSchema.safeParse(snapshot.data.visualWorldContract);
    const hasVwLocations = vwForPreflight.success
      && Array.isArray(vwForPreflight.data.locations)
      && vwForPreflight.data.locations.length > 0;

    const continuityPreflights = computePanelContinuityPreflights(bpForContinuity as PanelBlueprintPremium[], {
      strictEnvironmentLocationBinding: hasVwLocations,
      strictCharacterDnaBinding: strictPremiumContinuity,
      strictPropVisualBinding: hasVwLocations,
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

  {
    const bpForTraceability = Array.isArray(bpForContinuity) && bpForContinuity.length > 0
      ? bpForContinuity
      : bpStructural;
    if (Array.isArray(bpForTraceability) && bpForTraceability.length > 0) {
      const traceDigest = computeNarrativeMemoryDigestFromOutline(outlineForStructuralQa);
      const tracedBlueprints = hydratePanelProvenanceOnBlueprints(bpForTraceability as PanelBlueprintPremium[], {
        narrativeMemoryDigest: traceDigest,
      });
      console.info(
        `[launch] panel_traceability chapterId=${chapterId}`,
        buildPanelTraceabilityReport(tracedBlueprints),
      );
    }
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
  // Re-hydration avec le VW contract avant les checks focus/QA.
  // Le snapshot peut contenir des blueprints sans environmentVisualDna hydraté ;
  // on re-hydrate ici pour que runPremiumPlanContractQa ait des données complètes.
  let blueprintsForVariety = studioSnapshotForLaunch.data.productionPlan?.panelBlueprints;
  const vwForVariety = visualWorldContractSchema.safeParse(snapshot.data.visualWorldContract);
  if (Array.isArray(blueprintsForVariety) && blueprintsForVariety.length > 0 && vwForVariety.success) {
    try {
      blueprintsForVariety = hydrateBlueprintsWithEnvironmentDna({
        blueprints: blueprintsForVariety as PanelBlueprintPremium[],
        visualWorld: vwForVariety.data,
        strict: false,
      }) as typeof blueprintsForVariety;
      blueprintsForVariety = hydrateBlueprintsWithPropDna({
        blueprints: blueprintsForVariety as PanelBlueprintPremium[],
        visualWorld: vwForVariety.data,
        strict: false,
      }) as typeof blueprintsForVariety;
    } catch (hydrateErr) {
      console.warn(`[launch] blueprintsForVariety_rehydration_failed (non-blocking): ${hydrateErr instanceof Error ? hydrateErr.message : hydrateErr}`);
    }
  }
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

    // P0-3/P0-4/P0-8 : QA contractuelle unifiée + réparation déterministe
    // + message d'erreur dynamique basé sur les violations réelles.
    try {
      const contractQa = runPremiumPlanContractQa({
        blueprints: blueprintsForVariety as PanelBlueprintPremium[],
      });

      if (!contractQa.ok) {
        const violations: FocusViolation[] = contractQa.blocking.map((type) => ({
          type: type as FocusViolation["type"],
          message: type,
          severity: "blocking" as const,
        }));

        const repairResult = repairProductionPlanContractualFocus(
          blueprintsForVariety as PanelBlueprintPremium[],
          violations,
        );

        // Ne bloquer que si la réparation a échoué sur une violation de CONTENU
        // (prop, arme, NPC, ennemi). weak_location_binding est un warning de
        // qualité de données, pas un blocage de contenu.
        const contentViolations = violations.filter(
          (v) => !(v.type as string).startsWith("weak_location_binding"),
        );
        const failedAfterRepair = contentViolations.length - repairResult.succeeded;
        if (failedAfterRepair > 0) {
          const VIOLATION_MESSAGES: Record<string, string> = {
            missing_prop_insert:     "Aucun gros plan d'objet narratif prévu dans le plan.",
            missing_weapon_insert:   "Aucun insert arme/objet clé prévu dans le plan.",
            missing_environment:     "Aucun panel décor prévu pour ce chapitre.",
            missing_enemy_focus:     "Un adversaire est requis mais aucun panel ne le met au premier plan.",
            missing_npc_population:  "Un groupe de personnages est requis mais absent du plan.",
            weak_location_binding_critical: "Les décors ne sont pas correctement liés aux panels (>60%).",
            hero_overload_vs_contract: "Le plan est trop centré sur le héros.",
          };
          const details = contractQa.blocking
            .map((v) => VIOLATION_MESSAGES[v] ?? v)
            .join(" | ");
          const errorMessage = `Plan incomplet : ${details} (propInserts=${contractQa.metrics.propInserts}, npcPanels=${contractQa.metrics.npcPanels}, heroCenterRatio=${contractQa.metrics.heroCenterRatio.toFixed(2)})`;

          console.warn(
            `[launch] contractual_focus_inadequate chapterId=${chapterId} ` +
            `heroCenterRatio=${contractQa.metrics.heroCenterRatio.toFixed(2)} ` +
            `envPanels=${contractQa.metrics.envPanels} ` +
            `propInserts=${contractQa.metrics.propInserts} ` +
            `npcPanels=${contractQa.metrics.npcPanels} ` +
            `blocking=${JSON.stringify(contractQa.blocking)} ` +
            `repairAttempted=${repairResult.attempted} repairFailed=${repairResult.failed}`,
          );
          return NextResponse.json(
            {
              error: errorMessage,
              code: "CONTRACTUAL_FOCUS_INADEQUATE",
              metrics: contractQa.metrics,
              blocking: contractQa.blocking,
              warnings: contractQa.warnings,
              repairable: contractQa.repairable,
              repairAttempted: repairResult.attempted,
              repairSucceeded: repairResult.succeeded,
              repairFailed: repairResult.failed,
            },
            { status: 422 },
          );
        }

        // Repair succeeded — update blueprints in snapshot
        if (studioSnapshotForLaunch.data.productionPlan && typeof studioSnapshotForLaunch.data.productionPlan === "object") {
          (studioSnapshotForLaunch.data.productionPlan as Record<string, unknown>).panelBlueprints = repairResult.repaired;
        }
        console.info(
          `[launch] contractual_focus_repaired chapterId=${chapterId} ` +
          `attempted=${repairResult.attempted} succeeded=${repairResult.succeeded}`,
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

  return buildAndDispatchLaunchJob({
    user,
    projectId,
    chapterId,
    snapshot,
    nextSnapshot,
    studioSnapshotForLaunch,
    approvedOutline,
    heroCharacterId,
    secondaryHeroCharacterId,
    focusCharacterIds,
    activeNpcIds,
    activeCreatureIds,
    locationIds,
    estimateContext,
    stack,
  });
}
