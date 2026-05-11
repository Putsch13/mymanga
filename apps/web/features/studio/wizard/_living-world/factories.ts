import type {
  ChapterWorldCreatureContract,
  ChapterWorldFactionContract,
  ChapterWorldNpcContract,
  ChapterWorldPropContract,
  ChapterWorldVehicleContract,
} from "@manga-ai-studio/core";

import { newId } from "./utils";

export function createNpc(): ChapterWorldNpcContract {
  return {
    id: newId(),
    label: "Nouveau PNJ",
    narrativeRole: null,
    appearance: null,
    behavior: null,
    panelMoments: [],
    recurrence: "one_shot",
  };
}

export function createCreature(): ChapterWorldCreatureContract {
  return {
    id: newId(),
    label: "Nouvelle créature",
    species: null,
    sizeLabel: null,
    silhouette: null,
    powers: null,
    behavior: null,
    threatLevel: "medium",
    revealMoment: null,
    recurrence: "unique",
  };
}

export function createProp(): ChapterWorldPropContract {
  return {
    id: newId(),
    name: "Nouvel objet",
    ownerCharacterId: null,
    ownerLabel: null,
    visualDescription: null,
    narrativeFunction: null,
    momentHints: [],
    continuityRules: [],
  };
}

export function createVehicle(): ChapterWorldVehicleContract {
  return {
    id: newId(),
    label: "Nouveau véhicule",
    type: null,
    design: null,
    ownerLabel: null,
    condition: null,
    sceneFunction: null,
  };
}

export function createFaction(): ChapterWorldFactionContract {
  return {
    id: newId(),
    name: "Nouvelle faction",
    symbol: null,
    uniform: null,
    colors: [],
    storyRole: null,
    visibleMembersNote: null,
  };
}
