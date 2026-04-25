import { NextResponse } from "next/server";
import { aggregateChapterImageCounts, classifyPanelCriticality, PREMIUM_PANEL_RANGE } from "@manga-ai-studio/core";
import { prisma } from "@manga-ai-studio/db";
import { getAppUser } from "@/lib/auth/get-app-user";
import { notFound, unauthorized } from "@/lib/api-response";
import { readChapterStudioSnapshotFromOutline } from "@/lib/chapter-studio";
import { PREMIUM_BREACH_TYPES as CENTRAL_PREMIUM_BREACH_TYPES } from "@/lib/retry/classify-premium-repair";

type Ctx = { params: Promise<{ id: string; chapterId: string }> };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** P1.14 — Exclure l’historique hors run courant (sauf panels déjà validés utilisateur). */
function sceneImageIncludedInCurrentRunReport(
  image: { generationRunId: string | null; userValidatedAt: Date | null },
  chapter: { currentGenerationRunId: string | null },
): boolean {
  if (!chapter.currentGenerationRunId) return true;
  if (image.userValidatedAt) return true;
  return image.generationRunId === chapter.currentGenerationRunId;
}

export async function GET(_req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();

  const { id: projectId, chapterId } = await ctx.params;
  const chapter = await prisma.chapter.findFirst({
    where: { id: chapterId, projectId, project: { userId: user.id } },
    include: {
      scenes: {
        orderBy: { sceneNumber: "asc" },
        include: {
          images: {
            orderBy: { panelNumber: "asc" },
          },
        },
      },
    },
  });
  if (!chapter) return notFound();

  const studio = readChapterStudioSnapshotFromOutline({
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
  const minimumImages = studio.data.productionPlan?.minimumImages ?? studio.data.readinessReport?.imageCounts.minimumImages ?? PREMIUM_PANEL_RANGE.min;

  const panelResults = chapter.scenes.flatMap((scene) =>
    scene.images
      .filter((image) => sceneImageIncludedInCurrentRunReport(image, chapter))
      .map((image) => {
      const meta = asRecord(image.metadata);
      const validationDetails = asRecord(meta.validationDetails);
      const qualityScores = asRecord(validationDetails.qualityScores);
      const panelCriticality = asRecord(validationDetails.panelCriticality);
      const issues = Array.isArray(validationDetails.issues)
        ? validationDetails.issues as Array<{ message?: string; type?: string }>
        : [];
      const releaseScore =
        typeof qualityScores.releaseScore === "number"
          ? qualityScores.releaseScore
          : typeof image.consistencyScore === "number"
            ? image.consistencyScore
            : 0;
      const criticalityDecision = panelCriticality.level === "CRITICAL"
        ? {
            level: "CRITICAL" as const,
            reasons: Array.isArray(panelCriticality.reasons) ? panelCriticality.reasons.filter((reason): reason is string => typeof reason === "string") : [],
            qaWasRequired: true,
          }
        : classifyPanelCriticality({
            panelCategory: typeof meta.panelCategory === "string" ? meta.panelCategory : null,
            pageNumber: scene.sceneNumber,
            panelNumber: image.panelNumber,
            pagePanelCount: scene.images.filter((im) => sceneImageIncludedInCurrentRunReport(im, chapter)).length,
            visualPriority: typeof meta.visualPriority === "string" ? meta.visualPriority : null,
          });
      const qaWasRequired =
        validationDetails.qaWasRequired === true
        || meta.qaWasRequired === true
        || criticalityDecision.qaWasRequired;
      const qaWasExecuted = validationDetails.qaWasExecuted === true || meta.qaWasExecuted === true;
      const qaFailureReason =
        typeof validationDetails.qaFailureReason === "string"
          ? validationDetails.qaFailureReason
          : typeof meta.qaFailureReason === "string"
            ? meta.qaFailureReason
            : null;
      const driftSeverity =
        typeof meta.driftSeverity === "string"
          ? meta.driftSeverity
          : null;
      const driftScore =
        typeof meta.driftScore === "number"
          ? meta.driftScore
          : null;
      const driftReasons = Array.isArray(meta.driftReasons)
        ? meta.driftReasons.filter((reason): reason is string => typeof reason === "string")
        : Array.isArray(meta.driftIssues)
          ? meta.driftIssues.filter((reason): reason is string => typeof reason === "string")
          : [];
      // Phase 8/13 : sous-scores drift 2.0
      const styleDriftScore = typeof meta.styleDriftScore === "number" ? meta.styleDriftScore : null;
      const characterDriftScore = typeof meta.characterDriftScore === "number" ? meta.characterDriftScore : null;
      const beatAlignmentScore = typeof meta.beatAlignmentScore === "number" ? meta.beatAlignmentScore : null;
      const sceneContinuityScore = typeof meta.sceneContinuityScore === "number" ? meta.sceneContinuityScore : null;
      const chapterLookMismatch = typeof meta.chapterLookMismatch === "boolean" ? meta.chapterLookMismatch : null;
      const driftRecommendedAction = typeof meta.driftRecommendedAction === "string" ? meta.driftRecommendedAction : null;
      const continuityRisk = typeof meta.driftConflictingTraits === "object" && Array.isArray(meta.driftConflictingTraits) && meta.driftConflictingTraits.length > 0;
      const retryDecision = asRecord(meta.retryReferenceDecision);
      const preservedConstraints = Array.isArray(retryDecision.preservedConstraints)
        ? retryDecision.preservedConstraints.filter((c): c is string => typeof c === "string")
        : [];
      const relaxedConstraints = Array.isArray(retryDecision.relaxedConstraints)
        ? retryDecision.relaxedConstraints.filter((c): c is string => typeof c === "string")
        : [];
      const autoAppliedPatches = Array.isArray(meta.autoAppliedPatches) ? meta.autoAppliedPatches : [];
      const rerollHistory = Array.isArray(meta.rerollHistory) ? meta.rerollHistory : [];
      const latestReroll = rerollHistory.at(-1);
      const latestRerollRecord =
        latestReroll && typeof latestReroll === "object" && !Array.isArray(latestReroll)
          ? (latestReroll as Record<string, unknown>)
          : {};
      // Premium scores (calculés par panel-validator, stockés dans validationDetails.qualityScores)
      const propComplianceScore = typeof qualityScores.propComplianceScore === "number"
        ? qualityScores.propComplianceScore : undefined;
      const subjectFocusScore = typeof qualityScores.subjectFocusScore === "number"
        ? qualityScores.subjectFocusScore : undefined;
      const dialogueAnchorScore = typeof qualityScores.dialogueAnchorScore === "number"
        ? qualityScores.dialogueAnchorScore : undefined;
      const enemyPresenceScore = typeof qualityScores.enemyPresenceScore === "number"
        ? qualityScores.enemyPresenceScore : undefined;
      const populationScore = typeof qualityScores.populationScore === "number"
        ? qualityScores.populationScore : undefined;
      const cutawayComplianceScore = typeof qualityScores.cutawayComplianceScore === "number"
        ? qualityScores.cutawayComplianceScore : undefined;

      // Issues premium (issues typées depuis validationDetails)
      const premiumIssues = Array.isArray(validationDetails.issues)
        ? (validationDetails.issues as Array<{ message?: string; type?: string; severity?: string }>)
            .filter((i) => [
              "missing_prop", "missing_weapon", "missing_device",
              "wrong_subject_focus", "missing_dialogue_anchor",
              "missing_enemy_presence", "npc_population_missing",
              "cutaway_not_respected", "cutaway_collapsed_to_hero", "wrong_cutaway_target",
              "object_used_but_not_visible",
            ].includes(i.type ?? ""))
        : [];

      return {
        panelId: image.id,
        sceneId: scene.id,
        panelNumber: image.panelNumber,
        imageUrl: image.imageUrl,
        previousImageUrl:
          typeof meta.previousImageUrl === "string"
            ? meta.previousImageUrl
            : typeof latestRerollRecord.previousImageUrl === "string"
              ? latestRerollRecord.previousImageUrl
              : null,
        critical: criticalityDecision.level === "CRITICAL",
        criticality: criticalityDecision.level,
        criticalityReasons: criticalityDecision.reasons,
        score: releaseScore,
        axisScores: {
          characterFidelity: typeof qualityScores.styleConsistencyScore === "number" ? qualityScores.styleConsistencyScore : releaseScore,
          narrativeRelevance: typeof qualityScores.interactionScore === "number" ? qualityScores.interactionScore : releaseScore,
          compositionReadability: typeof qualityScores.shotComplianceScore === "number" ? qualityScores.shotComplianceScore : releaseScore,
          environmentConsistency: typeof qualityScores.environmentReadabilityScore === "number" ? qualityScores.environmentReadabilityScore : releaseScore,
          // Premium contractual scores
          propComplianceScore,
          subjectFocusScore,
          dialogueAnchorScore,
          enemyPresenceScore,
          populationScore,
          cutawayComplianceScore,
        },
        rejectionReasons: [
          ...issues.map((issue) => issue.message ?? issue.type ?? "quality_issue"),
          ...premiumIssues.map((issue) => issue.message ?? issue.type ?? "premium_issue"),
          ...driftReasons,
        ].slice(0, 12),
        repairSuggestions: [
          ...issues.map((issue) => `Réparer ${issue.type ?? "quality_issue"}`),
          ...premiumIssues.map((issue) => {
            switch (issue.type) {
              case "missing_prop":
              case "missing_weapon":
              case "missing_device":
                return `Reroll prop — ajouter l'objet obligatoire manquant (mode: prop)`;
              case "wrong_subject_focus":
                return `Reroll focus sujet — recadrer sur le personnage principal (mode: subject_focus)`;
              case "missing_dialogue_anchor":
                return `Reroll ancrage dialogue — repositionner le locuteur visible (mode: speaker)`;
              case "missing_enemy_presence":
                return `Reroll présence ennemi — l'antagoniste doit être visible dans ce panel (mode: enemy_presence)`;
              case "npc_population_missing":
                return `Reroll population NPC — ajouter la foule ou les personnages secondaires (mode: npc_population)`;
              case "cutaway_not_respected":
              case "cutaway_collapsed_to_hero":
              case "wrong_cutaway_target":
                return `Reroll cutaway — le plan de coupe doit montrer le sujet contractuel, pas le héros (mode: cutaway)`;
              case "object_used_but_not_visible":
                return `Reroll prop — l'objet utilisé dans la scène doit être visible (mode: prop)`;
              default:
                return `Corriger ${issue.type ?? "premium_issue"}`;
            }
          }),
        ],
        rerollCount:
          typeof meta.rerollCount === "number"
            ? meta.rerollCount
            : typeof asRecord(meta.generationLog).rerollCount === "number"
              ? Number(asRecord(meta.generationLog).rerollCount)
              : 0,
        driftScore,
        driftSeverity,
        driftReasons,
        // Phase 13 : drift 2.0 scores
        styleDriftScore,
        characterDriftScore,
        beatAlignmentScore,
        sceneContinuityScore,
        chapterLookMismatch,
        recommendedAction: driftRecommendedAction,
        continuityRisk,
        preservedConstraints,
        relaxedConstraints,
        autoAppliedPatches,
        promptDebug: asRecord(meta.promptDebug),
        prompt: typeof image.prompt === "string" ? image.prompt : null,
        referencePolicy: typeof meta.referencePolicy === "string" ? meta.referencePolicy : null,
        panelCategory: typeof meta.panelCategory === "string" ? meta.panelCategory : null,
        chapterLookProfileMode: typeof meta.chapterLookProfileMode === "string" ? meta.chapterLookProfileMode : null,
        status: image.status,
        qaWasRequired,
        qaWasExecuted,
        qaFailureReason,
        qaBypassReason:
          typeof validationDetails.qaBypassReason === "string"
            ? validationDetails.qaBypassReason
            : typeof meta.qaBypassReason === "string"
              ? meta.qaBypassReason
              : null,
      };
    }),
  );

  const acceptedPanelCount = panelResults.filter((panel) => panel.status === "completed").length;
  const rejectedPanelCount = panelResults.filter((panel) => panel.status === "failed" || panel.status === "blocked").length;
  const imageCounts = aggregateChapterImageCounts({
    estimatedImages: studio.data.productionPlan?.estimatedImages ?? panelResults.length,
    targetImages: studio.data.productionPlan?.targetImages ?? panelResults.length,
    minimumImages,
    generatedImages: panelResults.length,
    acceptedImages: acceptedPanelCount,
    rejectedImages: rejectedPanelCount,
  });
  const chapterScore =
    panelResults.length > 0
      ? panelResults.reduce((acc, panel) => acc + panel.score, 0) / panelResults.length
      : 0;

  const premiumRejections = panelResults.flatMap((p) =>
    p.rejectionReasons.filter((r) =>
      ["missing_prop", "missing_weapon", "missing_device", "wrong_subject_focus",
       "missing_dialogue_anchor", "missing_enemy_presence", "npc_population_missing",
       "cutaway_not_respected", "cutaway_collapsed_to_hero", "wrong_cutaway_target",
       "object_used_but_not_visible"].some((t) => r.includes(t))
    )
  );

  // P2.3 : seuil bloquant — un chapitre ne peut pas être considéré "OK" si trop
  // de panels trahissent le contrat premium. Les panels `contractualCritical`
  // (arme, décor, reveal, foule) sont pondérés plus fort.
  // Source unique : `classify-premium-repair` centralise la liste des types
  // d'issues qui violent le contrat premium (utilisé aussi par chapter-health
  // et l'auto-repair orchestrator P2.4).
  const PREMIUM_BREACH_TYPES = CENTRAL_PREMIUM_BREACH_TYPES;
  const breachedPanels: Array<{
    panelId: string;
    panelNumber: number;
    types: string[];
    contractualCritical: boolean;
  }> = [];
  for (const scene of chapter.scenes) {
    for (const image of scene.images.filter((im) => sceneImageIncludedInCurrentRunReport(im, chapter))) {
      const meta = asRecord(image.metadata);
      const validationDetails = asRecord(meta.validationDetails);
      const panelContractMeta = asRecord(meta.panelContract);
      const premiumBlueprintMeta = asRecord(meta.premiumBlueprint);
      const contractualCritical =
        Boolean(panelContractMeta.contractualCritical) ||
        Boolean(premiumBlueprintMeta.contractualCritical);
      const issues = Array.isArray(validationDetails.issues)
        ? (validationDetails.issues as Array<{ type?: string }>)
        : [];
      const breachTypes = issues
        .map((i) => (typeof i.type === "string" ? i.type : null))
        .filter((t): t is string => t != null && PREMIUM_BREACH_TYPES.includes(t as typeof PREMIUM_BREACH_TYPES[number]));
      if (breachTypes.length > 0) {
        breachedPanels.push({
          panelId: image.id,
          panelNumber: image.panelNumber,
          types: breachTypes,
          contractualCritical,
        });
      }
    }
  }
  const breachWeight = breachedPanels.reduce(
    (sum, p) => sum + (p.contractualCritical ? 2 : 1),
    0,
  );
  const totalPanels = panelResults.length || 1;
  const breachRatio = breachWeight / (totalPanels * 2);
  // Un chapitre est "blocked" si > 20% du poids premium est violé
  // OU si plus de 3 panels contractuels critiques sont cassés.
  const contractualCriticalBreaches = breachedPanels.filter((p) => p.contractualCritical).length;
  const premiumReviewBlocked =
    breachRatio > 0.20 || contractualCriticalBreaches > 3;
  const approvedOutlineRecord = asRecord(asRecord(chapter.outline).approvedOutline);
  const approvedOutlineVersion = typeof approvedOutlineRecord.version === "number"
    ? approvedOutlineRecord.version
    : typeof approvedOutlineRecord.version === "string"
      ? approvedOutlineRecord.version
      : null;
  const studioDataRecord = asRecord(asRecord(asRecord(chapter.outline).studio).data);
  const productionOutlineRecord = asRecord(studioDataRecord.productionOutline);
  const productionPlanRecord = asRecord(studioDataRecord.productionPlan);
  console.info(
    `[qa-report] chapterId=${chapterId} approvedOutlineVersion=${approvedOutlineVersion ?? "n/a"} ` +
    `productionOutlineBeatCount=${Array.isArray(productionOutlineRecord.beats) ? productionOutlineRecord.beats.length : "n/a"} ` +
    `productionPlanPageCount=${Array.isArray(productionPlanRecord.pages) ? productionPlanRecord.pages.length : "n/a"} ` +
    `panelCount=${panelResults.length} chapterScore=${chapterScore.toFixed(2)} ` +
    `premiumRejections=${premiumRejections.length} rejectedPanels=${rejectedPanelCount}`
  );

  return NextResponse.json({
    ok: true,
    chapterId,
    report: {
      panelResults,
      pageScore: chapterScore,
      chapterScore,
      acceptedPanelCount,
      rejectedPanelCount,
      imageCounts,
      criticalPanelsCount: panelResults.filter((panel) => panel.critical).length,
      criticalPanelsWithVisualQA: panelResults.filter((panel) => panel.critical && panel.qaWasExecuted).length,
      criticalPanelsBlocked: panelResults.filter((panel) => panel.critical && panel.status === "blocked").length,
      criticalPanelsMissingQA: panelResults.filter((panel) => panel.critical && (!panel.qaWasExecuted || panel.qaFailureReason)).length,
      missingCriticalPanels: panelResults
        .filter((panel) => panel.critical && (panel.status !== "completed" || !panel.qaWasExecuted))
        .map((panel) => panel.panelId),
      // P2.3 : état coercitif du contrat premium sur le chapitre
      premiumContractHealth: {
        breachedPanels,
        breachRatio,
        contractualCriticalBreaches,
        blocked: premiumReviewBlocked,
        reason: premiumReviewBlocked
          ? contractualCriticalBreaches > 3
            ? `Trop de panels contractuellement critiques (arme, décor, foule, reveal) cassés : ${contractualCriticalBreaches}`
            : `Trahison du contrat premium sur ${Math.round(breachRatio * 100)}% du volume pondéré`
          : null,
      },
    },
  });
}
