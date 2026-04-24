/**
 * Service partagé de construction du contrat premium d'un chapitre.
 * Toute route qui a besoin de reconstruire le contrat premium doit appeler ce service.
 * Interdit de reconstruire un productionOutline minimaliste "pour dépanner" ailleurs.
 */

import {
  buildProductionPlanFromOutline,
  classifyPremiumPanelCount,
  densifyBlueprintsToPremiumRangeContract,
  PREMIUM_PANEL_RANGE,
} from "@manga-ai-studio/core";
import type { ApprovedChapterOutline, ProductionBeat } from "@manga-ai-studio/core";
import type { PanelBlueprintPremium, RequiredProp } from "@manga-ai-studio/core";
import { inferNarrativeFactsFromBeat, type NarrativeExtractionContext } from "./narrative-fact-extractor";
import { enrichNarrativeFactsWithLLM, mergeNarrativeFacts } from "./narrative-fact-llm-enricher";
import { inferRequiredPropsFromBeat } from "./prop-inference-engine";
import { buildPanelBlueprintsFromBeat, computeChapterFocusBudget, computePremiumReadinessScore } from "./panel-blueprint-builder";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BuildPremiumChapterContractInput {
  approvedOutline: ApprovedChapterOutline;
  heroCharacterId: string | null;
  projectGenre: string | null;
  projectTone: string | null;
  recentContinuityEvents?: Array<{
    eventType: string;
    summary: string | null;
    entities?: {
      objectsGained?: string[];
      objectsLost?: string[];
      locationChange?: string;
    };
  }>;
  /**
   * P2.1 — Budget minimum de panels pour ce chapitre. Permet au contrat
   * premium d'honorer le `Chapter.minimumImages` réel (défaut 75 dans le
   * schema Prisma) plutôt qu'une constante figée.
   *
   * Cause racine du bug "52 blueprints pour 75 minimum" historique :
   * `buildPremiumChapterContract` utilisait `MINIMUM_PREMIUM_PANELS = 75`
   * en dur. Un chapitre configuré avec `minimumImages > 75` (ou un plan
   * rebuilt dont `buildPanelBlueprintsFromBeat` sortait trop peu de panels
   * après filtrage) finissait avec un contrat sous le minimum — sans que le
   * builder s'en aperçoive. On remonte maintenant la contrainte au caller.
   */
  minimumPanels?: number;
}

export interface ObjectStateFrame {
  beatId: string;
  objectId: string;
  canonicalName: string;
  ownerCharacterId?: string;
  state:
    | "carried"
    | "equipped"
    | "drawn"
    | "used"
    | "thrown"
    | "dropped"
    | "broken"
    | "stored"
    | "visible_on_scene";
  visibility: "required" | "preferred" | "incidental" | "hidden";
}

export interface PremiumMeta {
  premiumReadinessScore: number;
  heroCenterRatio: number;
  cutawayCount: number;
  cutawayRatio: number;
  enemyFocusPanels: number;
  npcPanels: number;
  propCoverage: { covered: string[]; missing: string[] };
  enemyCoverage: { panelCount: number; beatsCovered: string[] };
  npcCoverage: { panelCount: number; avgNpcCount: number };
  cutawayCoverage: { count: number; ratio: number };
  dialogueAnchorCoverage: { anchored: number; floating: number };
  focusDistribution: Record<string, number>;
  shotDistribution: Record<string, number>;
}

