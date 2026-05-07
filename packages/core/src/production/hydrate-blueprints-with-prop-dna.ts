/**
 * Hydrate `requiredProps`, `propVisualDna` et `continuityObjectIds` depuis un `VisualWorldContract`.
 * Ordre pipeline : après `hydrateBlueprintsWithCharacterDna` et `hydrateBlueprintsWithEnvironmentDna`.
 */

import type { BlueprintPropVisualDna, PanelBlueprintPremium, RequiredProp } from "../types/narrative-facts";
import type { VisualWorldContract, VisualWorldPropDna } from "../visual-world/visual-world-contract";
import { bindingForBeat, propIdsForBeat } from "./visual-world-beat-bindings";

export type HydrateBlueprintsWithPropDnaInput = {
  blueprints: PanelBlueprintPremium[];
  visualWorld: VisualWorldContract | null | undefined;
  /** Prop id référencé mais absent du contrat → erreur (premium). */
  strict?: boolean;
};

function visualWorldPropToRequiredProp(p: VisualWorldPropDna, beatId: string): RequiredProp {
  const ownerCategory =
    p.ownerCharacterId ? "npc" as const
    : p.locationId ? "ambient" as const
    : "unassigned" as const;
  const visibilityModeFromPolicy =
    p.visibilityPolicy === "visible"
      ? "foreground_insert" as const
      : p.visibilityPolicy === "mentioned"
        ? "background_support" as const
        : p.visibilityPolicy === "background"
          ? "background_support" as const
          : undefined;
  return {
    id: p.id,
    canonicalName: p.canonicalName,
    aliases: [],
    category: p.category,
    narrativeRole: "worldbuilding",
    requiredForBeatIds: p.requiredBeatIds.length > 0 ? p.requiredBeatIds : [beatId],
    visibilityMode: visibilityModeFromPolicy
      ?? (p.continuityPolicy === "symbolic" ? "foreground_insert" : "background_support"),
    mustBeVisible: p.continuityPolicy !== "single_use",
    confidence: 0.88,
    source: "visual_world_contract",
    ownerCategory,
    ownerId: p.ownerCharacterId ?? null,
  };
}

function propToBlueprintVisualDna(p: VisualWorldPropDna): BlueprintPropVisualDna {
  return {
    id: p.id,
    canonicalName: p.canonicalName,
    category: p.category,
    visualDescription: p.visualDescription,
    visibilityPolicy: (p.visibilityPolicy ?? undefined) as BlueprintPropVisualDna["visibilityPolicy"],
    symbolicMeaning: p.symbolicMeaning?.trim() || undefined,
  };
}

function mergeRequiredProps(existing: RequiredProp[] | undefined, added: RequiredProp[]): RequiredProp[] {
  const byId = new Map((existing ?? []).map((p) => [p.id, { ...p }]));
  for (const p of added) {
    if (!byId.has(p.id)) byId.set(p.id, p);
  }
  return [...byId.values()];
}

function mergePropVisualDna(
  existing: BlueprintPropVisualDna[] | undefined,
  added: BlueprintPropVisualDna[],
): BlueprintPropVisualDna[] {
  const byId = new Map((existing ?? []).map((p) => [p.id, { ...p }]));
  for (const p of added) {
    if (!byId.has(p.id)) byId.set(p.id, p);
  }
  return [...byId.values()];
}

export function hydrateBlueprintsWithPropDna(
  input: HydrateBlueprintsWithPropDnaInput,
): PanelBlueprintPremium[] {
  if (!input.visualWorld) return input.blueprints;
  const vw = input.visualWorld;
  const strict = input.strict === true;
  const propById = new Map(vw.props.map((p) => [p.id, p]));

  return input.blueprints.map((bp) => {
    const bb = bindingForBeat(vw, bp.beatId);
    const propIds = propIdsForBeat(vw, bp.beatId, bb?.primaryPropIds ?? []);

    const reqProps: RequiredProp[] = [];
    const pvd: BlueprintPropVisualDna[] = [];
    for (const id of propIds) {
      const p = propById.get(id);
      if (!p) {
        if (strict) {
          throw new Error(`premium_visual_world_unknown_prop:${id}@${bp.beatId}`);
        }
        continue;
      }
      reqProps.push(visualWorldPropToRequiredProp(p, bp.beatId));
      pvd.push(propToBlueprintVisualDna(p));
    }

    if (reqProps.length === 0 && pvd.length === 0) return bp;

    return {
      ...bp,
      requiredProps: mergeRequiredProps(bp.requiredProps, reqProps),
      propVisualDna: mergePropVisualDna(bp.propVisualDna, pvd),
      ...(propIds.length > 0
        ? {
            continuityObjectIds: [...new Set([...(bp.continuityObjectIds ?? []), ...propIds])],
          }
        : {}),
    };
  });
}
