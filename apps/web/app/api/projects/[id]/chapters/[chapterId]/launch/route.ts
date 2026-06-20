/**
 * POST /api/projects/[id]/chapters/[chapterId]/launch
 *
 * Lance la génération premium (V3) d'un chapitre depuis le Chapter Studio.
 *
 * Façade orchestratrice :
 *   1. Auth + load chapitre (+ age gate).
 *   2. Preflight stack (`run-preflight-stack-checks`).
 *   3. Snapshot studio + intent contract + readiness dashboard.
 *   4. Cast resolution (`resolve-launch-cast`).
 *   5. Premium contract + structural QA + intent coverage QA.
 *   6. Continuité : hydratation DNA + canon pack preflight + DNA preflight
 *      (`prepare-continuity-blueprints`).
 *   7. Premium readiness gate (`run-premium-readiness-gate`).
 *   8. Visual contract pre-launch + visual contract QA.
 *   9. Canon readiness gate (`run-canon-readiness-gate`).
 *   10. Persistance snapshot (`persist-launch-snapshot`).
 *   11. Dispatch job Inngest (`dispatch-launch-job`).
 */
import { NextResponse } from "next/server";
import {
  buildChapterReadinessReport,
  buildPanelTraceabilityReport,
  computeNarrativeMemoryDigestFromOutline,
  hydratePanelProvenanceOnBlueprints,
  isPipelineV3PremiumOnlyEnabled,
  type ChapterStudioSnapshot,
  type PanelBlueprintPremium,
} from "@manga-ai-studio/core";
import { prisma } from "@manga-ai-studio/db";
import { getAppUser } from "@/lib/auth/get-app-user";
import { canAccessMatureContent, getAgeGateMessage, projectRequiresAgeGate } from "@/lib/age-gate";
import { badRequest, notFound, unauthorized, validationError } from "@/lib/api-response";
import { readChapterStudioSnapshotFromOutline } from "@/lib/chapter-studio";
import {
  assertPremiumContract,
  resolveApprovedOutlineFromSnapshot,
} from "@/lib/premium-chapter-contract";
import { buildPremiumReadinessDashboard } from "@/lib/readiness/build-premium-readiness-dashboard";
import {
  premiumCharacterStudioSelect,
  type PremiumCharacterStudioRow,
} from "@/lib/premium-character-studio-select";
import { buildAndDispatchLaunchJob } from "./_helpers/dispatch-launch-job";
import { persistLaunchSnapshot } from "./_helpers/persist-launch-snapshot";
import { prepareContinuityBlueprints } from "./_helpers/prepare-continuity-blueprints";
import { resolveLaunchCast } from "./_helpers/resolve-launch-cast";
import { runCanonReadinessGate } from "./_helpers/run-canon-readiness-gate";
import { runIntentCoverageQaForLaunch } from "./_helpers/run-intent-coverage-qa";
import { runLaunchPreflightStackChecks } from "./_helpers/run-preflight-stack-checks";
import { runPremiumReadinessGate } from "./_helpers/run-premium-readiness-gate";
import { runStructuralQa } from "./_helpers/run-structural-qa";
import { runVisualContractQa } from "./_helpers/run-visual-contract-qa";

