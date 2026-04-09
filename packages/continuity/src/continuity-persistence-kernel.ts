import type { Prisma, PrismaClient } from "@manga-ai-studio/db";
import type { SceneContinuityPayload } from "@manga-ai-studio/core";
import type { SceneBlueprint } from "@manga-ai-studio/world";
import type {
  ArcRegistryEntry,
  ChapterCanonStateData,
  ChapterSnapshot,
  CharacterState,
  ContinuityIssue,
  ContinuityKernel,
  ContinuityValidationResult,
  EventLedgerEntry,
  LocationState,
  RelationshipGraphEdge,
  SceneSnapshot,
  SceneStateData,
  StoryBibleKernel,
  WorldState,
} from "./types";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function uniq(values: Array<string | null | undefined>) {
  return [...new Set(values.filter(Boolean) as string[])];
}

function textHasAny(text: string, needles: string[]) {
  const normalized = text.toLowerCase();
  return needles.some((needle) => normalized.includes(needle.toLowerCase()));
}

function normalizeCharacterName(value: string) {
  return value.trim().toLowerCase();
}

function buildStoryBibleKernel(storyBible: {
  summary?: string | null;
  themes?: unknown;
  worldRules?: unknown;
  lore?: unknown;
  lockedCanon?: unknown;
} | null | undefined, projectTone?: string | null): StoryBibleKernel {
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

function buildFallbackCharacterState(character: {
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

function mergeWorldState(previous: unknown, storyBible: StoryBibleKernel, project: {
  tone?: string | null;
  primaryGenre?: string | null;
  relationships?: Array<{ relationType: string }>;
}): WorldState {
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

function buildLocationState(location: {
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

function inferActiveArc(arcs: Array<{
  id: string;
  name: string;
  status: string;
  summary: string | null;
  metadata: unknown;
}>): ArcRegistryEntry[] {
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

function findCharacterStateByName(states: CharacterState[], name: string) {
  const normalized = normalizeCharacterName(name);
  return states.find((state) => normalizeCharacterName(state.identity.stableName ?? state.characterId) === normalized);
}

function resolveCharacterIdByName(states: CharacterState[], name: string) {
  return findCharacterStateByName(states, name)?.characterId ?? null;
}

function applyStructuredCharacterDeltas(
  baseStates: CharacterState[],
  continuityPayload: SceneContinuityPayload | null | undefined,
  fallbackLocation: string,
) {
  if (!continuityPayload) return baseStates;
  return baseStates.map((state) => {
    const delta = continuityPayload.characterDeltas.find(
      (item) => normalizeCharacterName(item.characterName) === normalizeCharacterName(state.identity.stableName ?? state.characterId),
    );
    if (!delta) return state;
    return {
      ...state,
      currentState: {
        ...state.currentState,
        location: delta.location ?? fallbackLocation,
        emotion: delta.emotionalState ?? state.currentState.emotion ?? null,
        objective: delta.objective ?? state.currentState.objective ?? null,
        outfit: delta.outfit ?? state.currentState.outfit ?? null,
        possessions: uniq([
          ...state.currentState.possessions,
          ...(delta.gainedItems ?? []),
        ]).filter((item) => !(delta.lostItems ?? []).includes(item)),
        injuries: uniq([
          ...state.currentState.injuries,
          ...(delta.injuriesAdded ?? []),
        ]).filter((item) => !(delta.injuriesHealed ?? []).includes(item)),
        knowledge: uniq([
          ...(state.currentState.knowledge ?? []),
          ...(delta.knowledgeGained ?? []),
        ]),
        obligations: uniq([
          ...(state.currentState.obligations ?? []),
          ...(delta.obligationsAdded ?? []),
        ]),
        fatigue: state.currentState.fatigue ?? null,
      },
    };
  });
}

function applyStructuredLocationDelta(
  baseLocation: LocationState,
  continuityPayload: SceneContinuityPayload | null | undefined,
  participantNames: string[],
) {
  const delta = continuityPayload?.locationDeltas.find(
    (item) => normalizeCharacterName(item.locationName) === normalizeCharacterName(baseLocation.name),
  ) ?? continuityPayload?.locationDeltas[0];
  if (!delta) {
    return {
      ...baseLocation,
      occupants: uniq([...baseLocation.occupants, ...participantNames]),
    };
  }
  return {
    ...baseLocation,
    state: delta.state ?? baseLocation.state ?? null,
    visualAnchors: uniq([...baseLocation.visualAnchors, ...(delta.visualAnchorsAdded ?? [])]),
    occupants: uniq([
      ...baseLocation.occupants,
      ...participantNames,
      ...(delta.occupantsAdded ?? []),
    ]).filter((item) => !(delta.occupantsRemoved ?? []).includes(item)),
    importantProps: uniq([
      ...baseLocation.importantProps,
      ...(delta.propsAdded ?? []),
    ]).filter((item) => !(delta.propsRemoved ?? []).includes(item)),
    eventTraces: uniq([...baseLocation.eventTraces, ...(delta.tracesAdded ?? [])]),
    damageMarkers: uniq([...baseLocation.damageMarkers, ...(delta.damageAdded ?? [])]),
    surveillanceMarkers: uniq([...baseLocation.surveillanceMarkers, ...(delta.surveillanceAdded ?? [])]),
    vegetationMarkers: uniq([...baseLocation.vegetationMarkers, ...(delta.vegetationAdded ?? [])]),
    narrativeFunction: delta.narrativeFunction ?? baseLocation.narrativeFunction ?? null,
  };
}

function applyStructuredRelationshipChanges(
  baseEdges: RelationshipGraphEdge[],
  continuityPayload: SceneContinuityPayload | null | undefined,
  states: CharacterState[],
) {
  if (!continuityPayload) return baseEdges;
  const nextEdges = [...baseEdges];
  for (const delta of continuityPayload.characterDeltas) {
    const sourceId = resolveCharacterIdByName(states, delta.characterName);
    if (!sourceId) continue;
    for (const change of delta.relationshipChanges ?? []) {
      const targetId = resolveCharacterIdByName(states, change.targetCharacterName);
      if (!targetId) continue;
      const existingIndex = nextEdges.findIndex(
        (edge) => edge.sourceCharacterId === sourceId && edge.targetCharacterId === targetId,
      );
      if (existingIndex >= 0) {
        const edge = nextEdges[existingIndex]!;
        nextEdges[existingIndex] = {
          ...edge,
          intensity: Math.max(0, Math.min(100, edge.intensity + (change.intensityDelta ?? 0))),
          note: change.note ?? edge.note ?? change.shift,
          currentDynamic: change.shift,
        };
      } else {
        nextEdges.push({
          sourceCharacterId: sourceId,
          targetCharacterId: targetId,
          relationType: change.shift,
          intensity: Math.max(0, Math.min(100, 50 + (change.intensityDelta ?? 0))),
          note: change.note ?? change.shift,
          currentDynamic: change.shift,
        });
      }
    }
  }
  return nextEdges;
}

function applyStructuredArcDeltas(
  baseArcs: ArcRegistryEntry[],
  continuityPayload: SceneContinuityPayload | null | undefined,
) {
  if (!continuityPayload) return baseArcs;
  const nextArcs = [...baseArcs];
  for (const delta of continuityPayload.arcDeltas) {
    const index = nextArcs.findIndex((arc) => normalizeCharacterName(arc.name) === normalizeCharacterName(delta.arcName));
    if (index >= 0) {
      const arc = nextArcs[index]!;
      nextArcs[index] = {
        ...arc,
        status: delta.status ?? arc.status,
        progression: uniq([...arc.progression, ...(delta.progression ?? [])]),
        tension: Math.max(0, arc.tension + (delta.tensionDelta ?? 0)),
        openPromises: uniq([...arc.openPromises, ...(delta.openPromisesAdded ?? [])]),
        paidPromises: uniq([...arc.paidPromises, ...(delta.paidPromisesAdded ?? [])]),
        blockers: uniq([...arc.blockers, ...(delta.blockersAdded ?? [])]).filter(
          (item) => !(delta.blockersResolved ?? []).includes(item),
        ),
        currentState: delta.currentState ?? arc.currentState ?? null,
      };
      continue;
    }
    nextArcs.push({
      arcId: `structured:${delta.arcName}`,
      name: delta.arcName,
      status: delta.status ?? "open",
      setup: [],
      progression: delta.progression ?? [],
      tension: Math.max(0, delta.tensionDelta ?? 0),
      openPromises: delta.openPromisesAdded ?? [],
      paidPromises: delta.paidPromisesAdded ?? [],
      blockers: (delta.blockersAdded ?? []).filter((item) => !(delta.blockersResolved ?? []).includes(item)),
      currentState: delta.currentState ?? null,
    });
  }
  return nextArcs;
}

function mapContinuityEventToLedger(event: {
  id: string;
  chapterId?: string | null;
  eventType: string;
  summary?: string | null;
  entities: unknown;
  importance: number;
  timelineOrder: number;
  permanent: boolean;
}): EventLedgerEntry {
  const entities = asRecord(event.entities);
  return {
    eventId: event.id,
    chapterId: event.chapterId ?? null,
    sceneId: typeof entities.sceneId === "string" ? entities.sceneId : null,
    chapterNumber: Math.floor((event.timelineOrder ?? 0) / 100),
    sceneNumber: typeof entities.sceneNumber === "number" ? entities.sceneNumber : null,
    eventType: event.eventType,
    title: String(entities.title ?? event.eventType),
    description: event.summary ?? "",
    actorIds: asStringArray(entities.actorIds),
    location: typeof entities.location === "string" ? entities.location : null,
    consequences: asStringArray(entities.consequences),
    objectsGained: asStringArray(entities.objectsGained),
    objectsLost: asStringArray(entities.objectsLost),
    injuriesApplied: asStringArray(entities.injuriesApplied),
    injuriesResolved: asStringArray(entities.injuriesResolved),
    relationshipChanges: asStringArray(entities.relationshipChanges),
    continuityFlags: asStringArray(entities.continuityFlags),
    irreversible: event.permanent,
    importance: event.importance >= 80 ? "critical" : event.importance >= 55 ? "major" : "minor",
  };
}

export async function loadContinuityKernel(
  prisma: PrismaClient,
  input: { projectId: string; beforeChapterNumber?: number },
): Promise<ContinuityKernel> {
  const project = await prisma.project.findUnique({
    where: { id: input.projectId },
    include: {
      storyBible: true,
      characters: true,
      relationships: true,
      locations: true,
      arcs: true,
    },
  });
  if (!project) throw new Error("Project not found");

  const latestCanon = await prisma.chapterCanonState.findFirst({
    where: {
      projectId: input.projectId,
      ...(input.beforeChapterNumber ? { chapterNumber: { lt: input.beforeChapterNumber } } : {}),
    },
    orderBy: { chapterNumber: "desc" },
  });
  const latestMemorySnapshot = await prisma.memorySnapshot.findFirst({
    where: { projectId: input.projectId },
    orderBy: { createdAt: "desc" },
  });
  const [continuityEvents, canonTimelineEvents] = await Promise.all([
    prisma.continuityEvent.findMany({
      where: { projectId: input.projectId },
      orderBy: [{ timelineOrder: "desc" }, { createdAt: "desc" }],
      take: 40,
    }),
    prisma.canonTimelineEvent.findMany({
      where: { projectId: input.projectId },
      orderBy: [{ chapterNumber: "desc" }, { createdAt: "desc" }],
      take: 20,
    }),
  ]);

  const storyBible = buildStoryBibleKernel(project.storyBible, project.tone);
  const worldState = mergeWorldState(latestCanon?.worldState, storyBible, {
    tone: project.tone,
    primaryGenre: project.primaryGenre,
    relationships: project.relationships,
  });
  const characterStates = latestCanon?.characterStates
    ? (latestCanon.characterStates as CharacterState[])
    : project.characters.map((character) =>
        buildFallbackCharacterState({
          id: character.id,
          name: character.name,
          roleType: character.roleType,
          emotionalState: character.emotionalState,
          objective: character.objective,
          fear: character.fear,
          outfitDefault: character.outfitDefault,
          hairColor: character.hairColor,
          eyeColor: character.eyeColor,
          traits: character.traits,
          biography: character.biography,
        }),
      );
  const locationStates = project.locations.map(buildLocationState);
  const relationshipGraph: RelationshipGraphEdge[] = project.relationships.map((relationship) => ({
    sourceCharacterId: relationship.sourceCharacterId,
    targetCharacterId: relationship.targetCharacterId,
    relationType: relationship.relationType,
    intensity: relationship.intensity,
    note: relationship.note,
    currentDynamic: relationship.note,
  }));
  const eventLog = [
    ...continuityEvents.map(mapContinuityEventToLedger),
    ...canonTimelineEvents.map((event) => {
      const importance: "critical" | "major" | "minor" =
        event.importance === "critical" || event.importance === "major" || event.importance === "minor"
          ? event.importance
          : "minor";
      return {
        eventId: event.id,
        chapterId: event.chapterId ?? null,
        sceneId: event.sceneId ?? null,
        chapterNumber: event.chapterNumber,
        sceneNumber: null,
        eventType: event.eventType,
        title: event.title,
        description: event.description,
        actorIds: event.subjectCharacterId ? [event.subjectCharacterId] : [],
        location: typeof asRecord(event.metadata).location === "string" ? String(asRecord(event.metadata).location) : null,
        consequences: asStringArray(asRecord(event.metadata).consequences),
        objectsGained: asStringArray(asRecord(event.metadata).objectsGained),
        objectsLost: asStringArray(asRecord(event.metadata).objectsLost),
        injuriesApplied: asStringArray(asRecord(event.metadata).injuriesApplied),
        injuriesResolved: asStringArray(asRecord(event.metadata).injuriesResolved),
        relationshipChanges: asStringArray(asRecord(event.metadata).relationshipChanges),
        continuityFlags: asStringArray(asRecord(event.metadata).continuityFlags),
        irreversible: event.irreversible,
        importance,
      };
    }),
  ].sort((a, b) => b.chapterNumber - a.chapterNumber);
  const arcRegistry = inferActiveArc(project.arcs);
  const structuredState = asRecord(latestMemorySnapshot?.structuredState);
  const chapterSnapshot = structuredState.chapterSnapshot as ChapterSnapshot | undefined;

  return {
    storyBible,
    worldState,
    characterStates,
    locationStates,
    relationshipGraph,
    eventLog,
    arcRegistry,
    chapterSnapshot: chapterSnapshot ?? null,
  };
}

export function buildSceneSnapshot(input: {
  kernel: ContinuityKernel;
  chapterId: string;
  chapterNumber: number;
  sceneId: string;
  sceneNumber: number;
  title?: string | null;
  summary: string;
  dramaticGoal?: string | null;
  location: string;
  sceneStateData: SceneStateData;
  sceneBlueprints?: SceneBlueprint[];
  continuityPayload?: SceneContinuityPayload | null;
  participantNames?: string[];
}): SceneSnapshot {
  const baseLocationState =
    input.kernel.locationStates.find((location) => location.name.toLowerCase() === input.location.toLowerCase())
    ?? {
      locationId: null,
      name: input.location,
      type: null,
      visualAnchors: [],
      state: null,
      occupants: [],
      importantProps: [],
      eventTraces: [],
      damageMarkers: [],
      corruptionMarkers: [],
      surveillanceMarkers: [],
      vegetationMarkers: [],
      narrativeFunction: null,
    };
  const baseCharacterStates = input.sceneStateData.characterOverrides.map((override) => {
    const base =
      input.kernel.characterStates.find((state) => state.characterId === override.characterId)
      ?? {
        ...buildFallbackCharacterState({
          id: override.characterId,
          name: override.characterId,
          roleType: null,
          emotionalState: override.emotionalState ?? null,
          objective: null,
          fear: null,
          outfitDefault: override.outfit ?? null,
          hairColor: null,
          eyeColor: null,
          traits: [],
          biography: null,
        }),
      };
    return {
      ...base,
      currentState: {
        ...base.currentState,
        location: input.location,
        outfit: override.outfit ?? base.currentState.outfit ?? null,
        injuries: override.visibleInjuries,
        emotion: override.emotionalState ?? base.currentState.emotion ?? null,
        possessions: uniq([...(base.currentState.possessions ?? []), ...override.props]),
        obligations: uniq([...(base.currentState.obligations ?? []), ...base.continuityObligations]),
        knowledge: base.currentState.knowledge ?? [],
        objective: base.currentState.objective ?? null,
        fatigue: base.currentState.fatigue ?? null,
      },
    };
  });
  const characterStates = applyStructuredCharacterDeltas(
    baseCharacterStates,
    input.continuityPayload,
    input.location,
  );
  const participantIds = new Set(characterStates.map((state) => state.characterId));
  const baseRelationshipGraph = input.kernel.relationshipGraph.filter(
    (edge) => participantIds.has(edge.sourceCharacterId) || participantIds.has(edge.targetCharacterId),
  );
  const relationshipGraph = applyStructuredRelationshipChanges(
    baseRelationshipGraph,
    input.continuityPayload,
    characterStates,
  );
  const sceneBlueprintHints = {
    visualAnchors: uniq(input.sceneBlueprints?.flatMap((blueprint) => blueprint.environment.persistentSceneAnchors) ?? []),
    worldRules: uniq(input.sceneBlueprints?.flatMap((blueprint) => blueprint.constraints.hard) ?? []),
    narrativeConstraints: uniq(input.sceneBlueprints?.flatMap((blueprint) => [
      blueprint.narrativeContext.progressionBeat,
      blueprint.composition.interactionBeat,
    ]) ?? []),
  };
  const activeArc = input.kernel.arcRegistry.find((arc) =>
    textHasAny(`${input.summary} ${input.dramaticGoal ?? ""}`, [arc.name, ...arc.openPromises]),
  ) ?? input.kernel.arcRegistry.find((arc) => arc.status !== "closed") ?? null;
  const arcRegistry = applyStructuredArcDeltas(
    activeArc ? [activeArc] : input.kernel.arcRegistry,
    input.continuityPayload,
  );
  const locationState = applyStructuredLocationDelta(
    baseLocationState,
    input.continuityPayload,
    input.participantNames ?? [],
  );
  return {
    chapterId: input.chapterId,
    sceneId: input.sceneId,
    chapterNumber: input.chapterNumber,
    sceneNumber: input.sceneNumber,
    title: input.title ?? null,
    summary: input.summary,
    dramaticGoal: input.dramaticGoal ?? input.sceneStateData.dramaticGoal ?? null,
    location: {
      ...locationState,
      occupants: uniq([
        ...locationState.occupants,
        ...(input.participantNames ?? []),
      ]),
      visualAnchors: uniq([
        ...locationState.visualAnchors,
        ...sceneBlueprintHints.visualAnchors,
      ]),
      importantProps: uniq([
        ...locationState.importantProps,
        ...characterStates.flatMap((state) => state.currentState.possessions),
      ]),
    },
    characters: characterStates,
    relationshipGraph,
    recentEvents: input.kernel.eventLog.slice(0, 10),
    activeArc: arcRegistry[0] ?? activeArc,
    structuredContinuity: input.continuityPayload ?? null,
    continuityAnchors: input.sceneStateData.continuityAnchors,
    textConstraints: input.sceneStateData.textConstraints,
    sceneBlueprintHints,
  };
}

function makeIssue(
  severity: ContinuityIssue["severity"],
  type: ContinuityIssue["type"],
  message: string,
  subjectId?: string | null,
): ContinuityIssue {
  return {
    severity,
    type,
    message,
    subjectId: subjectId ?? null,
    sceneId: null,
    autoRepairable: false,
  };
}

function inferInventoryRegain(summary: string) {
  return /(retrouve|récupère|recupere|ramasse|gagne|obtient|reprend)/i.test(summary)
    && !/(sans expliquer|sans montrer|sans justifier|sans raison)/i.test(summary);
}

function inferHealing(summary: string) {
  return /(soigne|guérit|guerit|bandage|repos|récupère|recupere)/i.test(summary);
}

function inferRelationshipShift(summary: string) {
  return /(pardonne|trahit|avoue|confesse|alliance|trêve|treve|promet)/i.test(summary);
}

export function validateSceneSnapshotAgainstKernel(input: {
  kernel: ContinuityKernel;
  sceneSnapshot: SceneSnapshot;
}): ContinuityValidationResult {
  const issues: ContinuityIssue[] = [];
  const warnings: string[] = [];
  const proposedEvents: EventLedgerEntry[] = [];
  const summaryText = `${input.sceneSnapshot.summary} ${input.sceneSnapshot.dramaticGoal ?? ""}`;

  for (const character of input.sceneSnapshot.characters) {
    const previous = input.kernel.characterStates.find((state) => state.characterId === character.characterId);
    if (!previous) continue;
    const structuredDelta = input.sceneSnapshot.structuredContinuity?.characterDeltas.find(
      (delta) => normalizeCharacterName(delta.characterName) === normalizeCharacterName(character.identity.stableName ?? character.characterId),
    );

    const lostItems = input.kernel.eventLog
      .filter((event) => event.actorIds.includes(character.characterId))
      .flatMap((event) => event.objectsLost);
    const explicitGains = structuredDelta?.gainedItems ?? [];
    const regainedWithoutEvent = character.currentState.possessions.filter(
      (item) => lostItems.includes(item) && !explicitGains.includes(item) && !inferInventoryRegain(summaryText),
    );
    if (regainedWithoutEvent.length > 0) {
      issues.push(
        makeIssue(
          "critical",
          "timeline_violation",
          `${character.identity.stableName ?? character.characterId} récupère ${regainedWithoutEvent.join(", ")} sans événement explicite.`,
          character.characterId,
        ),
      );
    }

    const explicitHealed = structuredDelta?.injuriesHealed ?? [];
    if (
      previous.currentState.injuries.length > 0
      && character.currentState.injuries.length === 0
      && explicitHealed.length === 0
      && !inferHealing(summaryText)
    ) {
      issues.push(
        makeIssue(
          "major",
          "injury_loss",
          `${character.identity.stableName ?? character.characterId} perd une blessure visible sans justification.`,
          character.characterId,
        ),
      );
    }

    const deathFlags = input.kernel.eventLog.filter(
      (event) => event.actorIds.includes(character.characterId) && event.irreversible && event.eventType === "death",
    );
    if (deathFlags.length > 0) {
      issues.push(
        makeIssue(
          "critical",
          "timeline_violation",
          `${character.identity.stableName ?? character.characterId} réapparaît malgré un événement irréversible de mort.`,
          character.characterId,
        ),
      );
    }

    if (
      previous.currentState.emotion &&
      !character.currentState.emotion &&
      /(panique|colère|rage|deuil|terreur)/i.test(previous.currentState.emotion)
    ) {
      warnings.push(`${character.identity.stableName ?? character.characterId}: état émotionnel fort disparu sans transition claire.`);
    }
  }

  const anchorOverlap = input.sceneSnapshot.location.visualAnchors.filter((anchor) =>
    input.sceneSnapshot.sceneBlueprintHints.visualAnchors.some((hint) =>
      hint.toLowerCase().includes(anchor.toLowerCase()) || anchor.toLowerCase().includes(hint.toLowerCase()),
    ),
  );
  if (input.sceneSnapshot.location.visualAnchors.length > 0 && anchorOverlap.length === 0) {
    issues.push(
      makeIssue(
        "major",
        "lore_violation",
        `Le lieu ${input.sceneSnapshot.location.name} perd ses anchors visuels persistants.`,
      ),
    );
  }

  const prohibitions = input.kernel.worldState.structuralProhibitions;
  if (prohibitions.some((rule) => textHasAny(summaryText, [rule]))) {
    issues.push(makeIssue("critical", "lore_violation", "La scène viole une interdiction structurelle du monde."));
  }

  for (const edge of input.sceneSnapshot.relationshipGraph) {
    const hasExplicitRelationshipDelta = input.sceneSnapshot.structuredContinuity?.characterDeltas.some((delta) =>
      (delta.relationshipChanges ?? []).some(
        (change) => resolveCharacterIdByName(input.sceneSnapshot.characters, change.targetCharacterName) === edge.targetCharacterId,
      ),
    );
    if (
      /(enemy|rival|haine|hostile)/i.test(edge.relationType) &&
      /(confession|romance|tendre|intime)/i.test(summaryText) &&
      !hasExplicitRelationshipDelta &&
      !inferRelationshipShift(summaryText)
    ) {
      warnings.push(`Relation ${edge.sourceCharacterId} -> ${edge.targetCharacterId} change trop brutalement.`);
    }
  }

  return {
    accepted: issues.every((issue) => issue.severity !== "critical"),
    issues,
    warnings,
    proposedEvents,
  };
}

function buildEventId(prefix: string, chapterNumber: number, sceneNumber: number, suffix: string) {
  return `${prefix}:${chapterNumber}:${sceneNumber}:${suffix}`;
}

export function deriveSceneEvents(input: {
  kernel: ContinuityKernel;
  sceneSnapshot: SceneSnapshot;
}): EventLedgerEntry[] {
  if (input.sceneSnapshot.structuredContinuity?.sceneEvents?.length) {
    return input.sceneSnapshot.structuredContinuity.sceneEvents.map((event, index) => ({
      eventId: buildEventId(event.eventType, input.sceneSnapshot.chapterNumber, input.sceneSnapshot.sceneNumber, `${index}`),
      chapterId: input.sceneSnapshot.chapterId,
      sceneId: input.sceneSnapshot.sceneId,
      chapterNumber: input.sceneSnapshot.chapterNumber,
      sceneNumber: input.sceneSnapshot.sceneNumber,
      eventType: event.eventType,
      title: event.title,
      description: event.description,
      actorIds: (event.actorNames ?? [])
        .map((name) => resolveCharacterIdByName(input.sceneSnapshot.characters, name))
        .filter((id): id is string => Boolean(id)),
      location: event.location ?? input.sceneSnapshot.location.name,
      consequences: event.consequences ?? [],
      objectsGained: event.objectsGained ?? [],
      objectsLost: event.objectsLost ?? [],
      injuriesApplied: event.injuriesApplied ?? [],
      injuriesResolved: event.injuriesResolved ?? [],
      relationshipChanges: event.relationshipChanges ?? [],
      continuityFlags: uniq([...(event.continuityFlags ?? []), "scene_validated"]),
      irreversible: Boolean(event.irreversible),
      importance: event.importance ?? "minor",
    }));
  }
  const events: EventLedgerEntry[] = [];
  for (const character of input.sceneSnapshot.characters) {
    const previous = input.kernel.characterStates.find((state) => state.characterId === character.characterId);
    if (!previous) continue;
    if (previous.currentState.location !== input.sceneSnapshot.location.name) {
      events.push({
        eventId: buildEventId("location_change", input.sceneSnapshot.chapterNumber, input.sceneSnapshot.sceneNumber, character.characterId),
        chapterId: input.sceneSnapshot.chapterId,
        sceneId: input.sceneSnapshot.sceneId,
        chapterNumber: input.sceneSnapshot.chapterNumber,
        sceneNumber: input.sceneSnapshot.sceneNumber,
        eventType: "location_change",
        title: "Déplacement de personnage",
        description: `${character.identity.stableName ?? character.characterId} est maintenant à ${input.sceneSnapshot.location.name}.`,
        actorIds: [character.characterId],
        location: input.sceneSnapshot.location.name,
        consequences: [`location=${input.sceneSnapshot.location.name}`],
        objectsGained: [],
        objectsLost: [],
        injuriesApplied: [],
        injuriesResolved: [],
        relationshipChanges: [],
        continuityFlags: ["character_location_updated"],
        irreversible: false,
        importance: "minor",
      });
    }
    const newItems = character.currentState.possessions.filter((item) => !previous.currentState.possessions.includes(item));
    if (newItems.length > 0) {
      events.push({
        eventId: buildEventId("inventory_gain", input.sceneSnapshot.chapterNumber, input.sceneSnapshot.sceneNumber, character.characterId),
        chapterId: input.sceneSnapshot.chapterId,
        sceneId: input.sceneSnapshot.sceneId,
        chapterNumber: input.sceneSnapshot.chapterNumber,
        sceneNumber: input.sceneSnapshot.sceneNumber,
        eventType: "inventory_change",
        title: "Gain d’objet",
        description: `${character.identity.stableName ?? character.characterId} gagne ${newItems.join(", ")}.`,
        actorIds: [character.characterId],
        location: input.sceneSnapshot.location.name,
        consequences: ["inventory_updated"],
        objectsGained: newItems,
        objectsLost: [],
        injuriesApplied: [],
        injuriesResolved: [],
        relationshipChanges: [],
        continuityFlags: ["inventory_persisted"],
        irreversible: false,
        importance: "major",
      });
    }
    const appliedInjuries = character.currentState.injuries.filter((injury) => !previous.currentState.injuries.includes(injury));
    const healedInjuries = previous.currentState.injuries.filter((injury) => !character.currentState.injuries.includes(injury));
    if (appliedInjuries.length > 0 || healedInjuries.length > 0) {
      events.push({
        eventId: buildEventId("injury_change", input.sceneSnapshot.chapterNumber, input.sceneSnapshot.sceneNumber, character.characterId),
        chapterId: input.sceneSnapshot.chapterId,
        sceneId: input.sceneSnapshot.sceneId,
        chapterNumber: input.sceneSnapshot.chapterNumber,
        sceneNumber: input.sceneSnapshot.sceneNumber,
        eventType: "injury",
        title: "État physique mis à jour",
        description: `${character.identity.stableName ?? character.characterId} change d’état physique.`,
        actorIds: [character.characterId],
        location: input.sceneSnapshot.location.name,
        consequences: ["physical_state_updated"],
        objectsGained: [],
        objectsLost: [],
        injuriesApplied: appliedInjuries,
        injuriesResolved: healedInjuries,
        relationshipChanges: [],
        continuityFlags: ["injury_persisted"],
        irreversible: false,
        importance: appliedInjuries.length > 0 ? "major" : "minor",
      });
    }
  }

  events.push({
    eventId: buildEventId("scene_snapshot", input.sceneSnapshot.chapterNumber, input.sceneSnapshot.sceneNumber, input.sceneSnapshot.sceneId),
    chapterId: input.sceneSnapshot.chapterId,
    sceneId: input.sceneSnapshot.sceneId,
    chapterNumber: input.sceneSnapshot.chapterNumber,
    sceneNumber: input.sceneSnapshot.sceneNumber,
    eventType: "scene_snapshot",
    title: input.sceneSnapshot.title ?? `Scène ${input.sceneSnapshot.sceneNumber}`,
    description: input.sceneSnapshot.summary,
    actorIds: input.sceneSnapshot.characters.map((character) => character.characterId),
    location: input.sceneSnapshot.location.name,
    consequences: [`dramatic_goal:${input.sceneSnapshot.dramaticGoal ?? "n/a"}`],
    objectsGained: [],
    objectsLost: [],
    injuriesApplied: [],
    injuriesResolved: [],
    relationshipChanges: [],
    continuityFlags: ["scene_validated"],
    irreversible: false,
    importance: "minor",
  });

  return events;
}

export function applySceneEventsToKernel(
  kernel: ContinuityKernel,
  sceneSnapshot: SceneSnapshot,
  events: EventLedgerEntry[],
): ContinuityKernel {
  const nextCharacterStates = kernel.characterStates.map((state) => {
    const sceneCharacter = sceneSnapshot.characters.find((character) => character.characterId === state.characterId);
    return sceneCharacter ? sceneCharacter : state;
  });
  const existingLocation = kernel.locationStates.find((location) => location.name.toLowerCase() === sceneSnapshot.location.name.toLowerCase());
  const nextLocationStates = existingLocation
    ? kernel.locationStates.map((location) =>
        location.name.toLowerCase() === sceneSnapshot.location.name.toLowerCase()
          ? {
              ...location,
              visualAnchors: uniq([...location.visualAnchors, ...sceneSnapshot.location.visualAnchors]),
              occupants: uniq([...location.occupants, ...sceneSnapshot.location.occupants]),
              importantProps: uniq([...location.importantProps, ...sceneSnapshot.location.importantProps]),
              eventTraces: uniq([...location.eventTraces, sceneSnapshot.summary]),
            }
          : location,
      )
    : [...kernel.locationStates, sceneSnapshot.location];
  const nextWorldState = {
    ...kernel.worldState,
    activeLocations: uniq([...kernel.worldState.activeLocations, sceneSnapshot.location.name]),
  };
  const nextRelationshipGraph = applyStructuredRelationshipChanges(
    kernel.relationshipGraph,
    sceneSnapshot.structuredContinuity ?? null,
    sceneSnapshot.characters,
  );
  const nextArcRegistry = applyStructuredArcDeltas(
    kernel.arcRegistry,
    sceneSnapshot.structuredContinuity ?? null,
  );
  return {
    ...kernel,
    worldState: nextWorldState,
    characterStates: nextCharacterStates,
    locationStates: nextLocationStates,
    relationshipGraph: nextRelationshipGraph,
    arcRegistry: nextArcRegistry,
    eventLog: [...events, ...kernel.eventLog].slice(0, 60),
  };
}

export async function persistValidatedSceneContinuity(
  prisma: PrismaClient,
  input: {
    projectId: string;
    chapterId: string;
    chapterNumber: number;
    sceneId: string;
    sceneNumber: number;
    sceneSnapshot: SceneSnapshot;
    validation: ContinuityValidationResult;
    events: EventLedgerEntry[];
  },
): Promise<void> {
  for (let index = 0; index < input.events.length; index++) {
    const event = input.events[index];
    await prisma.continuityEvent.create({
      data: {
        projectId: input.projectId,
        chapterId: input.chapterId,
        eventType: event.eventType,
        summary: event.description,
        entities: {
          title: event.title,
          actorIds: event.actorIds,
          location: event.location,
          sceneId: input.sceneId,
          sceneNumber: input.sceneNumber,
          consequences: event.consequences,
          objectsGained: event.objectsGained,
          objectsLost: event.objectsLost,
          injuriesApplied: event.injuriesApplied,
          injuriesResolved: event.injuriesResolved,
          relationshipChanges: event.relationshipChanges,
          continuityFlags: event.continuityFlags,
        } as Prisma.InputJsonValue,
        importance: event.importance === "critical" ? 90 : event.importance === "major" ? 70 : 45,
        timelineOrder: input.chapterNumber * 1000 + input.sceneNumber * 10 + index,
        permanent: event.irreversible,
      },
    });
    await prisma.canonTimelineEvent.create({
      data: {
        projectId: input.projectId,
        chapterId: input.chapterId,
        sceneId: input.sceneId,
        chapterNumber: input.chapterNumber,
        eventType: event.eventType,
        subjectCharacterId: event.actorIds[0] ?? null,
        title: event.title,
        description: event.description,
        importance: event.importance,
        irreversible: event.irreversible,
        metadata: {
          location: event.location,
          consequences: event.consequences,
          objectsGained: event.objectsGained,
          objectsLost: event.objectsLost,
          injuriesApplied: event.injuriesApplied,
          injuriesResolved: event.injuriesResolved,
          relationshipChanges: event.relationshipChanges,
          continuityFlags: event.continuityFlags,
        } as Prisma.InputJsonValue,
      },
    });
  }
}

export function buildChapterSnapshot(input: {
  kernel: ContinuityKernel;
  chapterId: string;
  chapterNumber: number;
  title?: string | null;
  summary?: string | null;
  sceneSnapshots: SceneSnapshot[];
  continuityWarnings: string[];
}): ChapterSnapshot {
  return {
    chapterId: input.chapterId,
    chapterNumber: input.chapterNumber,
    title: input.title ?? null,
    summary: input.summary ?? null,
    storyBible: input.kernel.storyBible,
    worldState: input.kernel.worldState,
    characterStates: input.kernel.characterStates,
    locationStates: input.kernel.locationStates,
    relationshipGraph: input.kernel.relationshipGraph,
    eventLog: input.kernel.eventLog.slice(0, 40),
    arcRegistry: input.kernel.arcRegistry,
    sceneSnapshots: input.sceneSnapshots,
    continuityWarnings: input.continuityWarnings,
  };
}

export function materializeCanonStateFromChapterSnapshot(
  canonStateData: ChapterCanonStateData,
  chapterSnapshot: ChapterSnapshot,
): ChapterCanonStateData {
  return {
    ...canonStateData,
    worldState: chapterSnapshot.worldState,
    characterStates: chapterSnapshot.characterStates,
    canonEvents: chapterSnapshot.eventLog.map((event) => ({
      type:
        event.eventType === "injury"
          ? "injury"
          : event.eventType === "location_change"
            ? "location_change"
            : event.eventType === "inventory_change"
              ? "reveal"
              : "reveal",
      subjectId: event.actorIds[0] ?? null,
      description: event.description,
      irreversible: event.irreversible,
    })),
    continuityWarnings: uniq([
      ...(canonStateData.continuityWarnings ?? []),
      ...chapterSnapshot.continuityWarnings,
    ]),
  };
}
