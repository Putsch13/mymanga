import type { PanelBlueprintPremium } from "@manga-ai-studio/core";

import {
  beatRequiresResolvedOpponent,
  ensureOpponentEntityForBeat,
} from "../auto-canonize-opponent";
import {
  isConflictHeavyBeatPanel,
  isPremiumMangaActorDrivenBlueprint,
  isPremiumMangaCutawayBlueprint,
} from "../premium-manga-cutaway";
import type { VisualEntity } from "../visual-entity-registry";
import { getRequiredVisualEntityIds } from "../visual-entity-ids";

import {
  convertCutawayToActorDrivenPanel,
  convertPanelToEntityDrivenPanel,
} from "./actor-replacement";
import {
  isHardCriticalCutawayBlueprint,
  isSoftCriticalCutawayBlueprint,
  narrativeValueScore,
} from "./critical-classification";

export interface RebalanceCutawayBudgetArgs {
  maxCutawayRatio: number;
  minActorDrivenRatio: number;
  visualEntities: VisualEntity[];
  fallbackHeroId: string | null;
}

export function rebalanceCutawaysToBudgetOnce(
  blueprints: PanelBlueprintPremium[],
  args: RebalanceCutawayBudgetArgs,
  orderMap: Map<string, number>,
): number {
  const total = blueprints.length;
  if (total === 0) return 0;

  const maxCutaways = Math.floor(total * args.maxCutawayRatio);
  const minActorDriven = Math.ceil(total * args.minActorDrivenRatio);

  const cutaways = blueprints.filter(isPremiumMangaCutawayBlueprint);
  let currentCutaways = cutaways.length;
  let currentActorDriven = blueprints.filter(isPremiumMangaActorDrivenBlueprint).length;

  const hardCritical = cutaways.filter((bp) =>
    isHardCriticalCutawayBlueprint(bp, orderMap.get(bp.panelId) ?? 0),
  );
  const softCritical = cutaways.filter((bp) =>
    isSoftCriticalCutawayBlueprint(bp, orderMap.get(bp.panelId) ?? 0),
  );
  const normalCutaways = cutaways.filter(
    (bp) =>
      !isHardCriticalCutawayBlueprint(bp, orderMap.get(bp.panelId) ?? 0)
      && !isSoftCriticalCutawayBlueprint(bp, orderMap.get(bp.panelId) ?? 0),
  );

  const maxHardCritical = Math.min(Math.floor(total * 0.15), maxCutaways);
  const hardSorted = [...hardCritical].sort(
    (a, b) => narrativeValueScore(b) - narrativeValueScore(a),
  );
  const hardCriticalToKeep = new Set(
    hardSorted.slice(0, maxHardCritical).map((bp) => bp.panelId),
  );

  const convertible = [
    ...normalCutaways,
    ...softCritical,
    ...hardCritical.filter((bp) => !hardCriticalToKeep.has(bp.panelId)),
  ].sort((a, b) => narrativeValueScore(a) - narrativeValueScore(b));

  let converted = 0;
  for (const bp of convertible) {
    if (currentCutaways <= maxCutaways && currentActorDriven >= minActorDriven) break;
    convertCutawayToActorDrivenPanel(
      bp,
      args.visualEntities,
      args.fallbackHeroId,
      orderMap,
    );
    currentCutaways -= 1;
    currentActorDriven += 1;
    converted += 1;
  }

  return converted;
}

export function breakConsecutiveCutaways(
  blueprints: PanelBlueprintPremium[],
  maxConsecutive: number,
  orderMap: Map<string, number>,
  entities: VisualEntity[],
  fallbackHeroId: string | null,
): number {
  const sorted = [...blueprints].sort((a, b) => {
    if (a.panelNumber !== b.panelNumber) return a.panelNumber - b.panelNumber;
    return a.panelId.localeCompare(b.panelId);
  });
  let streak = 0;
  let converted = 0;
  for (const bp of sorted) {
    if (isPremiumMangaCutawayBlueprint(bp)) {
      streak += 1;
      const idx = orderMap.get(bp.panelId) ?? 0;
      if (streak > maxConsecutive && !isHardCriticalCutawayBlueprint(bp, idx)) {
        convertCutawayToActorDrivenPanel(bp, entities, fallbackHeroId, orderMap);
        streak = 0;
        converted += 1;
      }
    } else {
      streak = 0;
    }
  }
  return converted;
}

function beatAlreadyShowsOpponentEntity(
  beatPanels: PanelBlueprintPremium[],
  visualEntities: VisualEntity[],
): boolean {
  return beatPanels.some((bp) => {
    if (!isPremiumMangaActorDrivenBlueprint(bp)) return false;
    const ids = getRequiredVisualEntityIds(bp);
    return ids.some(
      (id) => visualEntities.find((e) => e.id === id)?.isOpponent === true,
    );
  });
}

export interface EnsureConflictOpponentsArgs {
  blueprints: PanelBlueprintPremium[];
  visualEntities: VisualEntity[];
  fallbackHeroId: string | null;
  orderMap: Map<string, number>;
  projectId: string;
}

export interface EnsureConflictOpponentsResult {
  fixes: number;
  autoCreatedEntities: number;
  skippedSuspenseBeats: string[];
}

export function ensureConflictBeatsHaveOpponents(
  args: EnsureConflictOpponentsArgs,
): EnsureConflictOpponentsResult {
  let fixes = 0;
  let autoCreatedEntities = 0;
  const skippedSuspenseBeats: string[] = [];

  const conflictBeatIds = new Set(
    args.blueprints.filter(isConflictHeavyBeatPanel).map((bp) => bp.beatId),
  );

  for (const beatId of conflictBeatIds) {
    const beatPanels = args.blueprints.filter((bp) => bp.beatId === beatId);

    if (!beatRequiresResolvedOpponent(beatPanels)) {
      console.info(
        `[pipeline:v3:opponent-coverage] beat=${beatId} skipped reason=suspense_without_visible_opponent`,
      );
      skippedSuspenseBeats.push(beatId);
      continue;
    }

    if (beatAlreadyShowsOpponentEntity(beatPanels, args.visualEntities)) {
      console.info(
        `[pipeline:v3:opponent-coverage] beat=${beatId} ok=true reason=already_covered`,
      );
      continue;
    }

    const { entity: opponent, autoCreated } = ensureOpponentEntityForBeat({
      beatId,
      beatPanels,
      visualEntities: args.visualEntities,
      projectId: args.projectId,
    });

    if (!opponent) {
      throw new Error(
        `conflict_beat_without_resolved_opponent_entity beat=${beatId}`,
      );
    }

    if (autoCreated) {
      autoCreatedEntities += 1;
    }

    const target =
      beatPanels.find(
        (bp) =>
          isPremiumMangaCutawayBlueprint(bp)
          && !isHardCriticalCutawayBlueprint(bp, args.orderMap.get(bp.panelId) ?? 0),
      ) ?? beatPanels[0];

    if (!target) continue;

    convertPanelToEntityDrivenPanel(target, opponent, {
      reason: "forced_opponent_panel_for_conflict_beat",
    });

    console.info(
      `[pipeline:v3:opponent-coverage] beat=${beatId} opponent=${opponent.id} ok=true`,
    );
    fixes += 1;
  }

  return { fixes, autoCreatedEntities, skippedSuspenseBeats };
}
