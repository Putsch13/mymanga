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
} from "@manga-ai-studio/ai";
import { estimateChapterTextTokensFromRules } from "@manga-ai-studio/billing";
import { buildApprovedOutlineVersion, buildProductionPlanFromOutline } from "@manga-ai-studio/core";
import { prisma } from "@manga-ai-studio/db";
import { buildProjectContext } from "@manga-ai-studio/memory";
import { getAppUser } from "@/lib/auth/get-app-user";
import { notFound, unauthorized } from "@/lib/api-response";
import { getOwnedProject } from "@/lib/ownership";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  userIntent: z.string().min(3),
  chapterId: z.string().optional(),
  chapterNumber: z.number().int().positive().optional(),
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
  const previewBeats = bundle.outline.beats.slice(0, 5).map((beat) => ({
    id: beat.id,
    summary: beat.summary,
    characters: beat.characters,
    location: beat.location,
    pageRole: beat.pageRole ?? "escalation",
    turn: beat.turn ?? beat.purpose,
    emotionalDelta: beat.emotionalDelta ?? 0,
    structuredBeat: beat.structuredBeat ?? null,
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

  const allBlueprints = enrichedBeats.flatMap((b) => b._blueprints);
  const focusBudget = computeChapterFocusBudget(allBlueprints);
  const premiumReadinessScore = computePremiumReadinessScore(allBlueprints);

  const productionOutline = {
    source: "estimated" as const,
    chapterGoal: bundle.outline.chapter_goal,
    cliffhanger: bundle.outline.cliffhanger,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    beats: enrichedBeats.map(({ _blueprints: _b, ...beat }) => beat),
  };

  const productionPlan = {
    ...buildProductionPlanFromOutline(productionOutline),
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
  };

  const contextDigest = [
    context.project.title,
    `ch${targetChapterNumber}`,
    context.recentChapters?.length ?? 0,
    context.characters?.length ?? 0,
  ].join("|");

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
    planPresentation: {
      editorialLabel: "Résumé du chapitre (5 grands temps)",
      productionLabel: "Découpage détaillé pour la génération",
      editorialBeatCount: previewBeats.length,
      productionBeatCount: productionOutline.beats.length,
      explanation: "Le résumé macro sert à valider l'histoire. Le découpage détaillé sert à générer les panels.",
    },
  });
}
