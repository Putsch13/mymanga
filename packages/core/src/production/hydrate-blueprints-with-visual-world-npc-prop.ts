/**
 * Hydrate `npcVisualDna` et `requiredProps` depuis un `VisualWorldContract`
 * (beatBindings → groupes PNJ / props liés au beat du panel).
 */

import type { NpcVisualDna } from "../types/generation-debug-snapshot";
import type { PanelBlueprintPremium, RequiredProp } from "../types/narrative-facts";
import type {
  CreatureVisualDna,
  FactionVisualDna,
  VehicleVisualDna,
  VisualWorldContract,
  VisualWorldNpcGroup,
  VisualWorldPropDna,
} from "../visual-world/visual-world-contract";

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

function creatureToNpcDna(c: CreatureVisualDna): NpcVisualDna {
  return {
    continuityId: c.id,
    displayName: c.label,
    category: "creature",
    visualMarkers: [c.visualDescription.trim()],
  };
}

function vehicleToNpcDna(v: VehicleVisualDna): NpcVisualDna {
  return {
    continuityId: v.id,
    displayName: v.label,
    category: "vehicle",
    visualMarkers: [v.visualDescription.trim()],
  };
}

function factionToNpcDna(f: FactionVisualDna): NpcVisualDna {
  const markers = [...f.visualMarkers.map((s) => s.trim()).filter(Boolean), f.label.trim()].filter(
    (s, i, a) => a.indexOf(s) === i,
  );
  return {
    continuityId: f.id,
    displayName: f.label,
    category: "faction",
    visualMarkers: markers.length > 0 ? markers : [f.label],
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

/** Ids liés au beat : explicites sur `beatBinding` + entités dont `requiredBeatIds` contient ce beat. */
function linkedEntityIdsForBeat<T extends { id: string; requiredBeatIds: string[] }>(
  entities: readonly T[],
  beatId: string,
  bindingIds: readonly string[],
): string[] {
  const set = new Set<string>(bindingIds);
  for (const e of entities) {
    if (e.requiredBeatIds.includes(beatId)) set.add(e.id);
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
  const creatureById = new Map(vw.creatures.map((c) => [c.id, c]));
  const vehicleById = new Map(vw.vehicles.map((v) => [v.id, v]));
  const factionById = new Map(vw.factions.map((f) => [f.id, f]));

  return input.blueprints.map((bp) => {
    const bb = bindingForBeat(vw, bp.beatId);
    const npcIds = npcIdsForBeat(vw, bp.beatId, bb?.npcGroupIds ?? []);
    const propIds = propIdsForBeat(vw, bp.beatId, bb?.primaryPropIds ?? []);
    const creatureIds = linkedEntityIdsForBeat(vw.creatures, bp.beatId, bb?.creatureIds ?? []);
    const vehicleIds = linkedEntityIdsForBeat(vw.vehicles, bp.beatId, bb?.vehicleIds ?? []);
    const factionIds = linkedEntityIdsForBeat(vw.factions, bp.beatId, bb?.factionIds ?? []);

    const npcDnas: NpcVisualDna[] = [];
    for (const id of npcIds) {
      const g = npcById.get(id);
      if (g) npcDnas.push(npcGroupToVisualDna(g));
    }
    for (const id of creatureIds) {
      const c = creatureById.get(id);
      if (c) npcDnas.push(creatureToNpcDna(c));
    }
    for (const id of vehicleIds) {
      const v = vehicleById.get(id);
      if (v) npcDnas.push(vehicleToNpcDna(v));
    }
    for (const id of factionIds) {
      const f = factionById.get(id);
      if (f) npcDnas.push(factionToNpcDna(f));
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