export interface BuildPremiumChapterContractResult {
  productionOutline: {
    source: "premium_rebuilt";
    chapterGoal: string;
    cliffhanger: string;
    beats: Array<ProductionBeat & {
      narrativeFacts: ReturnType<typeof inferNarrativeFactsFromBeat>;
      requiredProps: RequiredProp[];
    }>;
  };
  productionPlan: ReturnType<typeof buildProductionPlanFromOutline> & {
    panelBlueprints: PanelBlueprintPremium[];
    focusDistribution: Record<string, number>;
    shotDistribution: Record<string, number>;
    propCoverage: { covered: string[]; missing: string[] };
    enemyCoverage: { panelCount: number; beatsCovered: string[] };
    npcCoverage: { panelCount: number; avgNpcCount: number };
    cutawayCoverage: { count: number; ratio: number };
    dialogueAnchorCoverage: { anchored: number; floating: number };
    heroCenterRatio: number;
    premiumReadinessScore: number;
    objectStateTimeline: ObjectStateFrame[];
  };
  panelBlueprints: PanelBlueprintPremium[];
  objectStateTimeline: ObjectStateFrame[];
  premiumMeta: PremiumMeta;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function deduceObjectState(
  prop: RequiredProp,
  narrativeFacts: ReturnType<typeof inferNarrativeFactsFromBeat>,
): ObjectStateFrame["state"] {
  const hasPropUsage = narrativeFacts.some((f) => f.type === "prop_usage");
  const hasAction = narrativeFacts.some((f) => f.type === "action");
  const hasThreat = narrativeFacts.some((f) => f.type === "threat");
  const hasMovement = narrativeFacts.some((f) => f.type === "movement");

  if (prop.visibilityMode === "used_in_action" || prop.visibilityMode === "in_hand") {
    if (hasThreat) return "drawn";
    if (hasPropUsage) return "used";
    if (hasAction) return "equipped";
    return "drawn";
  }
  if (prop.visibilityMode === "foreground_insert") {
    return "visible_on_scene";
  }
  if (hasMovement && (prop.narrativeRole === "threat" || prop.narrativeRole === "action_tool")) {
    return "thrown";
  }
  if (hasPropUsage) return "used";
  return "carried";
}

function buildObjectStateTimeline(
  enrichedBeats: Array<{
    beatId: string;
    narrativeFacts: ReturnType<typeof inferNarrativeFactsFromBeat>;
    requiredProps: RequiredProp[];
    involvedCharacters: string[];
  }>,
): ObjectStateFrame[] {
  const timeline: ObjectStateFrame[] = [];

  for (const beat of enrichedBeats) {
    for (const prop of beat.requiredProps) {
      const state = deduceObjectState(prop, beat.narrativeFacts);
      const visibility: ObjectStateFrame["visibility"] =
        prop.mustBeVisible ? "required"
        : prop.visibilityMode === "foreground_insert" ? "required"
        : prop.visibilityMode === "background_support" ? "preferred"
        : "incidental";

      timeline.push({
        beatId: beat.beatId,
        objectId: `${beat.beatId}:${prop.canonicalName}`,
        canonicalName: prop.canonicalName,
        ownerCharacterId: beat.involvedCharacters[0] ?? undefined,
        state,
        visibility,
      });
    }
  }

  return timeline;
}

// ─── Service principal ────────────────────────────────────────────────────────

/**
 * Reconstruit le contrat premium complet depuis un approvedOutline.
 * Produit un productionOutline enrichi (avec narrativeFacts + requiredProps),
 * un productionPlan avec panelBlueprints et toutes les métriques premium,
 * et une objectStateTimeline pour la continuité.
 */
export function buildPremiumChapterContract(
  input: BuildPremiumChapterContractInput,
): BuildPremiumChapterContractResult {
  const { approvedOutline, heroCharacterId, projectGenre, projectTone, recentContinuityEvents } = input;

  const narrativeContext = {
    projectGenre,
    projectTone,
    heroCharacterId,
    recentContinuityEvents,
  };
  const universeContext = {
    projectGenre,
    projectTone,
    heroCharacterId,
  };

  // Enrichir chaque beat avec narrative facts, props, et blueprints
  const enrichedBeats = approvedOutline.beats.map((beat) => {
    const productionBeat: ProductionBeat = {
      beatId: beat.id,
      summary: beat.summary,
      narrativeFunction: beat.pageRole ?? "escalation",
      whyThisBeatExists: beat.summary,
      dramaticChange: beat.turn ?? "",
      involvedCharacters: beat.characters ?? [],
      activeCanonConstraints: [],
      environmentContext: beat.location ? [beat.location] : [],
      visualPriority: "high" as const,
      estimatedPanels: 4,
      criticality: (
        beat.pageRole === "cliffhanger" || beat.pageRole === "revelation"
          ? "critical"
          : "medium"
      ) as "critical" | "medium",
      continuityDependencies: [],
      infoGained: null,
      emotionProduced: null,
      indispensabilityScore: 72,
      redundancyRisk: 18,
    };

    const narrativeFacts = inferNarrativeFactsFromBeat(productionBeat, narrativeContext);
    const requiredProps = inferRequiredPropsFromBeat(productionBeat, narrativeFacts, universeContext);
    const blueprints = buildPanelBlueprintsFromBeat(productionBeat, narrativeFacts, requiredProps, {
      heroCharacterId,
      projectGenre,
      projectTone,
    });

    return {
      ...productionBeat,
      estimatedPanels: blueprints.length > 0 ? blueprints.length : 4,
      narrativeFacts,
      requiredProps,
      _blueprints: blueprints,
    };
  });

  const minPanels = PREMIUM_PANEL_RANGE.min;
  const maxPanels = PREMIUM_PANEL_RANGE.max;

  // FIX — densification déterministe du contrat pour rester dans la range premium
  // sans “random padding” : on dérive des cutaways / réactions / inserts depuis
  // les beats existants et on répartit l'effort sur tous les beats.
  const densified = densifyBlueprintsToPremiumRangeContract({
    beats: enrichedBeats.map((b) => ({ beatId: b.beatId, _blueprints: b._blueprints })),
    minPanels,
    maxPanels,
  });
  const allBlueprints = densified.allBlueprints;
  const enrichedBeatsWithDensity = enrichedBeats.map((b) => {
    const nextBlueprints = densified.beats.find((x) => x.beatId === b.beatId)?._blueprints ?? b._blueprints;
    return {
      ...b,
      _blueprints: nextBlueprints,
      estimatedPanels: nextBlueprints.length > 0 ? nextBlueprints.length : b.estimatedPanels,
    };
  });

  const minimumPanels = typeof input.minimumPanels === "number" && input.minimumPanels > 0
    ? input.minimumPanels
    : minPanels;
  const panelCountStatus = classifyPremiumPanelCount(allBlueprints.length);
  console.log(
    `[premium-contract] native_panel_count=${allBlueprints.length} status=${panelCountStatus} required_range=${minPanels}-${maxPanels} minimumPanels=${minimumPanels}`,
  );
  const focusBudget = computeChapterFocusBudget(allBlueprints);
  const premiumReadinessScore = computePremiumReadinessScore(allBlueprints);

  const productionOutline = {
    source: "premium_rebuilt" as const,
    chapterGoal: approvedOutline.summary,
    cliffhanger: approvedOutline.cliffhanger,
    beats: enrichedBeatsWithDensity.map(({ _blueprints: _b, ...beat }) => beat),
  };

  const objectStateTimeline = buildObjectStateTimeline(
    enrichedBeatsWithDensity.map((b) => ({
      beatId: b.beatId,
      narrativeFacts: b.narrativeFacts,
      requiredProps: b.requiredProps,
      involvedCharacters: b.involvedCharacters,
    })),
  );

  const dialogueAnchorCoverage = {
    anchored: allBlueprints.filter(
      (bp) => bp.dialogueCarrier === "speaker_visible" && bp.speakerAnchorCharacterId,
    ).length,
    floating: allBlueprints.filter(
      (bp) => bp.dialogueCarrier === "speaker_visible" && !bp.speakerAnchorCharacterId,
    ).length,
  };

  const propCoverage = {
    covered: allBlueprints.flatMap((bp) => bp.requiredProps.map((p) => p.canonicalName)),
    missing: focusBudget.violations
      .filter((v) => v.type === "missing_prop_insert")
      .map((v) => v.message),
  };

  // P1.3 — Pour le comptage de couverture ennemi (affiché dans l'UI), inclure
  // les blueprints avec mustShowEnemy=true même si subjectFocus !== "enemy".
  // La validation stricte (violations) reste dans focusBudget.
  const enemyPanelCount = allBlueprints.filter(
    (bp) => bp.subjectFocus === "enemy" || bp.mustShowEnemy,
  ).length;

  const enemyCoverage = {
    panelCount: enemyPanelCount,
    beatsCovered: enrichedBeats
      .filter((b) => b.narrativeFacts.some((f) => f.type === "enemy_presence"))
      .map((b) => b.beatId),
  };

  const npcCoverage = {
    panelCount: focusBudget.npcPanels,
    avgNpcCount:
      allBlueprints.length > 0
        ? allBlueprints.reduce((sum, bp) => sum + bp.requiredNpcCount, 0) / allBlueprints.length
        : 0,
  };

  const cutawayCoverage = {
    count: focusBudget.cutawayCount,
    ratio: focusBudget.cutawayRatio,
  };

  const productionPlan = {
    ...buildProductionPlanFromOutline(productionOutline),
    panelBlueprints: allBlueprints,
    focusDistribution: focusBudget.focusDistribution,
    shotDistribution: focusBudget.shotDistribution,
    propCoverage,
    enemyCoverage,
    npcCoverage,
    cutawayCoverage,
    dialogueAnchorCoverage,
    heroCenterRatio: focusBudget.heroCenterRatio,
    premiumReadinessScore,
    objectStateTimeline,
  };

  const premiumMeta: PremiumMeta = {
    premiumReadinessScore,
    heroCenterRatio: focusBudget.heroCenterRatio,
    cutawayCount: focusBudget.cutawayCount,
    cutawayRatio: focusBudget.cutawayRatio,
    enemyFocusPanels: focusBudget.enemyFocusPanels,
    npcPanels: focusBudget.npcPanels,
    propCoverage,
    enemyCoverage,
    npcCoverage,
    cutawayCoverage,
    dialogueAnchorCoverage,
    focusDistribution: focusBudget.focusDistribution,
    shotDistribution: focusBudget.shotDistribution,
  };

  return {
    productionOutline,
    productionPlan,
    panelBlueprints: allBlueprints,
    objectStateTimeline,
    premiumMeta,
  };
}

/**
 * Version async de buildPremiumChapterContract avec enrichissement LLM.
 * Utilise la couche LLM pour détecter les faits narratifs que les patterns ratent
 * (formes passives, expressions idiomatiques, synonymes contextuels).
 *
 * Recommandé pour : estimate/route.ts, approved-outline/route.ts
 * La version synchrone reste disponible pour les contextes sans async.
 */
export async function buildPremiumChapterContractAsync(
  input: BuildPremiumChapterContractInput,
): Promise<BuildPremiumChapterContractResult> {
  const { approvedOutline, heroCharacterId, projectGenre, projectTone, recentContinuityEvents } = input;

  const narrativeContext: NarrativeExtractionContext = {
    projectGenre,
    projectTone,
    heroCharacterId,
    recentContinuityEvents,
  };
  const universeContext = { projectGenre, projectTone, heroCharacterId };

  // Enrichir chaque beat en parallèle avec LLM
  const enrichedBeats = await Promise.all(approvedOutline.beats.map(async (beat) => {
    const productionBeat: ProductionBeat = {
      beatId: beat.id,
      summary: beat.summary,
      narrativeFunction: beat.pageRole ?? "escalation",
      whyThisBeatExists: beat.summary,
      dramaticChange: beat.turn ?? "",
      involvedCharacters: beat.characters ?? [],
      activeCanonConstraints: [],
      environmentContext: beat.location ? [beat.location] : [],
      visualPriority: "high" as const,
      estimatedPanels: 4,
      criticality: (
        beat.pageRole === "cliffhanger" || beat.pageRole === "revelation"
          ? "critical" : "medium"
      ) as "critical" | "medium",
      continuityDependencies: [],
      infoGained: null,
      emotionProduced: null,
      indispensabilityScore: 72,
      redundancyRisk: 18,
    };

    // Couche 1+2 : heuristiques + sémantique
    const heuristicFacts = inferNarrativeFactsFromBeat(productionBeat, narrativeContext);
    // Couche 3 : LLM (fallback silencieux si indisponible)
    const llmFacts = await enrichNarrativeFactsWithLLM(productionBeat, heuristicFacts, narrativeContext);
    const narrativeFacts = mergeNarrativeFacts(heuristicFacts, llmFacts);

    const requiredProps = inferRequiredPropsFromBeat(productionBeat, narrativeFacts, universeContext);
    const blueprints = buildPanelBlueprintsFromBeat(productionBeat, narrativeFacts, requiredProps, {
      heroCharacterId,
      projectGenre,
      projectTone,
    });

    return {
      beatId: beat.id,
      narrativeFacts,
      requiredProps,
      involvedCharacters: beat.characters ?? [],
      blueprints,
    };
  }));

  // P0 — IMPORTANT: Reconstruire les blueprints avec les facts LLM, pas avec les facts sync.
  // Avant cette correction, l'async appelait buildPremiumChapterContract(input) qui recalculait
  // tout depuis zéro avec les heuristiques, puis on remplaçait seulement les narrativeFacts
  // dans le productionOutline. Résultat: les panelBlueprints n'utilisaient pas les LLM facts.

  const minPanels = PREMIUM_PANEL_RANGE.min;
  const maxPanels = PREMIUM_PANEL_RANGE.max;

  // Reconstruire les ProductionBeats enrichis avec les blueprints LLM
  const enrichedBeatsWithLLMBlueprints = enrichedBeats.map((beat, index) => {
    const originalBeat = approvedOutline.beats[index];
    const productionBeat: ProductionBeat = {
      beatId: beat.beatId,
      summary: originalBeat?.summary ?? "",
      narrativeFunction: originalBeat?.pageRole ?? "escalation",
      whyThisBeatExists: originalBeat?.summary ?? "",
      dramaticChange: originalBeat?.turn ?? "",
      involvedCharacters: beat.involvedCharacters,
      activeCanonConstraints: [],
      environmentContext: originalBeat?.location ? [originalBeat.location] : [],
      visualPriority: "high" as const,
      estimatedPanels: beat.blueprints.length > 0 ? beat.blueprints.length : 4,
      criticality: (
        originalBeat?.pageRole === "cliffhanger" || originalBeat?.pageRole === "revelation"
          ? "critical" : "medium"
      ) as "critical" | "medium",
      continuityDependencies: [],
      infoGained: null,
      emotionProduced: null,
      indispensabilityScore: 72,
      redundancyRisk: 18,
    };

    return {
      ...productionBeat,
      narrativeFacts: beat.narrativeFacts,
      requiredProps: beat.requiredProps,
      _blueprints: beat.blueprints,
    };
  });

  // Densification avec les blueprints LLM
  const densified = densifyBlueprintsToPremiumRangeContract({
    beats: enrichedBeatsWithLLMBlueprints.map((b) => ({ beatId: b.beatId, _blueprints: b._blueprints })),
    minPanels,
    maxPanels,
  });
  const allBlueprints = densified.allBlueprints;
  const enrichedBeatsWithDensity = enrichedBeatsWithLLMBlueprints.map((b) => {
    const nextBlueprints = densified.beats.find((x) => x.beatId === b.beatId)?._blueprints ?? b._blueprints;
    return {
      ...b,
      _blueprints: nextBlueprints,
      estimatedPanels: nextBlueprints.length > 0 ? nextBlueprints.length : b.estimatedPanels,
    };
  });

  const minimumPanels = typeof input.minimumPanels === "number" && input.minimumPanels > 0
    ? input.minimumPanels
    : minPanels;
  const panelCountStatus = classifyPremiumPanelCount(allBlueprints.length);
  console.log(
    `[premium-contract-async] native_panel_count=${allBlueprints.length} status=${panelCountStatus} required_range=${minPanels}-${maxPanels} minimumPanels=${minimumPanels}`,
  );
  const focusBudget = computeChapterFocusBudget(allBlueprints);
  const premiumReadinessScore = computePremiumReadinessScore(allBlueprints);

  const productionOutline = {
    source: "premium_rebuilt" as const,
    chapterGoal: approvedOutline.summary,
    cliffhanger: approvedOutline.cliffhanger,
    beats: enrichedBeatsWithDensity.map(({ _blueprints: _b, ...beat }) => beat),
  };

  const objectStateTimeline = buildObjectStateTimeline(
    enrichedBeatsWithDensity.map((b) => ({
      beatId: b.beatId,
      narrativeFacts: b.narrativeFacts,
      requiredProps: b.requiredProps,
      involvedCharacters: b.involvedCharacters,
    })),
  );

  const dialogueAnchorCoverage = {
    anchored: allBlueprints.filter(
      (bp) => bp.dialogueCarrier === "speaker_visible" && bp.speakerAnchorCharacterId,
    ).length,
    floating: allBlueprints.filter(
      (bp) => bp.dialogueCarrier === "speaker_visible" && !bp.speakerAnchorCharacterId,
    ).length,
  };

  const propCoverage = {
    covered: allBlueprints.flatMap((bp) => bp.requiredProps.map((p) => p.canonicalName)),
    missing: focusBudget.violations
      .filter((v) => v.type === "missing_prop_insert")
      .map((v) => v.message),
  };

  const enemyPanelCount = allBlueprints.filter(
    (bp) => bp.subjectFocus === "enemy" || bp.mustShowEnemy,
  ).length;

  const enemyCoverage = {
    panelCount: enemyPanelCount,
    beatsCovered: enrichedBeatsWithLLMBlueprints
      .filter((b) => b.narrativeFacts.some((f) => f.type === "enemy_presence"))
      .map((b) => b.beatId),
  };

  const npcCoverage = {
    panelCount: focusBudget.npcPanels,
    avgNpcCount:
      allBlueprints.length > 0
        ? allBlueprints.reduce((sum, bp) => sum + bp.requiredNpcCount, 0) / allBlueprints.length
        : 0,
  };

  const cutawayCoverage = {
    count: focusBudget.cutawayCount,
    ratio: focusBudget.cutawayRatio,
  };

  const productionPlan = {
    ...buildProductionPlanFromOutline(productionOutline),
    panelBlueprints: allBlueprints,
    focusDistribution: focusBudget.focusDistribution,
    shotDistribution: focusBudget.shotDistribution,
    propCoverage,
    enemyCoverage,
    npcCoverage,
    cutawayCoverage,
    dialogueAnchorCoverage,
    heroCenterRatio: focusBudget.heroCenterRatio,
    premiumReadinessScore,
    objectStateTimeline,
  };

  const premiumMeta: PremiumMeta = {
    premiumReadinessScore,
    heroCenterRatio: focusBudget.heroCenterRatio,
    cutawayCount: focusBudget.cutawayCount,
    cutawayRatio: focusBudget.cutawayRatio,
    enemyFocusPanels: focusBudget.enemyFocusPanels,
    npcPanels: focusBudget.npcPanels,
    propCoverage,
    enemyCoverage,
    npcCoverage,
    cutawayCoverage,
    dialogueAnchorCoverage,
    focusDistribution: focusBudget.focusDistribution,
    shotDistribution: focusBudget.shotDistribution,
  };

  return {
    productionOutline,
    productionPlan,
    panelBlueprints: allBlueprints,
    objectStateTimeline,
    premiumMeta,
  };
}
