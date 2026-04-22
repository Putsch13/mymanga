import { NextResponse } from "next/server";
import { z } from "zod";
import {
  generateChapterBundle,
  inferNarrativeFactsFromBeat,
  inferRequiredPropsFromBeat,
  buildPanelBlueprintsFromBeat,
  computeChapterFocusBudget,
  computePremiumReadinessScore,
  enrichNarrativeFactsWithLLM,
  mergeNarrativeFacts,
  buildChapterShotPlan,
  expandBlueprintsToMinimum,
} from "@manga-ai-studio/ai";
import { estimateChapterTextTokensFromRules } from "@manga-ai-studio/billing";
import { buildApprovedOutlineVersion, buildProductionPlanFromOutline } from "@manga-ai-studio/core";
import { prisma } from "@manga-ai-studio/db";
import { buildProjectContext } from "@manga-ai-studio/memory";
import { getAppUser } from "@/lib/auth/get-app-user";
import { notFound, unauthorized } from "@/lib/api-response";
import { getOwnedProject } from "@/lib/ownership";
import {
  validateNarrativeProgression,
  selectEditorialPreviewBeats,
  type ProductionBeatLike,
} from "@/lib/outline-dedup";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  userIntent: z.string().min(3),
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
  const targetChapter = body.chapterId
    ? await prisma.chapter.findFirst({
        where: { id: body.chapterId, projectId },
        select: {
          id: true,
          chapterNumber: true,
          title: true,
          status: true,
          // P2.1bis — on a besoin du minimum du chapitre pour garantir que
          // le contrat sort avec panelBlueprints.length >= minimumImages.
          // Sans ça, la régénération produit ~30-55 panels alors que le
          // chapitre en demande 75+ et le studio bloque immédiatement.
          minimumImages: true,
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
  const estimateMode = targetChapter ? "existing_chapter" : "new_chapter";
  console.log(
    `[estimate] estimate_started projectId=${projectId} chapterId=${targetChapter?.id ?? "new"} ` +
    `chapterNumber=${targetChapterNumber} estimateMode=${estimateMode}`,
  );
  const context = await buildProjectContext(prisma, projectId, body.userIntent, {
    focusCharacterIds: body.focusCharacterIds,
    targetChapterId: targetChapter?.id ?? null,
    targetChapterNumber,
  });
  if (!context) return notFound();
  const bundle = await generateChapterBundle({
    chapterId: targetChapter?.id,
    chapterNumber: targetChapterNumber,
    chapterTitle: targetChapter?.title ?? null,
    userIntent: body.userIntent,
    selectedPlotLabel: body.selectedPlotLabel,
    creativityControls: body.creativityControls,
    context,
  });
  // Sélectionner les 5 tournants narratifs représentatifs (pas slice(0,5))
  const allBundleBeats = bundle.outline.beats.map((beat) => ({
    id: beat.id,
    summary: beat.summary,
    characters: beat.characters,
    location: beat.location,
    pageRole: beat.pageRole ?? "escalation",
    turn: beat.turn ?? beat.purpose,
    emotionalDelta: beat.emotionalDelta ?? 0,
    structuredBeat: beat.structuredBeat ?? null,
  }));
  const editorialPreviewBeats = selectEditorialPreviewBeats(
    allBundleBeats as ProductionBeatLike[],
  );
  const previewBeats = editorialPreviewBeats.map((b) => ({
    id: (b as typeof allBundleBeats[number]).id,
    summary: b.summary,
    characters: (b as typeof allBundleBeats[number]).characters,
    location: (b as typeof allBundleBeats[number]).location,
    pageRole: (b as typeof allBundleBeats[number]).pageRole,
    turn: (b as typeof allBundleBeats[number]).turn,
    emotionalDelta: (b as typeof allBundleBeats[number]).emotionalDelta,
    structuredBeat: (b as typeof allBundleBeats[number]).structuredBeat,
  }));
  const previewVersion = buildApprovedOutlineVersion({
    summary: bundle.outline.chapter_goal,
    cliffhanger: bundle.outline.cliffhanger,
    beats: bundle.outline.beats.map((beat) => ({
      id: beat.id,
      summary: beat.summary,
      characters: beat.characters,
      location: beat.location,
      pageRole: beat.pageRole ?? "escalation",
      turn: beat.turn ?? beat.purpose,
      emotionalDelta: beat.emotionalDelta ?? 0,
      structuredBeat: beat.structuredBeat ?? null,
    })),
    source: "estimate_preview",
  });
  const heroCharacterId = context.characters?.find((c) => c.roleType === "MAIN_CHARACTER")?.id ?? null;
  const universeContext = {
    projectGenre: context.project.primaryGenre ?? null,
    projectTone: context.project.tone ?? null,
    heroCharacterId,
  };
  const narrativeContext = {
    projectGenre: context.project.primaryGenre ?? null,
    projectTone: context.project.tone ?? null,
    heroCharacterId,
    recentContinuityEvents: context.recentContinuityEvents?.map((e) => ({
      eventType: e.eventType,
      summary: e.summary,
      entities: (e.entities && typeof e.entities === "object" && !Array.isArray(e.entities))
        ? (e.entities as { objectsGained?: string[]; objectsLost?: string[]; locationChange?: string })
        : undefined,
    })),
  };

  // Build production beats with narrative intelligence (3-layer pipeline)
  const enrichedBeats = await Promise.all(bundle.outline.beats.map(async (beat) => {
    const productionBeat = {
      beatId: beat.id,
      summary: beat.summary,
      narrativeFunction: beat.pageRole ?? beat.purpose,
      whyThisBeatExists: beat.summary,
      dramaticChange: beat.turn ?? beat.purpose,
      involvedCharacters: beat.characters,
      activeCanonConstraints: [] as string[],
      environmentContext: [beat.location],
      visualPriority: "high" as const,
      estimatedPanels: 4,
      criticality: (beat.pageRole === "cliffhanger" || beat.pageRole === "revelation" ? "critical" : "medium") as
        | "critical"
        | "medium",
      continuityDependencies: [] as string[],
      infoGained: null,
      emotionProduced: null,
      indispensabilityScore: 72,
      redundancyRisk: 18,
    };

    // Couche 1+2 : heuristiques + analyse sémantique (synchrone)
    const heuristicFacts = inferNarrativeFactsFromBeat(productionBeat, narrativeContext);

    // Couche 3 : enrichissement LLM async (si OPENAI_API_KEY disponible)
    // Enrichit les faits manqués par les patterns (formes passives, idiomes, etc.)
    const llmFacts = await enrichNarrativeFactsWithLLM(productionBeat, heuristicFacts, narrativeContext);
    const narrativeFacts = mergeNarrativeFacts(heuristicFacts, llmFacts);

    const requiredProps = inferRequiredPropsFromBeat(productionBeat, narrativeFacts, universeContext);

    // Build panel blueprints to get real panel count
    const blueprints = buildPanelBlueprintsFromBeat(productionBeat, narrativeFacts, requiredProps, {
      heroCharacterId,
      projectGenre: context.project.primaryGenre ?? null,
      projectTone: context.project.tone ?? null,
    });

    return {
      ...productionBeat,
      estimatedPanels: blueprints.length > 0 ? blueprints.length : 4,
      narrativeFacts,
      requiredProps,
      _blueprints: blueprints,
    };
  }));

  const rawBlueprints = enrichedBeats.flatMap((b) => b._blueprints);

  // AUDIT v2 — le nombre de blueprints narratifs s'adapte à la matière (un
  // chapitre produit naturellement entre 30 et 60 beats-panels), mais le
  // contrat du produit garantit `minimumImages` images à rendre. On applique
  // donc l'enrichissement narratif (plans de coupe, reactions, inserts,
  // environment shots dérivés des beats existants via
  // `expandBlueprintsToMinimum`). Chaque blueprint produit ensuite son propre
  // prompt → fal, donc les images sont bien différenciées (hero, combat,
  // plan de coupe…).
  //
  // Invariants audit :
  //   - rawBlueprintCount = matière narrative brute (visible dans l'UI)
  //   - enrichedBlueprintCount = images à rendre (>= minimum si la matière
  //     narrative fournit au moins 1 beat exploitable)
  //   - planStatus = "incomplete" uniquement si aucun blueprint exploitable
  //     après enrichissement (cas hard : outline vide)
  //   - enrichmentApplied exposé explicitement pour que le studio puisse
  //     l'afficher (plus de "réparation silencieuse")
  const chapterMinimumImages =
    typeof targetChapter?.minimumImages === "number" && targetChapter.minimumImages > 0
      ? targetChapter.minimumImages
      : 75;

  const allBlueprints = expandBlueprintsToMinimum(rawBlueprints, chapterMinimumImages);
  const enrichmentApplied = allBlueprints.length > rawBlueprints.length;
  const enrichmentCount = allBlueprints.length - rawBlueprints.length;
  const isIncompletePlan = allBlueprints.length < chapterMinimumImages;

  if (isIncompletePlan) {
    console.warn(
      `[estimate] incomplete_plan raw=${rawBlueprints.length} enriched=${allBlueprints.length} ` +
      `minimum=${chapterMinimumImages} chapterId=${targetChapter?.id ?? "new"}`,
    );
  }

  if (enrichmentApplied) {
    console.log(
      `[estimate] enrichment_applied chapterId=${targetChapter?.id ?? "new"} ` +
      `raw=${rawBlueprints.length} enriched=${allBlueprints.length} added=${enrichmentCount} ` +
      `minimum=${chapterMinimumImages}`,
    );
  }

  console.log(
    `[estimate] blueprint_quality chapterId=${targetChapter?.id ?? "new"} ` +
    `raw=${rawBlueprints.length} enriched=${allBlueprints.length} ` +
    `minimum=${chapterMinimumImages} enrichmentApplied=${enrichmentApplied} ` +
    `status=${isIncompletePlan ? "incomplete" : "ready"}`,
  );
  const focusBudget = computeChapterFocusBudget(allBlueprints);
  const premiumReadinessScore = computePremiumReadinessScore(allBlueprints);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const rawProductionBeats = enrichedBeats.map(({ _blueprints: _b, ...beat }) => beat);

  // Validation anti-répétition narrative
  const progressionCheck = validateNarrativeProgression(rawProductionBeats as ProductionBeatLike[]);
  if (!progressionCheck.ok) {
    console.warn(
      `[estimate] plan_dedup_applied chapterId=${targetChapter?.id ?? "new"} ` +
      `issues=${progressionCheck.issues.length} score=${progressionCheck.progressionScore.toFixed(2)}`,
    );
  }

  const productionOutline = {
    source: "estimated" as const,
    chapterGoal: bundle.outline.chapter_goal,
    cliffhanger: bundle.outline.cliffhanger,
    beats: rawProductionBeats,
  };

  const productionPlan = {
    // P2.1bis — on propage le `minimumImages` du chapitre dans le productionPlan
    // construit, sinon `buildProductionPlanFromOutline` retombe sur son défaut
    // interne (75) et le snapshot peut diverger de la colonne Chapter.minimumImages.
    ...buildProductionPlanFromOutline(productionOutline, { minimumImages: chapterMinimumImages }),
    panelBlueprints: allBlueprints,
    focusDistribution: focusBudget.focusDistribution,
    shotDistribution: focusBudget.shotDistribution,
    propCoverage: {
      covered: allBlueprints.flatMap((bp) => bp.requiredProps.map((p) => p.canonicalName)),
      missing: focusBudget.violations
        .filter((v) => v.type === "missing_prop_insert")
        .map((v) => v.message),
    },
    enemyCoverage: {
      panelCount: focusBudget.enemyFocusPanels,
      beatsCovered: enrichedBeats
        .filter((b) => b.narrativeFacts?.some((f) => f.type === "enemy_presence"))
        .map((b) => b.beatId),
    },
    npcCoverage: {
      panelCount: focusBudget.npcPanels,
      avgNpcCount:
        allBlueprints.length > 0
          ? allBlueprints.reduce((sum, bp) => sum + bp.requiredNpcCount, 0) / allBlueprints.length
          : 0,
    },
    cutawayCoverage: {
      count: focusBudget.cutawayCount,
      ratio: focusBudget.cutawayRatio,
    },
    dialogueAnchorCoverage: {
      anchored: allBlueprints.filter(
        (bp) => bp.dialogueCarrier === "speaker_visible" && bp.speakerAnchorCharacterId
      ).length,
      floating: allBlueprints.filter(
        (bp) => bp.dialogueCarrier === "speaker_visible" && !bp.speakerAnchorCharacterId
      ).length,
    },
    heroCenterRatio: focusBudget.heroCenterRatio,
    premiumReadinessScore,
    // P1.1 : on persiste l'intégralité du focusBudget (compteurs + violations)
    // pour que launch/route.ts puisse bloquer les chapitres trop héros-centrés
    // ou sans plan de coupe contractuel.
    focusBudget,
    // Sprint B — Shot plan narratif lisible avant génération. Contient
    // entries (1 ligne par panel), distribution (ratios, unique shots, cutaways),
    // reliability (launchAllowed, blockers, warnings) et humanReadable (texte UI).
    shotPlan: buildChapterShotPlan({
      projectTitle: context.project.title ?? null,
      chapterTitle: targetChapter?.title ?? null,
      blueprints: allBlueprints,
    }),
  };

  const contextDigest = [
    context.project.title,
    `ch${targetChapterNumber}`,
    context.recentChapters?.length ?? 0,
    context.characters?.length ?? 0,
  ].join("|");

  console.log(
    `[estimate] estimate_generated projectId=${projectId} chapterId=${targetChapter?.id ?? "new"} ` +
    `chapterNumber=${targetChapterNumber} estimateMode=${estimateMode} ` +
    `beatsCount=${productionOutline.beats.length} ` +
    `productionPlanPages=${Array.isArray((productionPlan as Record<string, unknown>).pages) ? ((productionPlan as Record<string, unknown>).pages as unknown[]).length : 0} ` +
    `rawBlueprints=${rawBlueprints.length} blueprints=${allBlueprints.length} enrichmentApplied=${enrichmentApplied} minimumImages=${chapterMinimumImages} planStatus=${isIncompletePlan ? "incomplete" : "ready"} ` +
    `progressionOk=${progressionCheck.ok} progressionScore=${progressionCheck.progressionScore.toFixed(2)}`,
  );

  return NextResponse.json({
    estimateMode,
    targetChapter: {
      id: targetChapter?.id ?? null,
      chapterNumber: targetChapterNumber,
      requestedChapterNumber: body.chapterNumber ?? null,
      status: targetChapter?.status ?? null,
    },
    estimatedTokens,
    creativityControls: body.creativityControls ?? null,
    estimateContext: {
      targetChapterId: targetChapter?.id ?? null,
      targetChapterNumber,
      contextDigest,
      creativityControlsUsed: body.creativityControls ?? null,
      estimateSource: estimateMode,
      estimatedAt: new Date().toISOString(),
    },
    contextPreview: {
      recentChapters: context.recentChapters,
      retrievedDocs: context.retrievedDocs,
      arcs: context.arcs,
      characters: context.characters,
    },
    plotOptions: bundle.plotOptions,
    creativeDirection: bundle.creativeDirection,
    outlinePreview: {
      summary: bundle.outline.chapter_goal,
      cliffhanger: bundle.outline.cliffhanger,
      approvalVersion: previewVersion,
      beats: previewBeats,
    },
    editorialOutline: {
      summary: bundle.outline.chapter_goal,
      validationNotes: [],
      beats: previewBeats.map((beat, index) => ({
        beatId: beat.id,
        label: `Bloc ${index + 1}`,
        summary: beat.summary,
        narrativePurpose: beat.pageRole,
        dramaticShift: beat.turn,
        involvedCharacters: beat.characters,
      })),
    },
    productionOutline,
    productionPlan,
    planStatus: isIncompletePlan ? "incomplete" : "ready",
    rawBlueprintCount: rawBlueprints.length,
    enrichedBlueprintCount: allBlueprints.length,
    enrichmentApplied,
    enrichmentAddedCount: enrichmentCount,
    minimumImages: chapterMinimumImages,
    planPresentation: {
      editorialLabel: "Résumé du chapitre (5 grands temps)",
      productionLabel: "Découpage détaillé pour la génération",
      editorialBeatCount: previewBeats.length,
      productionBeatCount: productionOutline.beats.length,
      explanation: "Le résumé macro sert à valider l'histoire. Le découpage détaillé sert à générer les panels.",
    },
    planWarnings: progressionCheck.ok ? [] : progressionCheck.issues,
    repairApplied: !progressionCheck.ok,
    repairReasons: progressionCheck.ok ? [] : progressionCheck.issues,
    progressionScore: progressionCheck.progressionScore,
  });
}
