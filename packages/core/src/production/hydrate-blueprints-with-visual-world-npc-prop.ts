/**
 * Hydrate `npcVisualDna` et `requiredProps` depuis un `VisualWorldContract`
 * (beatBindings → groupes PNJ / props liés au beat du panel).
 */

import type { NpcVisualDna } from "../types/generation-debug-snapshot";
import type { PanelBlueprintPremium, RequiredProp } from "../types/narrative-facts";
import type { VisualWorldContract, VisualWorldNpcGroup, VisualWorldPropDna } from "../visual-world/visual-world-contract";

export type HydrateBlueprintsWithVisualWorldNpcPropInput = {
  blueprints: PanelBlueprintPremium[];
  visualWorld: VisualWorldContract | null | undefined;
};

function npcGroupToVisualDna(g: VisualWorldNpcGroup): NpcVisualDna {
  const markers = [g.visualProfile, g.outfit, g.silhouette].filter((s) => s.trim().length > 0);
  if (g.relationToLocation?.trim()) markers.push(`lieu: ${g.relationToLocation.trim()}`);
  return {
    continuityId: g.id,
    displayName: g.label,
    category: g.role,
    visualMarkers: markers,
    forbiddenDrift: undefined,
  };
}

function visualWorldPropToRequiredProp(p: VisualWorldPropDna, beatId: string): RequiredProp {
  const ownerCategory =
    p.ownerCharacterId ? "npc" as const
    : p.locationId ? "ambient" as const
    : "unassigned" as const;
  return {
    id: p.id,
    canonicalName: p.canonicalName,
    aliases: [],
    category: p.category,
    narrativeRole: "worldbuilding",
    requiredForBeatIds: p.requiredBeatIds.length > 0 ? p.requiredBeatIds : [beatId],
    visibilityMode: p.continuityPolicy === "symbolic" ? "foreground_insert" : "background_support",
    mustBeVisible: p.continuityPolicy !== "single_use",
    confidence: 0.88,
    source: "visual_world_contract",
    ownerCategory,
    ownerId: p.ownerCharacterId ?? null,
  };
}

function bindingForBeat(vw: VisualWorldContract, beatId: string) {
  return vw.beatBindings.find((b) => b.beatId === beatId);
}

function propIdsForBeat(vw: VisualWorldContract, beatId: string, primaryIds: string[]): string[] {
  const set = new Set(primaryIds);
  for (const p of vw.props) {
    if (p.requiredBeatIds.includes(beatId)) set.add(p.id);
  }
  return [...set];
}

function npcIdsForBeat(vw: VisualWorldContract, beatId: string, bindingNpcIds: string[]): string[] {
  const set = new Set(bindingNpcIds);
  for (const g of vw.npcGroups) {
    if (g.requiredBeatIds.includes(beatId)) set.add(g.id);
  }
  return [...set];
}

function mergeNpcDna(existing: NpcVisualDna[] | undefined, added: NpcVisualDna[]): NpcVisualDna[] {
  const byId = new Map((existing ?? []).map((d) => [d.continuityId ?? d.displayName ?? "", { ...d }]));
  for (const d of added) {
    const key = d.continuityId ?? d.displayName ?? "";
    if (!key) continue;
    if (!byId.has(key)) byId.set(key, d);
  }
  return [...byId.values()];
}

function mergeRequiredProps(existing: RequiredProp[] | undefined, added: RequiredProp[]): RequiredProp[] {
  const byId = new Map((existing ?? []).map((p) => [p.id, { ...p }]));
  for (const p of added) {
    if (!byId.has(p.id)) byId.set(p.id, p);
  }
  return [...byId.values()];
}

/**
 * Ajoute sur chaque blueprint les entrées `npcVisualDna` et `requiredProps`
 * issues du contrat monde visuel pour le `beatId` du panel.
 */
export function hydrateBlueprintsWithVisualWorldNpcAndProps(
  input: HydrateBlueprintsWithVisualWorldNpcPropInput,
): PanelBlueprintPremium[] {
  if (!input.visualWorld) return input.blueprints;
  const vw = input.visualWorld;
  const npcById = new Map(vw.npcGroups.map((g) => [g.id, g]));
  const propById = new Map(vw.props.map((p) => [p.id, p]));

  return input.blueprints.map((bp) => {
    const bb = bindingForBeat(vw, bp.beatId);
    const npcIds = npcIdsForBeat(vw, bp.beatId, bb?.npcGroupIds ?? []);
    const propIds = propIdsForBeat(vw, bp.beatId, bb?.primaryPropIds ?? []);

    const npcDnas: NpcVisualDna[] = [];
    for (const id of npcIds) {
      const g = npcById.get(id);
      if (g) npcDnas.push(npcGroupToVisualDna(g));
    }

    const reqProps: RequiredProp[] = [];
    for (const id of propIds) {
      const p = propById.get(id);
      if (p) reqProps.push(visualWorldPropToRequiredProp(p, bp.beatId));
    }

    if (npcDnas.length === 0 && reqProps.length === 0) return bp;

    return {
      ...bp,
      npcVisualDna: mergeNpcDna(bp.npcVisualDna, npcDnas),
      requiredProps: mergeRequiredProps(bp.requiredProps, reqProps),
    };
  });
}
