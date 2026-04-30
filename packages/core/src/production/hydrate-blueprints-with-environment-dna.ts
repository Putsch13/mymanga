/**
 * Hydrate `environmentVisualDna` / ancrage décor depuis un `VisualWorldContract`
 * (après merge canonique + DNA personnages si applicable).
 */

import type { EnvironmentVisualDna } from "../types/generation-debug-snapshot";
import type { PanelBlueprintPremium } from "../types/narrative-facts";
import type { VisualWorldContract, VisualWorldLocation } from "../visual-world/visual-world-contract";
import { selectBeatLocationFromVisualWorld } from "../visual-world/select-beat-location";

export function visualWorldLocationToEnvironmentDna(loc: VisualWorldLocation): EnvironmentVisualDna {
  return {
    locationName: loc.label,
    locationId: loc.id,
    anchorId: loc.id,
    visualAnchors: [...loc.visualAnchors].slice(0, 6),
    architectureHints: [...loc.architecture].slice(0, 6),
    atmosphere: [...loc.atmosphere].slice(0, 4),
    propAnchors: [...loc.recurringProps].slice(0, 6),
    lightingHints: [...loc.lighting].slice(0, 4),
    forbiddenDrift: [...loc.negativeConstraints].slice(0, 8),
  };
}

export type HydrateBlueprintsWithEnvironmentDnaInput = {
  blueprints: PanelBlueprintPremium[];
  visualWorld: VisualWorldContract | null | undefined;
  /** Premium : absence de binding lieu / lieu introuvable → erreur explicite. */
  strict?: boolean;
};

function mergeEnv(prev: EnvironmentVisualDna, next: EnvironmentVisualDna): EnvironmentVisualDna {
  return {
    locationName: prev.locationName?.trim() || next.locationName,
    locationId: prev.locationId?.trim() || next.locationId || next.anchorId || prev.anchorId || undefined,
    anchorId: prev.anchorId?.trim() || next.anchorId || null,
    visualAnchors:
      prev.visualAnchors && prev.visualAnchors.length > 0 ? prev.visualAnchors : next.visualAnchors,
    architectureHints:
      prev.architectureHints && prev.architectureHints.length > 0
        ? prev.architectureHints
        : next.architectureHints,
    atmosphere:
      prev.atmosphere && prev.atmosphere.length > 0 ? prev.atmosphere : next.atmosphere,
    propAnchors:
      prev.propAnchors && prev.propAnchors.length > 0 ? prev.propAnchors : next.propAnchors,
    lightingHints:
      prev.lightingHints && prev.lightingHints.length > 0 ? prev.lightingHints : next.lightingHints,
    forbiddenDrift: [
      ...new Set([...(prev.forbiddenDrift ?? []), ...(next.forbiddenDrift ?? [])]),
    ].slice(0, 10),
  };
}

/**
 * Pour chaque blueprint avec `beatId`, résout le lieu via `visualWorld` et remplit
 * `environmentVisualDna` si absent ou incomplet (fusion non destructive).
 */
export function hydrateBlueprintsWithEnvironmentDna(
  input: HydrateBlueprintsWithEnvironmentDnaInput,
): PanelBlueprintPremium[] {
  if (!input.visualWorld) return input.blueprints;
  const vw = input.visualWorld;

  return input.blueprints.map((bp) => {
    const loc = selectBeatLocationFromVisualWorld({ beatId: bp.beatId, visualWorld: vw });
    const next = visualWorldLocationToEnvironmentDna(loc);
    const prev = bp.environmentVisualDna;
    const base = !prev ? next : mergeEnv(prev, next);
    return {
      ...bp,
      environmentVisualDna: base,
      environmentAnchorId: base.anchorId ?? base.locationId ?? bp.environmentAnchorId ?? null,
    };
  });
}
