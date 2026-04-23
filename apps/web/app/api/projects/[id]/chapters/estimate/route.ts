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
} from "@manga-ai-studio/ai";
import {
  PREMIUM_PANEL_RANGE,
  classifyPremiumPanelCount,
  type PanelBlueprintPremium,
} from "@manga-ai-studio/core";
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

type EnrichmentVariant = {
  shotType: PanelBlueprintPremium["shotType"];
  subjectFocus: PanelBlueprintPremium["subjectFocus"];
  cameraAngle: PanelBlueprintPremium["cameraAngle"];
  cutawayType: PanelBlueprintPremium["cutawayType"];
  purpose: PanelBlueprintPremium["purpose"];
};

// Densification DÉTERMINISTE (pas de random, pas de legacy padding).
// Objectif: quand le découpage natif sort à ~50–65 panels, on remonte à 70–75
// en ajoutant des cases de grammaire visuelle dérivées des beats existants
// (cutaways / reactions / inserts / crowd / aftermath), réparties round-robin.
const DENSIFY_VARIANTS: readonly EnrichmentVariant[] = [
  {
    shotType: "wide",
    subjectFocus: "environment",
    cameraAngle: "eye_level",
    cutawayType: "environment",
    purpose: "environment_cutaway — ancrage décor",
  },
  {
    shotType: "medium",
    subjectFocus: "reaction",
    cameraAngle: "eye_level",
    cutawayType: "reaction",
    purpose: "reaction_closeup — respiration émotionnelle",
  },
  {
    shotType: "closeup",
    subjectFocus: "prop",
    cameraAngle: "eye_level",
    cutawayType: "prop_insert",
    purpose: "prop_insert — indice / objet",
  },
  {
    shotType: "wide",
    subjectFocus: "npc",
    cameraAngle: "eye_level",
    cutawayType: "crowd",
    purpose: "npc_context — foule / pression",
  },
  {
    shotType: "wide",
    subjectFocus: "aftermath",
    cameraAngle: "high_angle",
    cutawayType: "aftermath",
    purpose: "aftermath — conséquence visible",
  },
  {
    shotType: "over_shoulder",
    subjectFocus: "duo",
    cameraAngle: "eye_level",
    cutawayType: "none",
    purpose: "over_shoulder — tension / réaction",
  },
] as const;

function isNonHumanFocus(focus: PanelBlueprintPremium["subjectFocus"]): boolean {
  return focus === "environment" || focus === "prop" || focus === "aftermath";
}

function makeDensifiedBlueprint(input: {
  seed: PanelBlueprintPremium;
  globalIndex: number;
  variant: EnrichmentVariant;
}): PanelBlueprintPremium {
  const { seed, globalIndex, variant } = input;
  const nonHuman = isNonHumanFocus(variant.subjectFocus);

  return {
    ...seed,
    panelId: `panel_${seed.beatId}_densify_${globalIndex + 1}`,
    panelIndex: globalIndex,
    panelNumber: globalIndex + 1,
    shotType: variant.shotType,
    subjectFocus: variant.subjectFocus,
    cameraAngle: variant.cameraAngle,
    cutawayType: variant.cutawayType,
    purpose: variant.purpose,
    heroCenterAllowed: false,
    mustShowEnemy: false,
    requiredNpcCount: variant.subjectFocus === "npc" ? Math.max(1, seed.requiredNpcCount) : 0,
    dialogueCarrier: "narration",
    dialogueLinesAnchored: 0,
    speakerAnchorCharacterId: null,
    speakerAnchorCharacterName: null,
    mustShowCharacterIds: nonHuman ? [] : (seed.mustShowCharacterIds ?? []).slice(0, 1),
    mayShowCharacterIds: nonHuman ? [] : (seed.mayShowCharacterIds ?? []).slice(0, 2),
    requiredCharacters: nonHuman ? [] : (seed.requiredCharacters ?? []).slice(0, 1),
    requiredCharacterIds: nonHuman ? [] : (seed.requiredCharacterIds ?? []).slice(0, 1),
    notes: [...(seed.notes ?? []), "densified_to_meet_premium_range"],
    contractualCritical: false,
    criticality: "low",
  };
}

function renumberBlueprintsGlobally(blueprints: PanelBlueprintPremium[]): PanelBlueprintPremium[] {
  return blueprints.map((bp, idx) => ({
    ...bp,
    panelIndex: idx,
    panelNumber: idx + 1,
    pageNumber: bp.pageNumber ?? 1,
  }));
}

