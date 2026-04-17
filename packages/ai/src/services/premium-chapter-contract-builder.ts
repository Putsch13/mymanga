/**
 * Service partagé de construction du contrat premium d'un chapitre.
 * Toute route qui a besoin de reconstruire le contrat premium doit appeler ce service.
 * Interdit de reconstruire un productionOutline minimaliste "pour dépanner" ailleurs.
 */

import { buildProductionPlanFromOutline } from "@manga-ai-studio/core";
import type { ApprovedChapterOutline, ProductionBeat } from "@manga-ai-studio/core";
import type { PanelBlueprintPremium, RequiredProp } from "@manga-ai-studio/core";
import { inferNarrativeFactsFromBeat, type NarrativeExtractionContext } from "./narrative-fact-extractor";
import { enrichNarrativeFactsWithLLM, mergeNarrativeFacts } from "./narrative-fact-llm-enricher";
import { inferRequiredPropsFromBeat } from "./prop-inference-engine";
import { buildPanelBlueprintsFromBeat, computeChapterFocusBudget, computePremiumReadinessScore, expandBlueprintsToMinimum } from "./panel-blueprint-builder";

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

  const rawBlueprints = enrichedBeats.flatMap((b) => b._blueprints);
  // READ-PREMIUM : garantir un minimum de 75 panels par chapitre (valeur Chapter.minimumImages
  // par défaut dans schema.prisma). Sans ça, `buildPanelBlueprintsFromBeat` produit ~30 panels
  // (≈3 par beat), et le reader n'affiche que ~8 cases visibles au user — le plan enrichit
  // `targetImages` à 75 en mémoire mais `panelBlueprints.length` reste bloqué à 30.
  const MINIMUM_PREMIUM_PANELS = 75;
  const allBlueprints = expandBlueprintsToMinimum(rawBlueprints, MINIMUM_PREMIUM_PANELS);
  if (allBlueprints.length > rawBlueprints.length) {
    console.log(
      `[premium-contract] expanded panelBlueprints ${rawBlueprints.length} → ${allBlueprints.length} (min=${MINIMUM_PREMIUM_PANELS})`,
    );
  }
  const focusBudget = computeChapterFocusBudget(allBlueprints);
  const premiumReadinessScore = computePremiumReadinessScore(allBlueprints);

  const productionOutline = {
    source: "premium_rebuilt" as const,
    chapterGoal: approvedOutline.summary,
    cliffhanger: approvedOutline.cliffhanger,
    beats: enrichedBeats.map(({ _blueprints: _b, ...beat }) => beat),
  };

  const objectStateTimeline = buildObjectStateTimeline(
    enrichedBeats.map((b) => ({
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

  const enemyCoverage = {
    panelCount: focusBudget.enemyFocusPanels,
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

  // Réutiliser la logique de construction du contrat depuis les beats enrichis
  // en appelant buildPremiumChapterContract avec les données déjà calculées
  // (on reconstruit le contrat depuis les beats enrichis)
  const syncResult = buildPremiumChapterContract(input);

  // Remplacer les narrativeFacts et requiredProps par les versions LLM-enrichies
  const llmEnrichedBeats = syncResult.productionOutline.beats.map((beat, i) => ({
    ...beat,
    narrativeFacts: enrichedBeats[i]?.narrativeFacts ?? beat.narrativeFacts,
    requiredProps: enrichedBeats[i]?.requiredProps ?? beat.requiredProps,
  }));

  return {
    ...syncResult,
    productionOutline: {
      ...syncResult.productionOutline,
      beats: llmEnrichedBeats,
    },
  };
}
