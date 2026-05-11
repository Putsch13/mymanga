/**
 * Assemblage final du contrat premium à partir de beats déjà enrichis.
 *
 * Auparavant : 130 lignes dupliquées trait pour trait entre les variantes
 * sync et async de `buildPremiumChapterContract`. La duplication causait
 * régulièrement des bugs de désynchronisation (ex. la version async
 * ré-appelait la sync puis remplaçait juste les `narrativeFacts`, ce qui
 * laissait des blueprints non-LLM dans le résultat).
 */
import {
  buildCanonicalChapterProductionPlan,
  buildProductionPlanFromOutline,
  classifyPremiumPanelCount,
  mergeRawBlueprintsWithCanonicalRhythm,
  PREMIUM_PANEL_RANGE,
} from "@manga-ai-studio/core";
import type { PanelBlueprintPremium } from "@manga-ai-studio/core";
import {
  computeChapterFocusBudget,
  computePremiumReadinessScore,
} from "../panel-blueprint-builder";
import {
  applyOptionalCharacterDnaHydration,
  applyOptionalEnvironmentDnaHydration,
  applyOptionalVisualWorldNpcPropHydration,
  assertFinalStructuralQaAfterMerge,
  resyncBlueprintPanelTextContracts,
} from "./hydrate-blueprints";
import { buildObjectStateTimeline } from "./object-state-timeline";
import type {
  BuildPremiumChapterContractInput,
  BuildPremiumChapterContractResult,
  EnrichedBeatInternal,
  PremiumMeta,
} from "./types";

interface AssemblePremiumContractArgs {
  input: BuildPremiumChapterContractInput;
  enrichedBeats: EnrichedBeatInternal[];
  /** Préfixe utilisé dans les logs (`[premium-contract]` vs `[premium-contract-async]`). */
  logPrefix: string;
}

export function assemblePremiumChapterContract(
  args: AssemblePremiumContractArgs,
): BuildPremiumChapterContractResult {
  const { input, enrichedBeats, logPrefix } = args;
  const { approvedOutline } = input;

  const minPanels = PREMIUM_PANEL_RANGE.min;
  const maxPanels = PREMIUM_PANEL_RANGE.max;
  const minimumPanels = typeof input.minimumPanels === "number" && input.minimumPanels > 0
    ? input.minimumPanels
    : minPanels;

  const chapterId = input.chapterId ?? "premium-contract-preview";
  const projectId = input.projectId ?? "premium-contract-preview";
  const chapterNumber = input.chapterNumber ?? 1;
  const chapterTitle = input.chapterTitle ?? `Chapitre ${chapterNumber}`;
  const format = input.projectFormat === "webtoon" ? "webtoon" : "manga";

  const beatsWithFacts = enrichedBeats.map((b) => ({
    ...b.productionBeat,
    narrativeFacts: b.narrativeFacts,
    requiredProps: b.requiredProps,
  }));

  const outlineForCanonical = {
    source: "premium_rebuilt" as const,
    chapterGoal: approvedOutline.summary,
    cliffhanger: approvedOutline.cliffhanger,
    beats: beatsWithFacts,
  };

  const canonicalPlan = buildCanonicalChapterProductionPlan({
    chapterId,
    projectId,
    chapterNumber,
    chapterTitle,
    format,
    rawOutline: outlineForCanonical,
    knownNpcGroups: input.knownNpcGroups,
    knownCharacters: input.knownCharacters,
    visualWorld: input.visualWorldContract ?? null,
  });

  const rawFlattened = enrichedBeats.flatMap((b) => b.blueprints);
  const mergedBlueprints = mergeRawBlueprintsWithCanonicalRhythm(rawFlattened, canonicalPlan);
  let allBlueprints: PanelBlueprintPremium[] = applyOptionalCharacterDnaHydration(mergedBlueprints, input);
  allBlueprints = applyOptionalEnvironmentDnaHydration(allBlueprints, input);
  allBlueprints = applyOptionalVisualWorldNpcPropHydration(allBlueprints, input);
  resyncBlueprintPanelTextContracts(allBlueprints);

  assertFinalStructuralQaAfterMerge({
    chapterId,
    projectId,
    chapterNumber,
    chapterTitle,
    format,
    productionOutline: outlineForCanonical,
    blueprints: allBlueprints,
    knownNpcGroups: input.knownNpcGroups,
    knownCharacters: input.knownCharacters,
  });

  const beatPanelCounts = new Map(canonicalPlan.beats.map((b) => [b.beatId, b.actualPanelCount]));
  const beatsAligned = beatsWithFacts.map((b) => ({
    ...b,
    estimatedPanels: beatPanelCounts.get(b.beatId) ?? b.estimatedPanels,
  }));

  const panelCountStatus = classifyPremiumPanelCount(allBlueprints.length);
  console.log(
    `${logPrefix} canonical_panel_count=${allBlueprints.length} status=${panelCountStatus} required_range=${minPanels}-${maxPanels} minimumPanels=${minimumPanels}`,
  );

  const focusBudget = computeChapterFocusBudget(allBlueprints);
  const premiumReadinessScore = computePremiumReadinessScore(allBlueprints, input.premiumReadinessCast);

  const productionOutline = {
    source: "premium_rebuilt" as const,
    chapterGoal: approvedOutline.summary,
    cliffhanger: approvedOutline.cliffhanger,
    beats: beatsAligned,
  };

  const objectStateTimeline = buildObjectStateTimeline(
    beatsAligned.map((b) => ({
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
    beatsCovered: beatsAligned
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
    ...buildProductionPlanFromOutline(productionOutline, { minimumImages: minimumPanels }),
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