type Ctx = { params: Promise<{ id: string; chapterId: string }> };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function POST(_req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();

  const { id: projectId, chapterId } = await ctx.params;

  const logBlock = (code: string, reason: string, extra?: Record<string, unknown>) =>
    console.warn("[launch:block]", { projectId, chapterId, code, reason, ...extra });

  console.info("[launch] request_received", {
    projectId,
    chapterId,
    env: process.env.NODE_ENV,
    premiumOnly: isPipelineV3PremiumOnlyEnabled(),
  });

  // 1. Stack preflight (rate-limit, env, FAL/OpenAI/storage, vision QA…).
  const preflight = await runLaunchPreflightStackChecks({
    userId: user.id,
    projectId,
    chapterId,
    logBlock,
  });
  if (!preflight.ok) return preflight.response;
  const { stack, premiumOnly, strictPremiumContinuity } = preflight;

  // 2. Charger le chapitre + age gate.
  const chapter = await prisma.chapter.findFirst({
    where: { id: chapterId, projectId, project: { userId: user.id } },
    include: { project: { include: { user: { include: { preferences: true } } } } },
  });
  if (!chapter) {
    logBlock("CHAPTER_NOT_FOUND", "Chapter or project mismatch");
    return notFound();
  }
  if (
    projectRequiresAgeGate(chapter.project.contentRating, chapter.project.intensityLayer)
    && !canAccessMatureContent(chapter.project.user, chapter.project.user.preferences)
  ) {
    return validationError(getAgeGateMessage(chapter.project.contentRating));
  }

  // 3. Snapshot studio + readiness + intent contract premium guards.
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
      logBlock("INTENT_CONTRACT_REQUIRED", "Premium launch requires compiled chapter intent");
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
    const INTENT_CONFIDENCE_THRESHOLD = 0.5;
    if (typeof ic.confidenceScore !== "number" || ic.confidenceScore < INTENT_CONFIDENCE_THRESHOLD) {
      logBlock("INTENT_CONFIDENCE_TOO_LOW", "Intent confidence below premium threshold", {
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

  // B.1 — (re)construire le visualWorldContract depuis l'état courant
  // avant les checks readiness / premium pour ne jamais bloquer
  // juste parce que l'utilisateur n'a pas cliqué « Synchroniser ».
  try {
    const { rebuildVisualWorldContract } = await import("@/lib/chapter-studio/rebuild-visual-world-contract");
    snapshot.data.visualWorldContract = rebuildVisualWorldContract({
      chapterId,
      draft: snapshot.data,
    });
  } catch (vwErr) {
    console.warn(
      `[launch] visual_world_rebuild_failed (non-blocking): ${vwErr instanceof Error ? vwErr.message : vwErr}`,
    );
  }

  const readiness = snapshot.data.readinessReport ?? buildChapterReadinessReport(snapshot);
  if (readiness.status === "blocked") {
    return validationError("Le chapitre n'est pas prêt pour la génération.", readiness);
  }

  if (premiumOnly) {
    const dashboard = buildPremiumReadinessDashboard({
      snapshot,
      projectId,
      chapterId,
      chapterNumber: chapter.chapterNumber,
    });
    if (dashboard.status === "blocked") {
      logBlock(
        "PREMIUM_READINESS_DASHBOARD_BLOCKED",
        "Premium readiness dashboard blocked launch",
        {
          issueCodes: dashboard.issues.filter((i) => i.severity === "blocked").map((i) => i.code),
        },
      );
      return NextResponse.json(
        {
          error: "premium_readiness_blocked",
          code: "PREMIUM_READINESS_DASHBOARD_BLOCKED",
          message:
            "Des blocages premium empêchent le lancement (intention, monde visuel, script, couverture). Corrige les points listés puis réessaie.",
          premiumReadiness: {
            status: dashboard.status,
            score: dashboard.score,
            issues: dashboard.issues,
            catalogErrors: dashboard.catalogErrors,
            dialogueQaSummary: dashboard.dialogueQaSummary,
          },
        },
        { status: 422 },
      );
    }
  }

  // 4. Cast resolution (hero / NPC / focus IDs) + cast contract.
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

  const cast = resolveLaunchCast({
    chapterId,
    projectId,
    snapshot,
    chapterProjectCharacters,
    premiumOnly,
    logBlock,
  });
  if (!cast.ok) return cast.response;
  const {
    heroCharacterId,
    secondaryHeroCharacterId,
    deuteragonistCharacterId,
    focusCharacterIds,
    lockedCharacterIds,
    coreCastCharacterIds,
  } = cast;

  const charRefsForLabels = chapterProjectCharacters.map((c) => ({
    id: c.id,
    name: c.name,
    displayName: null as string | null,
    roleType: c.roleType,
  }));

  const snapshotDataRecord = asRecord(snapshot.data);
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
  const requiredCanonCharacterIds = [...new Set([...focusCharacterIds, ...lockedCharacterIds])];
  const coProtagonistCharacterIdsForHydration = [...new Set(
    [secondaryHeroCharacterId, deuteragonistCharacterId].filter((x): x is string => Boolean(x)),
  )];
  // `coreCastCharacterIds` reste calculé pour les futurs validateurs ; on évite
  // l'unused warning sans changer le contrat de cast.
  void coreCastCharacterIds;

  // 5. Premium contract + structural QA.
  const chapterOutlineRecord = asRecord(chapter.outline);
  const approvedOutline = resolveApprovedOutlineFromSnapshot(snapshot, chapterOutlineRecord);
  if (!approvedOutline) {
    return badRequest("Aucun outline validé n'est disponible pour lancer la génération.");
  }
  // BUG-22 fix : synchronise l'objet en mémoire pour `assertPremiumContract`.
  chapterOutlineRecord.approvedOutline = approvedOutline as Record<string, unknown>;

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
  const { structuralCanonicalQaPassed, bpStructural, outlineForStructuralQa } = structuralQaResult;

  // 6. Continuity : hydratation DNA + canon pack + panel preflight.
  const continuity = await prepareContinuityBlueprints({
    projectId,
    chapterId,
    snapshot,
    chapterProjectCharacters,
    strictPremiumContinuity,
    coProtagonistCharacterIds: coProtagonistCharacterIdsForHydration,
    logBlock,
  });
  if (!continuity.ok) return continuity.response;
  const { bpForContinuity } = continuity;

  // 7. Intent coverage QA (run after canon pack but before continuity preflight
  //    pour conserver la séquence d'origine et les codes d'erreur).
  const intentCoverageResult = await runIntentCoverageQaForLaunch({
    projectId,
    chapterId,
    chapter,
    snapshot,
    charRefsForLabels,
    strictPremiumContinuity,
  });
  if (!intentCoverageResult.ok) return intentCoverageResult.response;

  // Construction du snapshot enrichi pour la suite.
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

  // 8. Premium readiness gate (V3 only).
  const readinessGate = runPremiumReadinessGate({
    chapterId,
    studioSnapshotForLaunch,
    heroCharacterId,
    secondaryHeroCharacterId,
    deuteragonistCharacterId,
    structuralCanonicalQaPassed,
  });
  void readinessGate;

  // Trace panneau (logging non-bloquant pour debug + métriques).
  const bpForTraceability =
    Array.isArray(bpForContinuity) && bpForContinuity.length > 0
      ? bpForContinuity
      : bpStructural;
  if (Array.isArray(bpForTraceability) && bpForTraceability.length > 0) {
    const traceDigest = computeNarrativeMemoryDigestFromOutline(outlineForStructuralQa);
    const tracedBlueprints = hydratePanelProvenanceOnBlueprints(
      bpForTraceability as PanelBlueprintPremium[],
      { narrativeMemoryDigest: traceDigest },
    );
    console.info(
      `[launch] panel_traceability chapterId=${chapterId}`,
      buildPanelTraceabilityReport(tracedBlueprints),
    );
  }

  // 9. Visual contract QA. (Le gate "case de confirmation pré-launch" du wizard
  // a été retiré : dans le studio conversationnel, cliquer Générer EST la
  // confirmation — il n'y a plus de panneau à cocher.)
  const visualContractQaResult = runVisualContractQa({
    chapterId,
    snapshot,
    studioSnapshotForLaunch,
  });
  if (!visualContractQaResult.ok) return visualContractQaResult.response;

  // 10. Canon readiness gate.
  const canonGate = await runCanonReadinessGate({
    projectId,
    chapterId,
    requiredCharacterIds: requiredCanonCharacterIds,
  });
  void canonGate;

  // Logging estimate→launch traceability (purement observabilité).
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
        `[launch] estimate_snapshot_not_launch_aligned chapterId=${chapterId} `
        + `continuity_ok=${estimateContext.continuityPreflight?.ok ?? "n/a"} `
        + `blockers_count=${estimateContext.continuityPreflight?.blockers?.length ?? 0} — `
        + "le snapshot indique que le dernier estimate n’était pas prêt ; le launch vérifie quand même les blueprints actuels.",
      );
    }
  }

  const _pp = studioSnapshotForLaunch.data.productionPlan;
  console.log(
    `[launch] premium_launch projectId=${projectId} chapterId=${chapterId} `
    + `approvedOutlineVersion=${approvedOutline.approvalVersion} `
    + `beatCount=${approvedOutline.beats.length} `
    + `productionOutlineBeatCount=${snapshot.data.productionOutline?.beats?.length ?? 0} `
    + `productionPlanPageCount=${Array.isArray(_pp?.pages) ? _pp.pages.length : 0} `
    + `panelBlueprintCount=${Array.isArray(_pp?.panelBlueprints) ? _pp.panelBlueprints.length : 0} `
    + `heroCenterRatio=${_pp?.heroCenterRatio ?? "n/a"} `
    + `premiumReadinessScore=${_pp?.premiumReadinessScore ?? "n/a"} `
    + `propCoverage=${JSON.stringify(_pp?.propCoverage ?? null)} `
    + `enemyCoverage=${JSON.stringify(_pp?.enemyCoverage ?? null)} `
    + `npcCoverage=${JSON.stringify(_pp?.npcCoverage ?? null)} `
    + `cutawayCoverage=${JSON.stringify(_pp?.cutawayCoverage ?? null)} `
    + `dialogueAnchorCoverage=${JSON.stringify(_pp?.dialogueAnchorCoverage ?? null)}`,
  );

  // 11. Persistance snapshot final + dispatch Inngest.
  const { nextSnapshot } = await persistLaunchSnapshot({
    chapterId,
    chapter,
    studioSnapshotForLaunch,
    readiness,
    approvedOutline,
    chapterOutlineRecord,
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