function densifyBlueprintsToPremiumRange(input: {
  beats: Array<{ beatId: string; blueprints: PanelBlueprintPremium[] }>;
  minPanels: number;
  maxPanels: number;
}): { blueprints: PanelBlueprintPremium[]; added: number; removed: number } {
  const beats = input.beats.map((b) => ({ ...b, blueprints: [...b.blueprints] }));
  let all = beats.flatMap((b) => b.blueprints);
  if (all.length === 0) return { blueprints: [], added: 0, removed: 0 };

  let added = 0;
  let removed = 0;

  if (all.length < input.minPanels) {
    const missing = input.minPanels - all.length;
    for (let i = 0; i < missing; i += 1) {
      const beat = beats[i % beats.length]!;
      const seed =
        (beat.blueprints[beat.blueprints.length - 1] ?? all[all.length - 1]) as PanelBlueprintPremium;
      const variant = DENSIFY_VARIANTS[i % DENSIFY_VARIANTS.length]!;
      const densified = makeDensifiedBlueprint({
        seed,
        globalIndex: all.length,
        variant,
      });
      beat.blueprints.push(densified);
      all.push(densified);
      added += 1;
    }
  } else if (all.length > input.maxPanels) {
    const removable = (bp: PanelBlueprintPremium) =>
      bp.contractualCritical !== true && bp.criticality !== "critical" && bp.criticality !== "high";

    while (all.length > input.maxPanels) {
      let didRemove = false;
      for (let i = beats.length - 1; i >= 0; i -= 1) {
        const beat = beats[i]!;
        const reverseIdx = [...beat.blueprints].reverse().findIndex(removable);
        if (reverseIdx === -1) continue;
        const removeAt = beat.blueprints.length - 1 - reverseIdx;
        beat.blueprints.splice(removeAt, 1);
        all = beats.flatMap((b) => b.blueprints);
        removed += 1;
        didRemove = true;
        break;
      }
      if (!didRemove) break;
    }
  }

  return {
    blueprints: renumberBlueprintsGlobally(all),
    added,
    removed,
  };
}

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

  // P1 — L'ENRICHISSEMENT LEGACY EST SUPPRIMÉ DU CHEMIN PREMIUM.
  // Avant : on comptait le nombre natif de blueprints (rawBlueprints) puis
  // on appelait `expandBlueprintsToMinimum` pour boucher jusqu'à 75 avec
  // des panels cutaway/reaction/prop clonés. Résultat : des "faux panels"
  // qui polluaient le routing et fabriquaient des prompts contradictoires.
  //
  // P8 — CONTRAT COUNT STRICT (mission de refonte premium).
  //
  // La range produit est 70-75 NATIF. Un storyboard qui sort 56 panels est
  // un BUG éditorial. L'estimate doit marquer le plan comme "incomplete"
  // pour que le studio refuse de le lancer : plus de passage silencieux
  // via `ready_below_target`.
  //
  //   - raw === 0                → planStatus = "incomplete" (plan vide)
  //   - raw < 70                 → planStatus = "incomplete" (sous la range)
  //   - 70 ≤ raw ≤ 75            → planStatus = "ready"
  //   - raw > 75                 → planStatus = "incomplete" (sur la range)
  // FIX — densification DÉTERMINISTE (pas de random) pour atteindre 70–75.
  // On ne “bricole” pas les prompts : on ajuste le contrat panelBlueprints,
  // ce qui nourrit ensuite shotPlan/focusBudget et le launch.
  const densified = densifyBlueprintsToPremiumRange({
    beats: enrichedBeats.map((b) => ({ beatId: b.beatId, blueprints: b._blueprints })),
    minPanels: PREMIUM_PANEL_RANGE.min,
    maxPanels: PREMIUM_PANEL_RANGE.max,
  });
  const allBlueprints = densified.blueprints;
  const enrichmentApplied = densified.added > 0 || densified.removed > 0;
  const enrichmentCount = densified.added - densified.removed;
  const panelCountStatus = classifyPremiumPanelCount(allBlueprints.length);
  const chapterMinimumImages = PREMIUM_PANEL_RANGE.min;
  const isEmptyPlan = allBlueprints.length === 0;
  const isBelowTargetRange = panelCountStatus === "under_min";
  const isOverTargetRange = panelCountStatus === "over_max";

  if (isBelowTargetRange) {
    console.error(
      `[estimate] below_target_range raw=${rawBlueprints.length} required_range=${PREMIUM_PANEL_RANGE.min}-${PREMIUM_PANEL_RANGE.max} chapterId=${targetChapter?.id ?? "new"} — BLOQUÉ (storyboard natif sous la range premium)`,
    );
  }
  if (isOverTargetRange) {
    console.error(
      `[estimate] over_target_range raw=${rawBlueprints.length} required_range=${PREMIUM_PANEL_RANGE.min}-${PREMIUM_PANEL_RANGE.max} chapterId=${targetChapter?.id ?? "new"} — BLOQUÉ (compactage éditorial requis)`,
    );
  }
  if (isEmptyPlan) {
    console.error(
      `[estimate] empty_plan chapterId=${targetChapter?.id ?? "new"} — aucun blueprint natif, génération bloquée`,
    );
  }

  console.log(
    `[estimate] blueprint_quality chapterId=${targetChapter?.id ?? "new"} ` +
    `raw=${rawBlueprints.length} enriched=${allBlueprints.length} ` +
    `target_range=${PREMIUM_PANEL_RANGE.min}-${PREMIUM_PANEL_RANGE.max} ` +
    `status=${panelCountStatus}`,
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
    `rawBlueprints=${rawBlueprints.length} blueprints=${allBlueprints.length} enrichmentApplied=${enrichmentApplied} targetRange=${PREMIUM_PANEL_RANGE.min}-${PREMIUM_PANEL_RANGE.max} planStatus=${panelCountStatus} ` +
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
    // P8 — planStatus STRICT : tout ce qui n'est pas dans la range premium
    // 70-75 (PREMIUM_PANEL_RANGE) est marqué `incomplete` et bloque le launch.
    planStatus: panelCountStatus === "ok" ? "ready" : "incomplete",
    rawBlueprintCount: rawBlueprints.length,
    enrichedBlueprintCount: allBlueprints.length,
    enrichmentApplied,
    enrichmentAddedCount: enrichmentCount,
    minimumImages: chapterMinimumImages,
    premiumPanelRange: PREMIUM_PANEL_RANGE,
    panelCountStatus,
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
