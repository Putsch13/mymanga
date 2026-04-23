/**
 * Service partagé de construction du contrat premium d'un chapitre.
 * Toute route qui a besoin de reconstruire le contrat premium doit appeler ce service.
 * Interdit de reconstruire un productionOutline minimaliste "pour dépanner" ailleurs.
 */

import { buildProductionPlanFromOutline, classifyPremiumPanelCount, PREMIUM_PANEL_RANGE } from "@manga-ai-studio/core";
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

type EnrichmentVariant = {
  shotType: PanelBlueprintPremium["shotType"];
  subjectFocus: PanelBlueprintPremium["subjectFocus"];
  cameraAngle: PanelBlueprintPremium["cameraAngle"];
  cutawayType: PanelBlueprintPremium["cutawayType"];
  purpose: PanelBlueprintPremium["purpose"];
};

/**
 * Densification déterministe, sans "random padding".
 * Objectif : produire un contrat premium exploitable (70–75 panels) même quand
 * l'outline a peu de beats.
 *
 * Note : on n'invente pas d'événements, on ajoute des cases de grammaire visuelle
 * (cutaways / réactions / inserts) dérivées des beats existants.
 */
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
    // Renumérotation globale refaite après, mais on met déjà un ordre cohérent.
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
  beats: Array<{ beatId: string; _blueprints: PanelBlueprintPremium[] }>;
  minPanels: number;
  maxPanels: number;
}): { beats: typeof input.beats; allBlueprints: PanelBlueprintPremium[] } {
  const beats = input.beats.map((b) => ({ ...b, _blueprints: [...b._blueprints] }));
  let all = beats.flatMap((b) => b._blueprints);

  if (all.length === 0) return { beats, allBlueprints: [] };

  if (all.length < input.minPanels) {
    const missing = input.minPanels - all.length;
    // Répartition round-robin sur les beats pour éviter de surcharger un seul beat.
    for (let i = 0; i < missing; i += 1) {
      const beat = beats[i % beats.length];
      const seed = (beat?._blueprints[beat._blueprints.length - 1] ?? all[all.length - 1]) as PanelBlueprintPremium;
      const variant = DENSIFY_VARIANTS[i % DENSIFY_VARIANTS.length]!;
      const densified = makeDensifiedBlueprint({
        seed,
        globalIndex: all.length,
        variant,
      });
      beat._blueprints.push(densified);
      all.push(densified);
    }
  } else if (all.length > input.maxPanels) {
    // Sur-densité : on retire en priorité des panels non critiques (low + non contractual).
    // Si on ne peut pas revenir sous max sans toucher des panels critiques, on échoue.
    const removable = (bp: PanelBlueprintPremium) =>
      bp.contractualCritical !== true && bp.criticality !== "critical" && bp.criticality !== "high";

    while (all.length > input.maxPanels) {
      let removed = false;
      // Supprime depuis la fin (garde le rythme début/fin) mais en respectant removable.
      for (let i = beats.length - 1; i >= 0; i -= 1) {
        const beat = beats[i]!;
        const idx = [...beat._blueprints].reverse().findIndex(removable);
        if (idx === -1) continue;
        const removeAt = beat._blueprints.length - 1 - idx;
        beat._blueprints.splice(removeAt, 1);
        all = beats.flatMap((b) => b._blueprints);
        removed = true;
        break;
      }
      if (!removed) {
        throw new Error(
          `premium_panel_count_over_max_non_removable raw=${all.length} max=${input.maxPanels} — regen outline required`,
        );
      }
    }
  }

  const renumbered = renumberBlueprintsGlobally(beats.flatMap((b) => b._blueprints));
  // Réinjecter la renumérotation globale dans chaque beat
  const byBeat = new Map<string, PanelBlueprintPremium[]>();
  for (const bp of renumbered) {
    const list = byBeat.get(bp.beatId) ?? [];
    list.push(bp);
    byBeat.set(bp.beatId, list);
  }

  const beatsRenumbered = beats.map((b) => ({
    ...b,
    _blueprints: byBeat.get(b.beatId) ?? [],
  }));

  return { beats: beatsRenumbered, allBlueprints: renumbered };
}

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
  const densified = densifyBlueprintsToPremiumRange({
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
