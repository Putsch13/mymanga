/**
 * POST /api/projects/[id]/chapters/estimate
 *
 * Génère un "estimate" complet pour un nouveau chapitre ou un chapitre existant
 * (preview + production plan). Façade qui orchestre :
 *   1. Auth + project ownership + body schema.
 *   2. Résolution du chapitre cible et du `targetChapterNumber`.
 *   3. `prepareEstimateBundle` : bundle initial + ré-alignement Visual World.
 *   4. `enrichEstimateBeats` : faits narratifs, props requis, blueprints panneaux.
 *   5. `buildCanonicalChapterProductionPlan` + merge canon vs raw.
 *   6. `loadEstimateCastContext` (héros / co-protag / canon map).
 *   7. `hydrateEstimateBlueprints` : DNA + provenance.
 *   8. Structural QA + classification panel count.
 *   9. `buildEstimateProductionPlan`.
 *   10. Continuity preflight + premium plan contract QA + planReady.
 *   11. `buildEstimateResponse`.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { runPremiumPlanContractQa } from "@manga-ai-studio/ai";
import {
  PREMIUM_PANEL_RANGE,
  buildCanonicalChapterProductionPlan,
  classifyPremiumPanelCount,
  computeNarrativeMemoryDigestFromOutline,
  computePanelContinuityPreflights,
  continuityPreflightBlockingReasons,
  isPipelineV3PremiumOnlyEnabled,
  isPremiumStrictMode,
  mergeRawBlueprintsWithCanonicalRhythm,
  runStructuralQaOnPremiumBlueprints,
} from "@manga-ai-studio/core";
import { estimateChapterTextTokensFromRules } from "@manga-ai-studio/billing";
import { prisma } from "@manga-ai-studio/db";
import { buildProjectContext } from "@manga-ai-studio/memory";
import { getAppUser } from "@/lib/auth/get-app-user";
import { notFound, unauthorized } from "@/lib/api-response";
import { getOwnedProject } from "@/lib/ownership";
import { readChapterStudioSnapshotFromOutline } from "@/lib/chapter-studio";
import { getGenerationStackStatus } from "@/lib/generation/stack-readiness";
import { computePremiumAiReadiness } from "@/lib/compute-premium-ai-readiness";
import { premiumCharacterStudioSelect } from "@/lib/premium-character-studio-select";
import {
  validateNarrativeProgression,
  type ProductionBeatLike,
} from "@/lib/outline-dedup";
import { buildEditorialPreview } from "./_helpers/build-editorial-preview";
import { buildEnrichmentContexts } from "./_helpers/build-enrichment-contexts";
import { buildEstimateProductionPlan } from "./_helpers/build-estimate-production-plan";
import { buildEstimateResponse } from "./_helpers/build-estimate-response";
import { enrichEstimateBeats } from "./_helpers/enrich-estimate-beats";
import { hydrateEstimateBlueprints } from "./_helpers/hydrate-estimate-blueprints";
import { loadEstimateCastContext } from "./_helpers/load-estimate-cast-context";
import { prepareEstimateBundle } from "./_helpers/prepare-estimate-bundle";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  // Optionnel : le studio conversationnel ne renvoie pas userIntent (il est déjà
  // persisté sur le chapitre). On le résout côté serveur, cf. effectiveUserIntent.
  userIntent: z.string().min(3).optional(),
  chapterId: z.string().optional(),
  chapterNumber: z.number().int().positive().optional().nullable(),
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

export async function POST(req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const { id: projectId } = await ctx.params;
  const project = await getOwnedProject(user.id, projectId);
  if (!project) return notFound();

  const body = schema.parse(await req.json());
  const estimatedTokens = await estimateChapterTextTokensFromRules();

  // 1. Résolution du chapitre cible.
  const targetChapter = body.chapterId
    ? await prisma.chapter.findFirst({
      where: { id: body.chapterId, projectId },
      select: {
        id: true,
        chapterNumber: true,
        title: true,
        status: true,
        // P2.1bis — on a besoin du minimum du chapitre pour garantir que le
        // contrat sort avec panelBlueprints.length >= minimumImages.
        minimumImages: true,
        // Résolution de l'intention quand le client ne la passe pas (studio conversationnel).
        userIntent: true,
        outline: true,
      },
    })
    : null;
  if (body.chapterId && !targetChapter) return notFound();

  const nextChapter = !targetChapter
    ? await prisma.chapter.findFirst({
      where: { projectId },
      orderBy: { chapterNumber: "desc" },
      select: { chapterNumber: true },
    })
    : null;
  const targetChapterNumber = targetChapter?.chapterNumber ?? ((nextChapter?.chapterNumber ?? 0) + 1);
  const estimateMode: "existing_chapter" | "new_chapter" = targetChapter ? "existing_chapter" : "new_chapter";

  // Résolution de l'intention effective. Le studio conversationnel n'envoie pas
  // `userIntent` (il vit déjà sur le chapitre / dans le contrat compilé). On
  // retombe sur : (1) chapter.userIntent, (2) le chapterIntentContract persisté.
  let effectiveUserIntent = body.userIntent?.trim() ?? "";
  if (effectiveUserIntent.length < 3 && targetChapter) {
    if (targetChapter.userIntent && targetChapter.userIntent.trim().length >= 3) {
      effectiveUserIntent = targetChapter.userIntent.trim();
    } else {
      const snap = readChapterStudioSnapshotFromOutline({
        outline: targetChapter.outline,
        chapterNumber: targetChapter.chapterNumber,
        chapterTitle: targetChapter.title,
        chapterSummary: null,
        cliffhanger: null,
        userIntent: targetChapter.userIntent,
      });
      const c = snap.data.chapterIntentContract;
      if (c) {
        effectiveUserIntent = [c.understoodPitch, c.plotGoal, ...(c.mustInclude ?? [])]
          .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
          .join(". ")
          .trim();
      }
    }
  }
  if (effectiveUserIntent.length < 3) {
    return NextResponse.json(
      {
        error:
          "Intention de chapitre manquante. Décris d'abord ce qu'il doit se passer "
          + "dans le chapitre via l'interviewer avant de générer.",
        code: "MISSING_USER_INTENT",
      },
      { status: 400 },
    );
  }

  console.log(
    `[estimate] estimate_started projectId=${projectId} chapterId=${targetChapter?.id ?? "new"} `
    + `chapterNumber=${targetChapterNumber} estimateMode=${estimateMode}`,
  );

  // 2. Project context (memory) + bundle premium aligné VW.
  const context = await buildProjectContext(prisma, projectId, effectiveUserIntent, {
    focusCharacterIds: body.focusCharacterIds,
    targetChapterId: targetChapter?.id ?? null,
    targetChapterNumber,
  });
  if (!context) return notFound();

  const estimateChapterId = targetChapter?.id ?? `estimate-${projectId}-ch${targetChapterNumber}`;
  const estimateChapterTitle = targetChapter?.title ?? `Chapitre ${targetChapterNumber}`;

  const bundle = await prepareEstimateBundle({
    projectId,
    estimateChapterId,
    targetChapter: targetChapter ? { id: targetChapter.id, title: targetChapter.title } : null,
    targetChapterNumber,
    userIntent: effectiveUserIntent,
    selectedPlotLabel: body.selectedPlotLabel,
    creativityControls: body.creativityControls,
    context,
  });

  // 3. Editorial preview beats (5 tournants narratifs représentatifs).
  const { previewBeats, previewVersion } = buildEditorialPreview({
    bundleOutline: bundle.outline,
  });

  // 4. Cast / world contexts pour enrichissement.
  const {
    heroCharacterId,
    universeContext,
    narrativeContext,
    characterCatalogForResolution,
  } = buildEnrichmentContexts({
    project: context.project,
    characters: context.characters,
    recentContinuityEvents: context.recentContinuityEvents,
    visualWorldContract: bundle.visualWorldContract ?? null,
  });

  // P0 fix : NPC groups détectés dans le VisualWorld doivent être considérés
  // comme des refs valides. On fusionne (1) le VW courant si déjà composé,
  // (2) la table projet `NpcGroup` (auto-détectés à compile intent).
  const projectNpcGroups = await prisma.npcGroup.findMany({
    where: { projectId },
    select: { id: true, label: true },
  });
  const npcGroupRefMap = new Map<string, { id: string; label: string }>();
  for (const g of bundle.visualWorldContract?.npcGroups ?? []) {
    if (typeof g.id === "string" && g.id.length > 0) {
      npcGroupRefMap.set(g.id, { id: g.id, label: g.label });
    }
  }
  for (const g of projectNpcGroups) {
    if (!npcGroupRefMap.has(g.id)) {
      npcGroupRefMap.set(g.id, { id: g.id, label: g.label });
    }
  }
  const npcGroupRefsForResolution = [...npcGroupRefMap.values()];

  // 5. Beat enrichment (faits + props + blueprints natifs).
  const { rawBlueprints, rawProductionBeats, enrichedBeats } = await enrichEstimateBeats({
    bundle,
    characterCatalogForResolution,
    npcGroupRefsForResolution,
    narrativeContext,
    universeContext,
    heroCharacterId,
    projectGenre: context.project.primaryGenre ?? null,
    projectTone: context.project.tone ?? null,
  });

  const characterRefsUnresolved = [
    ...new Set(rawProductionBeats.flatMap((b) => b.unresolvedCharacterRefs ?? [])),
  ];
  const characterRefResolutionOk = characterRefsUnresolved.length === 0;

  const progressionCheck = validateNarrativeProgression(rawProductionBeats as ProductionBeatLike[]);
  if (!progressionCheck.ok) {
    console.warn(
      `[estimate] plan_dedup_applied chapterId=${targetChapter?.id ?? "new"} `
      + `issues=${progressionCheck.issues.length} score=${progressionCheck.progressionScore.toFixed(2)}`,
    );
  }

  const productionOutline = {
    source: "estimated" as const,
    chapterGoal: bundle.outline.chapter_goal,
    cliffhanger: bundle.outline.cliffhanger,
    beats: rawProductionBeats,
  };

  // 6. Plan canonique (source de vérité éditoriale) + merge avec rythme natif.
  const projectFormat = context.project.format === "webtoon" ? "webtoon" : "manga";
  const canonicalPlan = buildCanonicalChapterProductionPlan({
    chapterId: estimateChapterId,
    projectId,
    chapterNumber: targetChapterNumber,
    chapterTitle: estimateChapterTitle,
    format: projectFormat,
    rawOutline: productionOutline,
    knownNpcGroups: npcGroupRefsForResolution,
    knownCharacters: characterCatalogForResolution,
    visualWorld: bundle.visualWorldContract ?? null,
  });
  const mergedBlueprints = mergeRawBlueprintsWithCanonicalRhythm(rawBlueprints, canonicalPlan);
  const narrativeDigest = computeNarrativeMemoryDigestFromOutline(productionOutline);

  // 7. Cast premium context + DNA hydration.
  const characterRowsForHydration = await prisma.character.findMany({
    where: { projectId },
    select: premiumCharacterStudioSelect,
  });
  const cast = await loadEstimateCastContext({
    projectId,
    targetChapter: targetChapter
      ? {
          id: targetChapter.id,
          chapterNumber: targetChapter.chapterNumber,
          title: targetChapter.title,
        }
      : null,
    targetChapterNumber,
    estimateChapterTitle,
    fallbackHeroCharacterId: heroCharacterId,
  });

  const allBlueprints = hydrateEstimateBlueprints({
    blueprints: mergedBlueprints,
    characterRowsForHydration,
    characterCanonsById: cast.characterCanonsById,
    coProtagonistCharacterIdsForHydration: cast.coProtagonistCharacterIdsForHydration,
    visualWorldContract: bundle.visualWorldContract ?? null,
    narrativeMemoryDigest: narrativeDigest,
  });

  // 8. Structural QA finale (sur les blueprints persistés).
  const structuralFromPersistedBlueprints = runStructuralQaOnPremiumBlueprints({
    chapterId: estimateChapterId,
    projectId,
    chapterNumber: targetChapterNumber,
    chapterTitle: estimateChapterTitle,
    format: projectFormat,
    productionOutline,
    blueprints: allBlueprints,
    knownNpcGroups: npcGroupRefsForResolution,
    knownCharacters: characterCatalogForResolution,
  });
  const finalStructuralQa = structuralFromPersistedBlueprints.qa;
  if (!finalStructuralQa.valid) {
    console.error(
      `[estimate] final_structural_qa_failed chapterId=${targetChapter?.id ?? "new"} `
      + `errors=${JSON.stringify(finalStructuralQa.errors)}`,
    );
  }

  const panelCountStatus = classifyPremiumPanelCount(allBlueprints.length);
  const chapterMinimumImages =
    typeof targetChapter?.minimumImages === "number" && targetChapter.minimumImages > 0
      ? targetChapter.minimumImages
      : PREMIUM_PANEL_RANGE.min;
  const isEmptyPlan = allBlueprints.length === 0 || productionOutline.beats.length === 0;
  const rawNativeStatus = classifyPremiumPanelCount(rawBlueprints.length);
  if (rawNativeStatus === "under_min") {
    console.warn(
      `[estimate] native_blueprints_below_range raw=${rawBlueprints.length} `
      + `contract=${allBlueprints.length} chapterId=${targetChapter?.id ?? "new"} — le contrat premium suit le plan canonique`,
    );
  }
  if (panelCountStatus === "under_min") {
    console.error(
      `[estimate] below_target_range contract=${allBlueprints.length} required_range=${PREMIUM_PANEL_RANGE.min}-${PREMIUM_PANEL_RANGE.max} chapterId=${targetChapter?.id ?? "new"} — BLOQUÉ`,
    );
  }
  if (panelCountStatus === "over_max") {
    console.error(
      `[estimate] over_target_range contract=${allBlueprints.length} required_range=${PREMIUM_PANEL_RANGE.min}-${PREMIUM_PANEL_RANGE.max} chapterId=${targetChapter?.id ?? "new"} — BLOQUÉ`,
    );
  }
  if (isEmptyPlan) {
    console.error(
      `[estimate] empty_plan chapterId=${targetChapter?.id ?? "new"} — outline ou plan canonique vide`,
    );
  }

  console.log(
    `[estimate] blueprint_quality chapterId=${targetChapter?.id ?? "new"} `
    + `raw_native=${rawBlueprints.length} contract_canonical=${allBlueprints.length} `
    + `target_range=${PREMIUM_PANEL_RANGE.min}-${PREMIUM_PANEL_RANGE.max} status=${panelCountStatus}`,
  );

  // 9. Production plan final (focus budget + couvertures + shotPlan + cutaway QA).
  const productionPlan = buildEstimateProductionPlan({
    productionOutline,
    allBlueprints,
    enrichedBeats,
    chapterMinimumImages,
    premiumReadinessCast: cast.premiumReadinessCast,
    projectTitle: context.project.title ?? null,
    chapterTitle: targetChapter?.title ?? null,
  });

  // 10. Continuity preflight + plan contract QA + planReady.
  const strictPremiumContinuity = isPipelineV3PremiumOnlyEnabled() || isPremiumStrictMode();
  const continuityPreflights = strictPremiumContinuity
    ? computePanelContinuityPreflights(allBlueprints, {
      strictEnvironmentLocationBinding: true,
      strictCharacterDnaBinding: true,
      strictPropVisualBinding: true,
    })
    : [];
  const continuityBlockers = strictPremiumContinuity
    ? continuityPreflightBlockingReasons(continuityPreflights)
    : [];
  const continuityPreflightOk = !strictPremiumContinuity || continuityBlockers.length === 0;
  if (!continuityPreflightOk) {
    console.error(
      `[estimate] continuity_preflight_failed chapterId=${targetChapter?.id ?? "new"} `
      + `blockers=${JSON.stringify(continuityBlockers)}`,
    );
  }

  const contractQa = runPremiumPlanContractQa({ blueprints: allBlueprints });
  if (!contractQa.ok) {
    console.warn(
      `[estimate] contract_qa_failed chapterId=${targetChapter?.id ?? "new"} `
      + `blocking=${JSON.stringify(contractQa.blocking)} metrics=${JSON.stringify(contractQa.metrics)}`,
    );
  }

  // NB : characterRefResolutionOk N'EST PLUS un gate de readiness. Les libellés
  // génériques que le LLM invente ("La créature") sont rendus par l'entity-brain
  // au moment de l'image — les compter comme bloquants empêchait la génération
  // alors que le plan est par ailleurs valide. On garde l'info en warning.
  const planReady =
    panelCountStatus === "ok"
    && canonicalPlan.qa.valid
    && finalStructuralQa.valid
    && continuityPreflightOk
    && contractQa.ok;

  const productionPlanPagesCount = (() => {
    const pages = (productionPlan as { pages?: unknown }).pages;
    return Array.isArray(pages) ? pages.length : 0;
  })();
  console.log(
    `[estimate] estimate_generated projectId=${projectId} chapterId=${targetChapter?.id ?? "new"} `
    + `chapterNumber=${targetChapterNumber} estimateMode=${estimateMode} `
    + `beatsCount=${productionOutline.beats.length} productionPlanPages=${productionPlanPagesCount} `
    + `rawBlueprints=${rawBlueprints.length} blueprints=${allBlueprints.length} `
    + `canonical_qa_valid=${canonicalPlan.qa.valid} final_structural_qa_valid=${finalStructuralQa.valid} `
    + `character_ref_resolution_ok=${characterRefResolutionOk} continuity_preflight_ok=${continuityPreflightOk} `
    + `enrichmentApplied=false targetRange=${PREMIUM_PANEL_RANGE.min}-${PREMIUM_PANEL_RANGE.max} planStatus=${panelCountStatus} `
    + `progressionOk=${progressionCheck.ok} progressionScore=${progressionCheck.progressionScore.toFixed(2)} ready=${planReady}`,
  );

  // 11. Réponse finale.
  const stack = getGenerationStackStatus();
  const premiumOnly = isPipelineV3PremiumOnlyEnabled();
  const { aiReadiness, premiumBlockingReasons } = computePremiumAiReadiness({ stack, premiumOnly });

  const contextDigest = [
    context.project.title,
    `ch${targetChapterNumber}`,
    context.recentChapters?.length ?? 0,
    context.characters?.length ?? 0,
  ].join("|");

  return NextResponse.json(
    buildEstimateResponse({
      estimateMode,
      targetChapter: targetChapter
        ? { id: targetChapter.id, status: targetChapter.status ?? null }
        : null,
      targetChapterNumber,
      requestedChapterNumber: body.chapterNumber ?? null,
      estimatedTokens,
      creativityControls: body.creativityControls,
      estimateContextExtras: {
        contextDigest,
        aiReadiness,
        premiumBlockingReasons,
        canonicalPlan: {
          format: canonicalPlan.format,
          beatCount: canonicalPlan.beatCount,
          metrics: canonicalPlan.metrics,
          rhythm: canonicalPlan.rhythm,
          qa: canonicalPlan.qa,
        },
        continuityPreflight: {
          ok: continuityPreflightOk,
          blockers: continuityBlockers,
          panelCount: continuityPreflights.length,
        },
        characterRefResolutionOk,
        finalStructuralQaValid: finalStructuralQa.valid,
        planReady,
      },
      contextPreview: {
        recentChapters: context.recentChapters,
        retrievedDocs: context.retrievedDocs,
        arcs: context.arcs,
        characters: context.characters,
      },
      bundle: {
        plotOptions: bundle.plotOptions,
        creativeDirection: bundle.creativeDirection,
        outline: { chapter_goal: bundle.outline.chapter_goal, cliffhanger: bundle.outline.cliffhanger },
      },
      previewVersion,
      previewBeats,
      productionOutline,
      productionPlan,
      rawBlueprintCount: rawBlueprints.length,
      enrichedBlueprintCount: allBlueprints.length,
      enrichmentApplied: false,
      enrichmentAddedCount: 0,
      chapterMinimumImages,
      panelCountStatus,
      progressionCheck: {
        ok: progressionCheck.ok,
        issues: progressionCheck.issues,
        progressionScore: progressionCheck.progressionScore,
      },
      characterRefsUnresolved,
      finalStructuralQa: {
        valid: finalStructuralQa.valid,
        errors: finalStructuralQa.errors,
        warnings: finalStructuralQa.warnings,
        details: finalStructuralQa.details,
      },
      finalStructuralQaMetrics: structuralFromPersistedBlueprints.plan.metrics,
      continuityBlockers,
      continuityPanelCount: continuityPreflights.length,
      contractQa: {
        ok: contractQa.ok,
        blocking: contractQa.blocking,
        warnings: contractQa.warnings,
        repairable: contractQa.repairable,
        metrics: contractQa.metrics,
      },
    }),
  );
}
