import {
  bindingForBeat,
  linkedEntityIdsForBeat,
  npcIdsForBeat,
} from "../../production/visual-world-beat-bindings";
import type { PanelBlueprintPremium } from "../../types/narrative-facts";
import type { VisualWorldContract } from "../../visual-world/visual-world-contract";
import type {
  ContractCharacterRef,
  PanelGenerationContract,
  PanelPromptConstraints,
} from "../chapter-generation-contract";

import type { PipelineCharacterLike } from "./types";
import { mapPanelNarrativeRole, mapRole, padMicroAction, panelTextFromBlueprint } from "./utils";

export function buildPanelContracts(
  panelBlueprints: PanelBlueprintPremium[],
  characters: PipelineCharacterLike[],
  heroCharacterId: string | null,
  focusCharacterIds: string[],
  vw: VisualWorldContract | null,
): PanelGenerationContract[] {
  const charById = new Map(characters.map((c) => [c.id, c]));

  return panelBlueprints.map((bp, idx) => {
    const narrativeRole = mapPanelNarrativeRole(bp);
    const textContract = panelTextFromBlueprint(bp.panelId, bp);
    const requiredChars: ContractCharacterRef[] = [];

    const ids = [
      ...(bp.mustShowCharacterIds ?? []),
      ...(bp.requiredCharacterIds ?? []),
    ];
    const uniqueIds = [...new Set(ids.filter(Boolean))];
    for (const id of uniqueIds) {
      const row = charById.get(id);
      if (!row) continue;
      requiredChars.push({
        characterId: row.id,
        name: row.name,
        role: mapRole(row.id, heroCharacterId, focusCharacterIds),
        visualDna: {
          hairColor: row.hairColor ?? null,
          eyeColor: row.eyeColor ?? null,
          hairStyle: row.hairStyle ?? null,
          skinTone: row.skinTone ?? null,
          outfitSignature: row.outfitSignature ?? null,
        },
      });
    }

    const mustShow = [
      ...(bp.mustShowCharacterIds ?? []),
      ...(bp.requiredLocationSignals ?? []),
      ...(bp.requiredProps ?? []).map((p) => p.canonicalName),
    ];

    const promptConstraints: PanelPromptConstraints = {
      mustShow,
      mustNotShow: [],
      forbiddenDrift: requiredChars.flatMap((c) => {
        const full = charById.get(c.characterId);
        return Array.isArray(full?.forbiddenVisualDrift)
          ? full!.forbiddenVisualDrift!.filter((x): x is string => typeof x === "string")
          : [];
      }),
    };

    const binding = vw ? bindingForBeat(vw, bp.beatId) : undefined;
    const envLoc =
      typeof bp.environmentVisualDna?.locationId === "string" &&
      bp.environmentVisualDna.locationId.trim()
        ? bp.environmentVisualDna.locationId.trim()
        : null;
    const anchorLoc =
      typeof bp.environmentAnchorId === "string" && bp.environmentAnchorId.trim()
        ? bp.environmentAnchorId.trim()
        : null;
    const bindingLoc =
      typeof binding?.locationId === "string" && binding.locationId.trim()
        ? binding.locationId.trim()
        : null;
    const resolvedLocationId = envLoc || anchorLoc || bindingLoc || null;
    const panelNpcIds = vw ? npcIdsForBeat(vw, bp.beatId, binding?.npcGroupIds ?? []) : [];
    const panelCreatureIds = vw
      ? linkedEntityIdsForBeat(vw.creatures, bp.beatId, binding?.creatureIds ?? [])
      : [];
    const panelVehicleIds = vw
      ? linkedEntityIdsForBeat(vw.vehicles, bp.beatId, binding?.vehicleIds ?? [])
      : [];
    const panelFactionIds = vw
      ? linkedEntityIdsForBeat(vw.factions, bp.beatId, binding?.factionIds ?? [])
      : [];

    return {
      panelId: bp.panelId,
      panelNumber: bp.panelNumber ?? idx + 1,
      pageNumber: typeof bp.pageNumber === "number" ? bp.pageNumber : 1,
      sourceBeatId: bp.beatId,
      narrativeRole,
      microAction: padMicroAction(bp.purpose || "panel manga"),
      visualSubject: String(bp.subjectFocus ?? bp.purpose ?? "scene").slice(0, 200),
      emotionalIntent: undefined,
      requiredVisualEventIds: [],
      requiredCharacters: requiredChars,
      optionalCharacters: [],
      requiredLocationId: resolvedLocationId,
      requiredLocationSignals: [...(bp.requiredLocationSignals ?? [])],
      requiredProps: (bp.requiredProps ?? []).map((p) => p.canonicalName),
      requiredNpcGroups: panelNpcIds,
      requiredCreatures: panelCreatureIds,
      requiredVehicles: panelVehicleIds,
      requiredFactions: panelFactionIds,
      textContract,
      promptConstraints,
    };
  });
}
