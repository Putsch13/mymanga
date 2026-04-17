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
    console.warn(
      `[pipeline:coverage-gaps] ${criticalGaps
        .map(
          (g) =>
            `${g.metric}: planned=${(g.planned * 100).toFixed(0)}% rendered=${(g.rendered * 100).toFixed(0)}%`,
        )
        .join(" | ")}`,
    );
  } else {
    console.log(
      `[pipeline:coverage] OK enemy=${(renderedCoverage.enemyCoverage * 100).toFixed(0)}% npc=${(renderedCoverage.npcCoverage * 100).toFixed(0)}% cutaway=${(renderedCoverage.cutawayCoverage * 100).toFixed(0)}%`,
    );
  }

  return { plannedCoverage, renderedCoverage, coverageGaps, criticalGaps };
}
