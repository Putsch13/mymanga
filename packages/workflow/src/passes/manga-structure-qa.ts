/**
 * QA structure manga sur les blueprints premium (après rebalancing).
 */

import type { PanelBlueprintPremium } from "@manga-ai-studio/core";
import {
  containsBannedPlaceholder,
  isPremiumMangaActorDrivenBlueprint,
  isPremiumMangaCutawayBlueprint,
} from "./premium-manga-rebalance";

export interface MangaStructureQaResult {
  ok: boolean;
  reasons: string[];
  summary: string;
  cutawayRatio: number;
  actorDrivenRatio: number;
  maxConsecutiveCutaways: number;
}

function sortedByReadingOrder(blueprints: PanelBlueprintPremium[]): PanelBlueprintPremium[] {
  return [...blueprints].sort((a, b) => a.panelNumber - b.panelNumber);
}

function maxConsecutiveCutaways(blueprints: PanelBlueprintPremium[]): number {
  const sorted = sortedByReadingOrder(blueprints);
  let maxRun = 0;
  let run = 0;
  for (const bp of sorted) {
    if (isPremiumMangaCutawayBlueprint(bp)) {
      run += 1;
      maxRun = Math.max(maxRun, run);
    } else {
      run = 0;
    }
  }
  return maxRun;
}

function beatHasActorPanel(beatId: string, blueprints: PanelBlueprintPremium[]): boolean {
  return blueprints.some((bp) => bp.beatId === beatId && isPremiumMangaActorDrivenBlueprint(bp));
}

function beatDialogueCoverage(beatId: string, blueprints: PanelBlueprintPremium[]): boolean {
  const beatPanels = blueprints.filter((bp) => bp.beatId === beatId);
  const hasDialogue = beatPanels.some((bp) => (bp.dialogueLines?.length ?? 0) > 0);
  if (!hasDialogue) return true;
  return beatPanels.some(
    (bp) =>
      bp.dialogueCarrier === "speaker_visible"
      || bp.subjectFocus === "speaker"
      || (bp.subjectFocus === "hero" && (bp.mustShowCharacterIds?.length ?? 0) > 0),
  );
}

function beatConflictCoverage(beatId: string, blueprints: PanelBlueprintPremium[]): boolean {
  const beatPanels = blueprints.filter((bp) => bp.beatId === beatId);
  const needsEnemy = beatPanels.some((bp) => bp.mustShowEnemy || bp.subjectFocus === "enemy");
  if (!needsEnemy) return true;
  return beatPanels.some((bp) => bp.subjectFocus === "enemy" || (bp.mustShowEnemy && isPremiumMangaActorDrivenBlueprint(bp)));
}

export interface RunMangaStructureQaArgs {
  blueprints: PanelBlueprintPremium[];
  maxCutawayRatio: number;
  minActorDrivenRatio: number;
}

export function runMangaStructureQaOnBlueprints(args: RunMangaStructureQaArgs): MangaStructureQaResult {
  const total = args.blueprints.length || 1;
  const cutawayCount = args.blueprints.filter(isPremiumMangaCutawayBlueprint).length;
  const actorCount = args.blueprints.filter(isPremiumMangaActorDrivenBlueprint).length;
  const cutawayRatio = cutawayCount / total;
  const actorDrivenRatio = actorCount / total;
  const maxRun = maxConsecutiveCutaways(args.blueprints);

  const reasons: string[] = [];

  if (cutawayRatio > args.maxCutawayRatio + 1e-6) {
    reasons.push(
      `cutaway_ratio_exceeded ${(cutawayRatio * 100).toFixed(1)}% > ${(args.maxCutawayRatio * 100).toFixed(0)}%`,
    );
  }
  if (actorDrivenRatio + 1e-6 < args.minActorDrivenRatio) {
    reasons.push(
      `actor_driven_ratio_low ${(actorDrivenRatio * 100).toFixed(1)}% < ${(args.minActorDrivenRatio * 100).toFixed(0)}%`,
    );
  }
  if (maxRun >= 3) {
    reasons.push(`consecutive_cutaways_max=${maxRun} (max 2 allowed)`);
  }

  const beatIds = Array.from(new Set(args.blueprints.map((b) => b.beatId)));
  for (const bid of beatIds) {
    if (!beatHasActorPanel(bid, args.blueprints)) {
      reasons.push(`no_actor_panel_for_beat beat=${bid}`);
    }
    if (!beatDialogueCoverage(bid, args.blueprints)) {
      reasons.push(`no_speaker_panel_for_dialogue_beat beat=${bid}`);
    }
    if (!beatConflictCoverage(bid, args.blueprints)) {
      reasons.push(`no_enemy_panel_for_conflict_beat beat=${bid}`);
    }
  }

  for (const bp of args.blueprints) {
    if (containsBannedPlaceholder(bp)) {
      reasons.push(`placeholder_text panel=${bp.panelId}`);
      break;
    }
  }

  const ok = reasons.length === 0;
  const summary = ok
    ? `ok cutawayRatio=${(cutawayRatio * 100).toFixed(1)}% actorDriven=${(actorDrivenRatio * 100).toFixed(1)}%`
    : reasons.slice(0, 6).join(" | ");

  return {
    ok,
    reasons,
    summary,
    cutawayRatio,
    actorDrivenRatio,
    maxConsecutiveCutaways: maxRun,
  };
}
