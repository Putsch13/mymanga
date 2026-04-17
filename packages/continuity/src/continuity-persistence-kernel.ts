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

// Helpers utilitaires extraits dans ./kernel/utils.ts
import {
  asRecord,
  asStringArray,
  uniq,
  textHasAny,
  normalizeCharacterName,
  prohibitionIsViolated,
} from "./kernel/utils";
// Builders de kernel (storyBible, character state, world state, location, arcs)
// extraits dans ./kernel/builders.ts
import {
  buildStoryBibleKernel,
  buildFallbackCharacterState,
  mergeWorldState,
  buildLocationState,
  inferActiveArc,
} from "./kernel/builders";

export { prohibitionIsViolated };

// buildStoryBibleKernel, buildFallbackCharacterState, mergeWorldState,
// buildLocationState, inferActiveArc extraits dans ./kernel/builders.ts
// Appliers de deltas structurés (character/location/relationship/arc)
// extraits dans ./kernel/delta-appliers.ts
import {
  findCharacterStateByName,
  resolveCharacterIdByName,
  applyStructuredCharacterDeltas,
  applyStructuredLocationDelta,
  applyStructuredRelationshipChanges,
  applyStructuredArcDeltas,
} from "./kernel/delta-appliers";

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

function sanitizeCharacterState(
  raw: unknown,
  fallbackCharacter: {
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
  } | null,
): CharacterState | null {
  const rec = asRecord(raw);
  const characterId = typeof rec.characterId === "string" ? rec.characterId : fallbackCharacter?.id ?? null;
  if (!characterId) return null;

  const identityRec = asRecord(rec.identity);
  const stableName =
    typeof identityRec.stableName === "string" && identityRec.stableName.trim().length > 0
      ? identityRec.stableName
      : (fallbackCharacter?.name ?? characterId);
  const roleType =
    typeof identityRec.roleType === "string"
      ? identityRec.roleType
      : (fallbackCharacter?.roleType ?? null);

  const base = buildFallbackCharacterState({
    id: characterId,
    name: stableName,
    roleType,
    emotionalState: fallbackCharacter?.emotionalState ?? null,
    objective: fallbackCharacter?.objective ?? null,
    fear: fallbackCharacter?.fear ?? null,
    outfitDefault: fallbackCharacter?.outfitDefault ?? null,
    hairColor: fallbackCharacter?.hairColor ?? null,
    eyeColor: fallbackCharacter?.eyeColor ?? null,
    traits: fallbackCharacter?.traits ?? [],
    biography: fallbackCharacter?.biography ?? null,
  });

  const appearanceLockedRec = asRecord(rec.appearanceLocked);
  const psychologicalCanonRec = asRecord(rec.psychologicalCanon);
  const physicalCanonRec = asRecord(rec.physicalCanon);
  const currentStateRec = asRecord(rec.currentState);

  return {
    ...base,
    characterId,
    identity: { stableName, roleType },
    appearanceLocked: {
      ...base.appearanceLocked,
      hairColor: typeof appearanceLockedRec.hairColor === "string" ? appearanceLockedRec.hairColor : base.appearanceLocked.hairColor,
      eyeColor: typeof appearanceLockedRec.eyeColor === "string" ? appearanceLockedRec.eyeColor : base.appearanceLocked.eyeColor,
      silhouette: typeof appearanceLockedRec.silhouette === "string" ? appearanceLockedRec.silhouette : base.appearanceLocked.silhouette,
      scars: asStringArray(appearanceLockedRec.scars),
      tattoos: asStringArray(appearanceLockedRec.tattoos),
      fixedAccessories: asStringArray(appearanceLockedRec.fixedAccessories),
      forbiddenVisualDrift: asStringArray(appearanceLockedRec.forbiddenVisualDrift),
    },
    psychologicalCanon: {
      ...base.psychologicalCanon,
      coreTraits: asStringArray(psychologicalCanonRec.coreTraits),
      fears: asStringArray(psychologicalCanonRec.fears),
      motivations: asStringArray(psychologicalCanonRec.motivations),
      speechRules: asStringArray(psychologicalCanonRec.speechRules),
    },
    physicalCanon: {
      ...base.physicalCanon,
      baselineOutfit: typeof physicalCanonRec.baselineOutfit === "string" ? physicalCanonRec.baselineOutfit : base.physicalCanon.baselineOutfit,
      allowedOutfitVariations: asStringArray(physicalCanonRec.allowedOutfitVariations),
      bodyMarkers: asStringArray(physicalCanonRec.bodyMarkers),
    },
    currentState: {
      ...base.currentState,
      location: typeof currentStateRec.location === "string" ? currentStateRec.location : base.currentState.location,
      outfit: typeof currentStateRec.outfit === "string" ? currentStateRec.outfit : base.currentState.outfit,
      injuries: asStringArray(currentStateRec.injuries),
      fatigue: typeof currentStateRec.fatigue === "number" ? currentStateRec.fatigue : base.currentState.fatigue,
      emotion: typeof currentStateRec.emotion === "string" ? currentStateRec.emotion : base.currentState.emotion,
      objective: typeof currentStateRec.objective === "string" ? currentStateRec.objective : base.currentState.objective,
      possessions: asStringArray(currentStateRec.possessions),
      knowledge: asStringArray(currentStateRec.knowledge),
      obligations: asStringArray(currentStateRec.obligations),
    },
    continuityObligations: asStringArray(rec.continuityObligations),
    relationshipStates: Array.isArray(rec.relationshipStates) ? (rec.relationshipStates as CharacterState["relationshipStates"]) : base.relationshipStates,
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
  const fallbackById = new Map(project.characters.map((c) => ([
    c.id,
    {
      id: c.id,
      name: c.name,
      roleType: c.roleType,
      emotionalState: c.emotionalState,
      objective: c.objective,
      fear: c.fear,
      outfitDefault: c.outfitDefault,
      hairColor: c.hairColor,
      eyeColor: c.eyeColor,
      traits: c.traits,
      biography: c.biography,
    },
  ] as const)));

  const rawLoadedStates: unknown[] =
    latestCanon?.characterStates && Array.isArray(latestCanon.characterStates)
      ? (latestCanon.characterStates as unknown[])
      : [];

  const characterStates: CharacterState[] =
    rawLoadedStates.length > 0
      ? rawLoadedStates
          .map((item) => {
            const rec = asRecord(item);
            const id = typeof rec.characterId === "string" ? rec.characterId : null;
            return sanitizeCharacterState(item, id ? (fallbackById.get(id) ?? null) : null);
          })
          .filter((s): s is CharacterState => Boolean(s))
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

    // BUG-19 fix : on accumulait `objectsLost` de tous les events passés
    // mais on ignorait `objectsGained`. Un objet perdu au chapitre 3 puis
    // légitimement regagné via un event propre au chapitre 5 déclenchait
    // une fausse timeline_violation au chapitre 6 si le personnage en
    // disposait toujours. On nette maintenant la liste en soustrayant les
    // gains d'events qui suivent la dernière perte de chaque item.
    const characterEvents = input.kernel.eventLog
      .filter((event) => event.actorIds.includes(character.characterId));
    const lastLossIndexByItem = new Map<string, number>();
    const lastGainIndexByItem = new Map<string, number>();
    characterEvents.forEach((event, idx) => {
      for (const item of event.objectsLost) {
        lastLossIndexByItem.set(item, idx);
      }
      for (const item of event.objectsGained) {
        lastGainIndexByItem.set(item, idx);
      }
    });
    const lostItems = [...lastLossIndexByItem.entries()]
      .filter(([item, lossIdx]) => {
        const gainIdx = lastGainIndexByItem.get(item);
        return gainIdx === undefined || gainIdx < lossIdx;
      })
      .map(([item]) => item);
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

  // BUG-18 fix : textHasAny(summaryText, [rule]) faisait un simple includes()
  // sans contexte. Un text comme "la cité sans magie reste calme" déclenchait
  // une violation critique parce qu'il contenait la sous-chaîne "magie"
  // alors même que la prose la niait explicitement. On filtre désormais les
  // matches précédés d'une négation proche (fenêtre de 40 chars).
  const prohibitions = input.kernel.worldState.structuralProhibitions;
  if (prohibitions.some((rule) => prohibitionIsViolated(summaryText, rule))) {
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
