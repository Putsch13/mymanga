/**
 * Hydrate `environmentVisualDna` / ancrage décor depuis un `VisualWorldContract`
 * (après merge canonique + DNA personnages si applicable).
 */

import type { EnvironmentVisualDna } from "../types/generation-debug-snapshot";
import type { LocationCanon } from "../types/chapter-studio";
import type { PanelBlueprintPremium } from "../types/narrative-facts";
import type { VisualWorldContract, VisualWorldLocation } from "../visual-world/visual-world-contract";
import { trySelectBeatLocationFromVisualWorld } from "../visual-world/select-beat-location";
import { bindingForBeat } from "./visual-world-beat-bindings";

export class MissingVisualWorldError extends Error {
  override name = "MissingVisualWorldError" as const;
  constructor(public code: string) {
    super(`MissingVisualWorldError: ${code}`);
  }
}

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

export function locationCanonToEnvironmentDna(canon: LocationCanon): EnvironmentVisualDna {
  return {
    locationName: canon.label,
    locationId: canon.locationId,
    anchorId: canon.locationId,
    visualAnchors: [...canon.visualMarkers].slice(0, 6),
    architectureHints: [...canon.architecture].slice(0, 6),
    atmosphere: [...canon.atmosphere].slice(0, 4),
    propAnchors: [],
    lightingHints: [...(canon.lightingRules ?? [])].slice(0, 4),
    forbiddenDrift: [...canon.forbiddenDrift].slice(0, 8),
  };
}

export type HydrateBlueprintsWithEnvironmentDnaInput = {
  blueprints: PanelBlueprintPremium[];
  visualWorld: VisualWorldContract | null | undefined;
  /** Fallback location canons when visualWorld is absent (non-strict only). */
  locationCanons?: LocationCanon[];
  /** Premium : absence de VisualWorld → throw MissingVisualWorldError. */
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
  if (!input.visualWorld) {
    if (input.strict) {
      throw new MissingVisualWorldError("premium_visual_world_required");
    }
    const canons = input.locationCanons ?? [];
    if (canons.length === 0) return input.blueprints;
    const primary = canons.find((c) => c.isPrimary) ?? canons[0];
    const fallbackDna = locationCanonToEnvironmentDna(primary);
    console.info(
      `[env-dna] fallback_from_location_canon label="${primary.label}" ` +
      `blueprints=${input.blueprints.length} canons=${canons.length}`,
    );
    return input.blueprints.map((bp) =>
      bp.environmentVisualDna
        ? bp
        : {
            ...bp,
            environmentVisualDna: fallbackDna,
            environmentAnchorId: fallbackDna.anchorId ?? fallbackDna.locationId ?? bp.environmentAnchorId ?? null,
          },
    );
  }
  const vw = input.visualWorld;

  return input.blueprints.map((bp) => {
    const loc = trySelectBeatLocationFromVisualWorld({ beatId: bp.beatId, visualWorld: vw });
    if (!loc) {
      // FIX-18 (MOD) — En premium (strict), un beat sans lieu résolvable
      // dans le VisualWorld est BLOQUANT : on ne veut pas qu'un panel
      // arrive en rendu sans environmentVisualDna. En non-strict on
      // retombe silencieusement (legacy).
      if (input.strict) {
        throw new MissingVisualWorldError(`missing_location_for_beat:${bp.beatId}`);
      }
      return bp;
    }
    const bb = bindingForBeat(vw, bp.beatId);
    const next = visualWorldLocationToEnvironmentDna(loc);
    const prev = bp.environmentVisualDna;
    let base = !prev ? next : mergeEnv(prev, next);
    if (bb?.environmentMood?.trim()) {
      base = { ...base, environmentMood: bb.environmentMood.trim() };
    }
    if (bb?.continuityObjectIds && bb.continuityObjectIds.length > 0) {
      base = {
        ...base,
        continuityObjectIds: [
          ...new Set([...(base.continuityObjectIds ?? []), ...bb.continuityObjectIds]),
        ],
      };
    }
    const mergedPanelContinuity =
      bb?.continuityObjectIds?.length
        ? [...new Set([...(bp.continuityObjectIds ?? []), ...bb.continuityObjectIds])]
        : bp.continuityObjectIds;
    return {
      ...bp,
      environmentVisualDna: base,
      environmentAnchorId: base.anchorId ?? base.locationId ?? bp.environmentAnchorId ?? null,
      ...(mergedPanelContinuity && mergedPanelContinuity.length > 0
        ? { continuityObjectIds: mergedPanelContinuity }
        : {}),
    };
  });
}
