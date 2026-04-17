/**
 * Quality report and blueprint resolution helpers.
 * Extracted from run-full-chapter-pipeline.ts for testability.
 */
import type { PanelBlueprintPremium } from "@manga-ai-studio/core";
import type { CreativityControls } from "@manga-ai-studio/world";
import {
  computeChapterQualityReport as computeChapterQualityReportShared,
} from "./chapter-runtime-helpers";

export type PipelineJobInput = {
  focusCharacterIds?: string[];
  selectedPlotLabel?: "safe" | "bold" | "shock";
  creativityControls?: Partial<CreativityControls>;
  panelBlueprints?: unknown[];
  productionPlan?: unknown;
  premiumReadinessScore?: number;
};

export function resolveEffectivePanelBlueprints(opts: {
  jobInput: PipelineJobInput;
  studioSnapshot: { data?: { productionPlan?: { panelBlueprints?: unknown[] } } } | null;
}): PanelBlueprintPremium[] {
  if (Array.isArray(opts.jobInput.panelBlueprints) && opts.jobInput.panelBlueprints.length > 0) {
    return opts.jobInput.panelBlueprints as PanelBlueprintPremium[];
  }
  const snapshotBlueprints = opts.studioSnapshot?.data?.productionPlan?.panelBlueprints;
  if (Array.isArray(snapshotBlueprints) && snapshotBlueprints.length > 0) {
    return snapshotBlueprints as PanelBlueprintPremium[];
  }
  return [];
}

export function findPanelBlueprint(
  blueprints: PanelBlueprintPremium[],
  sceneIndex: number,
  panelNumber: number,
): PanelBlueprintPremium | undefined {
  // Stratégie 1 (fiable) : match par pageNumber + panelNumber natifs du blueprint
  const pageNumber = sceneIndex + 1;
  const byPageAndPanel = blueprints.find(
    (bp) => bp.pageNumber === pageNumber && bp.panelNumber === panelNumber,
  );
  if (byPageAndPanel) return byPageAndPanel;

  // Stratégie 2 : parse "beat_N" — mais seulement si le format est conforme
  const beatBlueprints = blueprints.filter((bp) => {
    if (!bp.beatId) return false;
    const match = bp.beatId.match(/^beat_(\d+)$/);
    if (!match) return false;
    const bpBeatIndex = parseInt(match[1] ?? "0", 10) - 1;
    return bpBeatIndex === sceneIndex;
  });
  if (beatBlueprints.length > 0) {
    return beatBlueprints[panelNumber - 1] ?? beatBlueprints[0];
  }

  // Stratégie 3 (fallback) : flatten + index global
  const globalIndex = sceneIndex * 6 + (panelNumber - 1);
  return blueprints[globalIndex] ?? blueprints[0];
}

export function normalizeCreativeControls(
  value: Partial<CreativityControls> | undefined,
  canonStrictness: number | null | undefined,
): CreativityControls {
  const input = value ?? {};
  const clamp = (raw: number | undefined, fallback: number) =>
    Math.max(0, Math.min(100, Number.isFinite(raw) ? Number(raw) : fallback));
  return {
    noveltyLevel: clamp(input.noveltyLevel, 55),
    worldStrictness: clamp(input.worldStrictness, canonStrictness ?? 85),
    visualExoticism: clamp(input.visualExoticism, 50),
    npcVariety: clamp(input.npcVariety, 60),
    environmentRichness: clamp(input.environmentRichness, 78),
  };
}

export function computeChapterQualityReport(
  rows: Array<{
    consistencyScore: number | null;
    metadata: unknown;
  }>,
) {
  return computeChapterQualityReportShared(rows);
}
