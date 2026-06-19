/**
 * Rebalancing premium manga — réduit les cutaways excédentaires après densification
 * et aligne les blueprints sur des panels portés par des acteurs visibles.
 *
 * Façade fine — l'implémentation vit dans `_premium-manga-rebalance/*`.
 */

import type { PanelBlueprintPremium } from "@manga-ai-studio/core";

import {
  buildReadingOrderIndexMap,
  isPremiumMangaActorDrivenBlueprint,
  isPremiumMangaCutawayBlueprint,
  stripBannedPlaceholdersFromBlueprint,
} from "./premium-manga-cutaway";
import { runMangaStructureQaOnBlueprints } from "./manga-structure-qa";
import type { VisualEntity } from "./visual-entity-registry";

import {
  isHardCriticalCutawayBlueprint,
  isSoftCriticalCutawayBlueprint,
} from "./_premium-manga-rebalance/critical-classification";
import {
  breakConsecutiveCutaways,
  ensureConflictBeatsHaveOpponents,
  rebalanceCutawaysToBudgetOnce,
} from "./_premium-manga-rebalance/iteration";

export {
  buildActorDrivenReplacement,
  convertCutawayToActorDrivenPanel,
  convertPanelToEntityDrivenPanel,
} from "./_premium-manga-rebalance/actor-replacement";
export {
  isHardCriticalCutawayBlueprint,
  isSoftCriticalCutawayBlueprint,
} from "./_premium-manga-rebalance/critical-classification";
export type {
  EnsureConflictOpponentsArgs,
  EnsureConflictOpponentsResult,
} from "./_premium-manga-rebalance/iteration";

export {
  blueprintTextBlob,
  containsBannedPlaceholder,
  isPremiumMangaActorDrivenBlueprint,
  isPremiumMangaCutawayBlueprint,
  maxConsecutiveCutawaysInOrder,
  stripBannedPlaceholdersFromBlueprint,
} from "./premium-manga-cutaway";

export interface RebalancePremiumBlueprintsArgs {
  blueprints: PanelBlueprintPremium[];
  visualEntities: VisualEntity[];
  projectFormat: "manga" | "webtoon";
  maxCutawayRatio: number;
  minActorDrivenRatio: number;
  fallbackHeroId: string | null;
  projectId: string;
}

export interface RebalancePremiumBlueprintsResult {
  blueprints: PanelBlueprintPremium[];
  beforeCutawayCount: number;
  afterCutawayCount: number;
  convertedCount: number;
  /** @deprecated utiliser keptHardCriticalCount + keptSoftCriticalCount */
  keptCriticalCount: number;
  keptHardCriticalCount: number;
  keptSoftCriticalCount: number;
  beforeActorDrivenCount: number;
  afterActorDrivenCount: number;
  structureIterations: number;
  autoCreatedOpponents: number;
  skippedSuspenseBeats: string[];
}

const MAX_STRUCTURE_ITERATIONS = 6;

export function rebalancePremiumBlueprintsForManga(
  args: RebalancePremiumBlueprintsArgs,
): RebalancePremiumBlueprintsResult {
  if (args.projectFormat !== "manga") {
    const cut = args.blueprints.filter(isPremiumMangaCutawayBlueprint).length;
    const act = args.blueprints.filter(isPremiumMangaActorDrivenBlueprint).length;
    return {
      blueprints: args.blueprints,
      beforeCutawayCount: cut,
      afterCutawayCount: cut,
      convertedCount: 0,
      keptCriticalCount: 0,
      keptHardCriticalCount: 0,
      keptSoftCriticalCount: 0,
      beforeActorDrivenCount: act,
      afterActorDrivenCount: act,
      structureIterations: 0,
      autoCreatedOpponents: 0,
      skippedSuspenseBeats: [],
    };
  }

  const blueprints = args.blueprints.map(
    (b) => structuredClone(b) as PanelBlueprintPremium,
  );
  for (const bp of blueprints) {
    stripBannedPlaceholdersFromBlueprint(bp);
  }

  const beforeCutawayCount = blueprints.filter(isPremiumMangaCutawayBlueprint).length;
  const beforeActorDrivenCount = blueprints.filter(isPremiumMangaActorDrivenBlueprint).length;

  let orderMap = buildReadingOrderIndexMap(blueprints);
  let structureIterations = 0;
  let totalAutoCreatedOpponents = 0;
  let allSkippedSuspenseBeats: string[] = [];

  for (; structureIterations < MAX_STRUCTURE_ITERATIONS; structureIterations += 1) {
    rebalanceCutawaysToBudgetOnce(blueprints, args, orderMap);
    breakConsecutiveCutaways(
      blueprints,
      2,
      orderMap,
      args.visualEntities,
      args.fallbackHeroId,
    );
    const conflictResult = ensureConflictBeatsHaveOpponents({
      blueprints,
      visualEntities: args.visualEntities,
      fallbackHeroId: args.fallbackHeroId,
      orderMap,
      projectId: args.projectId,
    });
    totalAutoCreatedOpponents += conflictResult.autoCreatedEntities;
    allSkippedSuspenseBeats = [
      ...new Set([...allSkippedSuspenseBeats, ...conflictResult.skippedSuspenseBeats]),
    ];
    rebalanceCutawaysToBudgetOnce(blueprints, args, orderMap);

    orderMap = buildReadingOrderIndexMap(blueprints);
    const qa = runMangaStructureQaOnBlueprints({
      blueprints,
      maxCutawayRatio: args.maxCutawayRatio,
      minActorDrivenRatio: args.minActorDrivenRatio,
      visualEntities: args.visualEntities,
    });
    if (qa.ok) break;
  }

  const afterCutawayCount = blueprints.filter(isPremiumMangaCutawayBlueprint).length;
  const afterActorDrivenCount = blueprints.filter(isPremiumMangaActorDrivenBlueprint).length;
  const finalCutaways = blueprints.filter(isPremiumMangaCutawayBlueprint);
  const keptHardCriticalCount = finalCutaways.filter((bp) =>
    isHardCriticalCutawayBlueprint(bp, orderMap.get(bp.panelId) ?? 0),
  ).length;
  const keptSoftCriticalCount = finalCutaways.filter((bp) =>
    isSoftCriticalCutawayBlueprint(bp, orderMap.get(bp.panelId) ?? 0),
  ).length;

  const genericPurposePanels = blueprints.filter((bp) => {
    const p = bp.purpose.toLowerCase();
    return p.includes("character advances the scene") || p.includes("visible action or emotion");
  });
  if (genericPurposePanels.length > 0) {
    throw new Error(
      `rebalance_produced_generic_purposes: ${genericPurposePanels.length} panels have generic actions (first: ${genericPurposePanels[0]?.panelId})`,
    );
  }

  return {
    blueprints,
    beforeCutawayCount,
    afterCutawayCount,
    convertedCount: Math.max(0, beforeCutawayCount - afterCutawayCount),
    keptCriticalCount: keptHardCriticalCount + keptSoftCriticalCount,
    keptHardCriticalCount,
    keptSoftCriticalCount,
    beforeActorDrivenCount,
    afterActorDrivenCount,
    structureIterations,
    autoCreatedOpponents: totalAutoCreatedOpponents,
    skippedSuspenseBeats: allSkippedSuspenseBeats,
  };
}
