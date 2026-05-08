/**
 * Image generation pass — rapport de couverture planifiée vs rendue.
 *
 * Extrait de image-generation-pass.ts. Compare la couverture attendue (enemies, NPCs,
 * cutaways) avec celle effectivement rendue, logge les gaps critiques.
 *
 * Pure : aucune mutation ni I/O.
 */

import {
  computePlannedCoverage,
  computeCoverageGaps,
  type PanelBlueprintPremium,
} from "@manga-ai-studio/core";
import { logPipelineInfo, logPipelineWarn } from "../../lib/pipeline-logger";

type PlannedImageLike = {
  baseMetadata: Record<string, unknown>;
};

export interface CoverageReport {
  plannedCoverage: ReturnType<typeof computePlannedCoverage>;
  renderedCoverage: ReturnType<typeof computePlannedCoverage>;
  coverageGaps: ReturnType<typeof computeCoverageGaps>;
  criticalGaps: ReturnType<typeof computeCoverageGaps>;
}

export function reportRenderedCoverage(params: {
  finalPanelBlueprints: PanelBlueprintPremium[];
  plannedImages: readonly PlannedImageLike[];
}): CoverageReport {
  const { finalPanelBlueprints, plannedImages } = params;

  const plannedCoverage = computePlannedCoverage(finalPanelBlueprints);
  const renderedBps = plannedImages
    .map((img) =>
      finalPanelBlueprints.find(
        (bp) =>
          bp.panelId === (img.baseMetadata.panelId as string | undefined)
          || bp.beatId === (img.baseMetadata.beatId as string | undefined),
      ),
    )
    .filter((bp): bp is PanelBlueprintPremium => bp !== undefined);
  const renderedCoverage = computePlannedCoverage(renderedBps);
  const coverageGaps = computeCoverageGaps(plannedCoverage, renderedCoverage);
  const criticalGaps = coverageGaps.filter((g) => g.severity === "critical");

  if (criticalGaps.length > 0) {
    logPipelineWarn(
      "coverage.critical_gaps",
      {
        gaps: criticalGaps.map((g) => ({
          metric: g.metric,
          plannedPct: Math.round(g.planned * 100),
          renderedPct: Math.round(g.rendered * 100),
        })),
      },
      { ns: "pipeline:coverage-gaps" },
    );
  } else {
    logPipelineInfo(
      "coverage.ok",
      {
        enemyPct: Math.round(renderedCoverage.enemyCoverage * 100),
        npcPct: Math.round(renderedCoverage.npcCoverage * 100),
        cutawayPct: Math.round(renderedCoverage.cutawayCoverage * 100),
      },
      { ns: "pipeline:coverage" },
    );
  }

  return { plannedCoverage, renderedCoverage, coverageGaps, criticalGaps };
}
