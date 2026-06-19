/**
 * Télémétrie de couverture des entités visuelles sur les blueprints premium.
 */

import type { PanelBlueprintPremium } from "@manga-ai-studio/core";
import { isPremiumMangaActorDrivenBlueprint } from "./premium-manga-cutaway";
import { getRequiredVisualEntityIds } from "./visual-entity-ids";
import type { VisualEntity } from "./visual-entity-registry";

export interface EntityCoverageTelemetry {
  required: number;
  covered: number;
  missing: string[];
  opponentPanels: number;
  groupEntityPanels: number;
  namedNpcPanels: number;
  ambientEntityPanels: number;
  byUserDefinedKind: Record<string, number>;
}

function collectRequiredEntityIds(blueprints: PanelBlueprintPremium[], visualEntities: VisualEntity[]): string[] {
  const idSet = new Set<string>();
  const known = new Set(visualEntities.map((e) => e.id));
  for (const bp of blueprints) {
    for (const id of getRequiredVisualEntityIds(bp)) {
      if (known.has(id)) idSet.add(id);
    }
    for (const ob of bp.presenceObligations ?? []) {
      if (known.has(ob.entityIdOrLabel)) idSet.add(ob.entityIdOrLabel);
    }
  }
  return [...idSet];
}

function collectCoveredEntityIds(blueprints: PanelBlueprintPremium[], visualEntities: VisualEntity[]): string[] {
  const covered = new Set<string>();
  const known = new Set(visualEntities.map((e) => e.id));
  for (const bp of blueprints) {
    if (!isPremiumMangaActorDrivenBlueprint(bp)) continue;
    for (const id of getRequiredVisualEntityIds(bp)) {
      if (known.has(id)) covered.add(id);
    }
  }
  return [...covered];
}

export function countPanelsByUserDefinedKind(
  blueprints: PanelBlueprintPremium[],
  visualEntities: VisualEntity[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const bp of blueprints) {
    if (!isPremiumMangaActorDrivenBlueprint(bp)) continue;
    for (const id of getRequiredVisualEntityIds(bp)) {
      const e = visualEntities.find((x) => x.id === id);
      const key = e?.userDefinedKind ?? "unknown";
      counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  return counts;
}

export function computeEntityCoverageTelemetry(
  blueprints: PanelBlueprintPremium[],
  visualEntities: VisualEntity[],
): EntityCoverageTelemetry {
  const requiredIds = collectRequiredEntityIds(blueprints, visualEntities);
  const coveredIds = collectCoveredEntityIds(blueprints, visualEntities);
  const coveredSet = new Set(coveredIds);
  const missing = requiredIds.filter((id) => !coveredSet.has(id));
  const coveredCount = requiredIds.length - missing.length;

  let opponentPanels = 0;
  let groupEntityPanels = 0;
  let namedNpcPanels = 0;
  let ambientEntityPanels = 0;

  for (const bp of blueprints) {
    if (!isPremiumMangaActorDrivenBlueprint(bp)) continue;
    const ids = getRequiredVisualEntityIds(bp);
    let opp = false;
    let grp = false;
    let named = false;
    let amb = false;
    for (const id of ids) {
      const e = visualEntities.find((x) => x.id === id);
      if (!e) continue;
      if (e.isOpponent) opp = true;
      if (e.canAppearAsGroup) grp = true;
      if (e.isNamed && e.role !== "protagonist") named = true;
      if (e.role === "ambient" || e.role === "environmental_threat") amb = true;
    }
    if (opp) opponentPanels += 1;
    if (grp) groupEntityPanels += 1;
    if (named) namedNpcPanels += 1;
    if (amb) ambientEntityPanels += 1;
  }

  return {
    required: requiredIds.length,
    covered: coveredCount,
    missing,
    opponentPanels,
    groupEntityPanels,
    namedNpcPanels,
    ambientEntityPanels,
    byUserDefinedKind: countPanelsByUserDefinedKind(blueprints, visualEntities),
  };
}

export function formatEntityCoverageTypesLine(byKind: Record<string, number>): string {
  const parts = Object.entries(byKind)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k}=${n}`);
  return parts.join(", ");
}
