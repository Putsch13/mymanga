/**
 * Hydrate les ADN monde depuis un `VisualWorldContract` :
 * - `npcVisualDna` : groupes PNJ uniquement
 * - `creatureVisualDna` / `vehicleVisualDna` / `factionVisualDna` : tableaux dédiés (P0.12)
 *
 * Ordre pipeline : après `hydrateBlueprintsWithPropDna`.
 *
 * **API préférée** : `hydrateBlueprintsWithWorldEntities` depuis
 * `hydrate-blueprints-with-world-entities.ts` (même signature, alias exporté).
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
    relationToCharacterIds: g.relationToCharacterIds.length > 0 ? [...g.relationToCharacterIds] : undefined,
    relationToLocation: g.relationToLocation?.trim() || null,
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

function mergeWorldEntityById<T extends { id: string }>(existing: T[] | undefined, added: T[]): T[] {
  const byId = new Map((existing ?? []).map((e) => [e.id, { ...e } as T]));
  for (const e of added) {
    const id = e.id?.trim();
    if (!id) continue;
    if (!byId.has(id)) byId.set(id, e);
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

    const creatureDnas: CreatureVisualDna[] = [];
    for (const id of creatureIds) {
      const c = creatureById.get(id);
      if (!c) {
        if (strict) throw new Error(`premium_visual_world_unknown_creature:${id}@${bp.beatId}`);
        continue;
      }
      creatureDnas.push(c);
    }

    const vehicleDnas: VehicleVisualDna[] = [];
    for (const id of vehicleIds) {
      const v = vehicleById.get(id);
      if (!v) {
        if (strict) throw new Error(`premium_visual_world_unknown_vehicle:${id}@${bp.beatId}`);
        continue;
      }
      vehicleDnas.push(v);
    }

    const factionDnas: FactionVisualDna[] = [];
    for (const id of factionIds) {
      const f = factionById.get(id);
      if (!f) {
        if (strict) throw new Error(`premium_visual_world_unknown_faction:${id}@${bp.beatId}`);
        continue;
      }
      factionDnas.push(f);
    }

    if (npcDnas.length === 0 && creatureDnas.length === 0 && vehicleDnas.length === 0 && factionDnas.length === 0) {
      return bp;
    }

    return {
      ...bp,
      npcVisualDna: mergeNpcDna(bp.npcVisualDna, npcDnas),
      creatureVisualDna: mergeWorldEntityById(bp.creatureVisualDna, creatureDnas),
      vehicleVisualDna: mergeWorldEntityById(bp.vehicleVisualDna, vehicleDnas),
      factionVisualDna: mergeWorldEntityById(bp.factionVisualDna, factionDnas),
    };
  });
}
