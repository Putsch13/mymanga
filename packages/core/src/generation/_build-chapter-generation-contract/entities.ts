import type { ContractCharacterVisualDna } from "../../characters/merge-character-visual-dna";
import {
  bindingForBeat,
  linkedEntityIdsForBeat,
  npcIdsForBeat,
} from "../../production/visual-world-beat-bindings";
import type { PanelBlueprintPremium } from "../../types/narrative-facts";
import type { VisualWorldContract } from "../../visual-world/visual-world-contract";
import type {
  ContractBeat,
  ContractCharacter,
  ContractCreature,
  ContractFaction,
  ContractLocation,
  ContractNpcGroup,
  ContractProp,
  ContractVehicle,
} from "../chapter-generation-contract";

import type {
  BuildChapterGenerationContractOutlineBeat,
  PipelineCharacterLike,
  PipelineLocationLike,
} from "./types";
import { mapRole, normalizeName } from "./utils";

export function buildContractCharacters(
  characters: PipelineCharacterLike[],
  heroCharacterId: string | null,
  focusCharacterIds: string[],
): ContractCharacter[] {
  return characters.map((c) => {
    const visualDna: ContractCharacterVisualDna = {
      hairColor: c.hairColor ?? null,
      eyeColor: c.eyeColor ?? null,
      hairStyle: c.hairStyle ?? null,
      skinTone: c.skinTone ?? null,
      outfitSignature: c.outfitSignature ?? null,
      distinctiveTraits: [
        ...(Array.isArray(c.accessories) ? c.accessories : []),
        ...(Array.isArray(c.distinctiveMarks) ? c.distinctiveMarks : []),
      ].filter(Boolean),
      silhouette: null,
      ageAppearance: c.ageApparent ?? null,
      bodyType: c.bodyType ?? null,
    };
    return {
      characterId: c.id,
      name: c.name,
      normalizedName: normalizeName(c.name),
      role: mapRole(c.id, heroCharacterId, focusCharacterIds),
      visualDna,
      faceRefUrl: c.faceRefUrl ?? null,
      silhouetteRefUrl: c.silhouetteRefUrl ?? null,
      loraUrl: c.loraUrl ?? null,
      loraTriggerWord: c.loraTriggerWord ?? null,
      loraScale: c.loraScale ?? undefined,
      canonLocked: Boolean(c.canonLocked),
      forbiddenDrift: Array.isArray(c.forbiddenVisualDrift)
        ? c.forbiddenVisualDrift.filter((x): x is string => typeof x === "string")
        : [],
      source: "current_chapter",
      confidence: 1,
    };
  });
}

export function buildContractLocations(locations: PipelineLocationLike[]): ContractLocation[] {
  return locations.map((loc) => ({
    locationId: loc.id,
    name: loc.name ?? loc.id,
    normalizedName: normalizeName(loc.name ?? loc.id),
    visualDescription:
      typeof loc.visualDescription === "string" && loc.visualDescription.trim()
        ? loc.visualDescription.trim()
        : `Location ${loc.name ?? loc.id}`,
    refUrl: null,
    atmosphereHints: [],
    lightingHints: [],
    required: true,
    source: "location_canon",
    confidence: 0.9,
  }));
}

export function buildContractBeats(
  outlineBeats: BuildChapterGenerationContractOutlineBeat[],
  vw: VisualWorldContract | null,
): ContractBeat[] {
  return outlineBeats.map((b, idx) => {
    const bb = vw ? bindingForBeat(vw, b.id) : undefined;
    const npcGroupIds = vw ? npcIdsForBeat(vw, b.id, bb?.npcGroupIds ?? []) : [];
    const creatureIds = vw
      ? linkedEntityIdsForBeat(vw.creatures, b.id, bb?.creatureIds ?? [])
      : [];
    const vehicleIds = vw
      ? linkedEntityIdsForBeat(vw.vehicles, b.id, bb?.vehicleIds ?? [])
      : [];
    const factionIds = vw
      ? linkedEntityIdsForBeat(vw.factions, b.id, bb?.factionIds ?? [])
      : [];
    const beatPropIds = bb?.primaryPropIds?.length ? [...bb.primaryPropIds] : [];
    return {
      beatId: b.id,
      beatNumber: idx + 1,
      summary: b.summary,
      emotionalIntent:
        typeof b.emotionalDelta === "number" ? `delta_${b.emotionalDelta}` : "neutral",
      requiredCharacterIds: Array.isArray(b.characters) ? b.characters : [],
      requiredLocationId:
        typeof bb?.locationId === "string" && bb.locationId.trim() ? bb.locationId.trim() : null,
      requiredProps: beatPropIds,
      requiredNpcGroups: npcGroupIds,
      requiredCreatures: creatureIds,
      requiredVehicles: vehicleIds,
      requiredFactions: factionIds,
      visualEvents: [],
      dialogueRequired: false,
    };
  });
}

export function buildContractProps(panelBlueprints: PanelBlueprintPremium[]): ContractProp[] {
  const propsByKey = new Map<string, ContractProp>();
  for (const bp of panelBlueprints) {
    for (const rp of bp.requiredProps ?? []) {
      const key = `${bp.beatId}:${rp.canonicalName}`;
      if (propsByKey.has(key)) continue;
      propsByKey.set(key, {
        propId: `prop_${bp.beatId}_${normalizeName(rp.canonicalName)}`,
        label: rp.canonicalName,
        normalizedLabel: normalizeName(rp.canonicalName),
        visualDescription: rp.canonicalName,
        sourceBeatId: bp.beatId,
        required: Boolean(rp.mustBeVisible ?? true),
        source: "current_chapter",
        sourceText: rp.canonicalName,
        confidence: typeof rp.confidence === "number" ? rp.confidence : 0.85,
      });
    }
  }
  return [...propsByKey.values()];
}

export function buildVisualWorldEntities(vw: VisualWorldContract | null) {
  const npcGroups: ContractNpcGroup[] = vw
    ? vw.npcGroups.map((g) => ({
        groupId: g.id,
        label: g.label,
        normalizedLabel: normalizeName(g.label),
        visualDescription: [g.role, g.visualProfile, g.outfit, g.silhouette]
          .filter(Boolean)
          .join(" · ")
          .slice(0, 800),
        minCount: 1,
        maxCount: 24,
        sourceBeatId: g.requiredBeatIds[0],
      }))
    : [];

  const creatures: ContractCreature[] = vw
    ? vw.creatures.map((c) => ({
        creatureId: c.id,
        label: c.label,
        normalizedLabel: normalizeName(c.label),
        visualDescription: c.visualDescription,
        sourceBeatId: c.requiredBeatIds[0],
        refUrl: null,
      }))
    : [];

  const vehicles: ContractVehicle[] = vw
    ? vw.vehicles.map((v) => ({
        vehicleId: v.id,
        label: v.label,
        normalizedLabel: normalizeName(v.label),
        visualDescription: v.visualDescription,
        sourceBeatId: v.requiredBeatIds[0],
        refUrl: null,
      }))
    : [];

  const factions: ContractFaction[] = vw
    ? vw.factions.map((f) => ({
        factionId: f.id,
        label: f.label,
        normalizedLabel: normalizeName(f.label),
        visualDescription: [...f.visualMarkers, ...f.visualMotifs, ...f.colors]
          .filter(Boolean)
          .join(" · ")
          .slice(0, 800),
        sourceBeatId: f.requiredBeatIds[0],
        refUrl: null,
      }))
    : [];

  return { npcGroups, creatures, vehicles, factions };
}
