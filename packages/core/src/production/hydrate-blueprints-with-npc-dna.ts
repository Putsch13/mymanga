/**
 * Hydrate `npcVisualDna` (et entités assimilées PNJ) depuis un `VisualWorldContract`.
 * Ordre pipeline : après `hydrateBlueprintsWithPropDna`.
 */

import type { NpcVisualDna } from "../types/generation-debug-snapshot";
import type { PanelBlueprintPremium } from "../types/narrative-facts";
import type {
  CreatureVisualDna,
  FactionVisualDna,
  VehicleVisualDna,
  VisualWorldContract,
  VisualWorldNpcGroup,
} from "../visual-world/visual-world-contract";
import { bindingForBeat, linkedEntityIdsForBeat, npcIdsForBeat } from "./visual-world-beat-bindings";

export type HydrateBlueprintsWithNpcDnaInput = {
  blueprints: PanelBlueprintPremium[];
  visualWorld: VisualWorldContract | null | undefined;
  /** Groupe / créature id manquant → erreur (premium). */
  strict?: boolean;
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

function mergeNpcDna(existing: NpcVisualDna[] | undefined, added: NpcVisualDna[]): NpcVisualDna[] {
  const byId = new Map((existing ?? []).map((d) => [d.continuityId ?? d.displayName ?? "", { ...d }]));
  for (const d of added) {
    const key = d.continuityId ?? d.displayName ?? "";
    if (!key) continue;
    if (!byId.has(key)) byId.set(key, d);
  }
  return [...byId.values()];
}

export function hydrateBlueprintsWithNpcDna(
  input: HydrateBlueprintsWithNpcDnaInput,
): PanelBlueprintPremium[] {
  if (!input.visualWorld) return input.blueprints;
  const vw = input.visualWorld;
  const strict = input.strict === true;
  const npcById = new Map(vw.npcGroups.map((g) => [g.id, g]));
  const creatureById = new Map(vw.creatures.map((c) => [c.id, c]));
  const vehicleById = new Map(vw.vehicles.map((v) => [v.id, v]));
  const factionById = new Map(vw.factions.map((f) => [f.id, f]));

  return input.blueprints.map((bp) => {
    const bb = bindingForBeat(vw, bp.beatId);
    const npcIds = npcIdsForBeat(vw, bp.beatId, bb?.npcGroupIds ?? []);
    const creatureIds = linkedEntityIdsForBeat(vw.creatures, bp.beatId, bb?.creatureIds ?? []);
    const vehicleIds = linkedEntityIdsForBeat(vw.vehicles, bp.beatId, bb?.vehicleIds ?? []);
    const factionIds = linkedEntityIdsForBeat(vw.factions, bp.beatId, bb?.factionIds ?? []);

    const npcDnas: NpcVisualDna[] = [];
    for (const id of npcIds) {
      const g = npcById.get(id);
      if (!g) {
        if (strict) {
          throw new Error(`premium_visual_world_unknown_npc_group:${id}@${bp.beatId}`);
        }
        continue;
      }
      npcDnas.push(npcGroupToVisualDna(g));
    }
    for (const id of creatureIds) {
      const c = creatureById.get(id);
      if (!c) {
        if (strict) throw new Error(`premium_visual_world_unknown_creature:${id}@${bp.beatId}`);
        continue;
      }
      npcDnas.push(creatureToNpcDna(c));
    }
    for (const id of vehicleIds) {
      const v = vehicleById.get(id);
      if (!v) {
        if (strict) throw new Error(`premium_visual_world_unknown_vehicle:${id}@${bp.beatId}`);
        continue;
      }
      npcDnas.push(vehicleToNpcDna(v));
    }
    for (const id of factionIds) {
      const f = factionById.get(id);
      if (!f) {
        if (strict) throw new Error(`premium_visual_world_unknown_faction:${id}@${bp.beatId}`);
        continue;
      }
      npcDnas.push(factionToNpcDna(f));
    }

    const merged = mergeNpcDna(bp.npcVisualDna, npcDnas);
    return npcDnas.length === 0 ? bp : { ...bp, npcVisualDna: merged };
  });
}
