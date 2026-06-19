/**
 * Continuity — builders du kernel de continuité.
 *
 * Extrait de continuity-persistence-kernel.ts. Transforme la StoryBible,
 * les personnages, les locations et les arcs du projet en structures stables
 * consommables par le kernel (loadContinuityKernel).
 *
 * Pure : pas de Prisma, uniquement des mappings.
 */

import type {
  ArcRegistryEntry,
  CharacterState,
  LocationState,
  StoryBibleKernel,
  WorldState,
} from "../types";
import { asRecord, asStringArray, uniq } from "./utils";

export function buildStoryBibleKernel(
  storyBible:
    | {
        summary?: string | null;
        themes?: unknown;
        worldRules?: unknown;
        lore?: unknown;
        lockedCanon?: unknown;
      }
    | null
    | undefined,
  projectTone?: string | null,
): StoryBibleKernel {
  const loreRecord = asRecord(storyBible?.lore);
  const lockedCanonRecord = asRecord(storyBible?.lockedCanon);
  return {
    summary: storyBible?.summary ?? null,
    themes: asStringArray(storyBible?.themes),
    worldRules: [
      ...asStringArray(storyBible?.worldRules),
      ...asStringArray(loreRecord.hardRules).map((rule) => String(rule)),
    ],
    loreFacts: [
      ...asStringArray(loreRecord.worldFacts),
      ...asStringArray(loreRecord.locations),
    ],
    lockedCanonFacts: [
      ...asStringArray(lockedCanonRecord.facts),
      ...asStringArray(lockedCanonRecord.constraints),
    ],
    globalTone: projectTone ?? null,
  };
}

export function buildFallbackCharacterState(character: {
  id: string;
  name: string;
  roleType: string | null;
  emotionalState: string | null;
  objective: string | null;
  fear: string | null;
  outfitDefault?: string | null;
  hairColor?: string | null;
  eyeColor?: string | null;
  traits?: unknown;
  biography?: string | null;
}): CharacterState {
  return {
    characterId: character.id,
    identity: {
      stableName: character.name,
      roleType: character.roleType ?? null,
    },
    appearanceLocked: {
      hairColor: character.hairColor ?? null,
      eyeColor: character.eyeColor ?? null,
      silhouette: null,
      scars: [],
      tattoos: [],
      fixedAccessories: [],
      forbiddenVisualDrift: [],
    },
    psychologicalCanon: {
      coreTraits: asStringArray(character.traits),
      fears: character.fear ? [character.fear] : [],
      motivations: character.objective ? [character.objective] : [],
      speechRules: [],
    },
    physicalCanon: {
      baselineOutfit: character.outfitDefault ?? null,
      allowedOutfitVariations: [],
      bodyMarkers: [],
    },
    currentState: {
      location: null,
      outfit: character.outfitDefault ?? null,
      injuries: [],
      fatigue: null,
      emotion: character.emotionalState ?? null,
      objective: character.objective ?? null,
      possessions: [],
      knowledge: [],
      obligations: [],
    },
    continuityObligations: [],
    relationshipStates: [],
  };
}

export function mergeWorldState(
  previous: unknown,
  storyBible: StoryBibleKernel,
  project: {
    tone?: string | null;
    primaryGenre?: string | null;
    relationships?: Array<{ relationType: string }>;
  },
): WorldState {
  const prev = asRecord(previous);
  return {
    currentDateLabel: typeof prev.currentDateLabel === "string" ? prev.currentDateLabel : null,
    activeLocations: asStringArray(prev.activeLocations),
    activeThreats: asStringArray(prev.activeThreats),
    activeMysteries: asStringArray(prev.activeMysteries),
    factions: uniq([
      ...asStringArray(prev.factions),
      ...project.relationships?.map((rel) => rel.relationType) ?? [],
    ]),
    zonesOfControl: typeof prev.zonesOfControl === "object" && prev.zonesOfControl
      ? (prev.zonesOfControl as Record<string, string[]>)
      : {},
    structuralProhibitions: uniq([
      ...storyBible.worldRules.filter((rule) => /(interdit|jamais|forbidden|cannot|ne peut pas)/i.test(rule)),
      ...storyBible.lockedCanonFacts.filter((fact) => /(interdit|jamais|forbidden|cannot|ne peut pas)/i.test(fact)),
    ]),
    globalTone: project.tone ?? storyBible.globalTone ?? null,
    techLevel: project.primaryGenre?.toLowerCase().includes("sci") ? "advanced" : null,
    magicLevel: project.primaryGenre?.toLowerCase().includes("fantasy") ? "present" : null,
    globalFlags: typeof prev.globalFlags === "object" && prev.globalFlags
      ? (prev.globalFlags as Record<string, boolean | string | number>)
      : {},
  };
}

export function buildLocationState(location: {
  id: string;
  name: string;
  type: string | null;
  visualBrief: string | null;
  description: string | null;
  metadata: unknown;
}): LocationState {
  const meta = asRecord(location.metadata);
  return {
    locationId: location.id,
    name: location.name,
    type: location.type,
    visualAnchors: uniq([
      location.visualBrief,
      location.description,
      ...asStringArray(meta.visualAnchors),
    ]),
    state: typeof meta.state === "string" ? meta.state : null,
    occupants: asStringArray(meta.occupants),
    importantProps: asStringArray(meta.importantProps),
    eventTraces: asStringArray(meta.eventTraces),
    damageMarkers: asStringArray(meta.damageMarkers),
    corruptionMarkers: asStringArray(meta.corruptionMarkers),
    surveillanceMarkers: asStringArray(meta.surveillanceMarkers),
    vegetationMarkers: asStringArray(meta.vegetationMarkers),
    narrativeFunction: typeof meta.narrativeFunction === "string" ? meta.narrativeFunction : null,
  };
}

export function inferActiveArc(
  arcs: Array<{
    id: string;
    name: string;
    status: string;
    summary: string | null;
    metadata: unknown;
  }>,
): ArcRegistryEntry[] {
  return arcs.map((arc) => {
    const meta = asRecord(arc.metadata);
    return {
      arcId: arc.id,
      name: arc.name,
      status: arc.status,
      setup: asStringArray(meta.setup),
      progression: asStringArray(meta.progression),
      tension: typeof meta.tension === "number" ? meta.tension : 0,
      openPromises: asStringArray(meta.openPromises),
      paidPromises: asStringArray(meta.paidPromises),
      blockers: asStringArray(meta.blockers),
      currentState: typeof meta.currentState === "string" ? meta.currentState : arc.summary,
    };
  });
}
