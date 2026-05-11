/**
 * P5.2 — Chargement du `ContinuityKernel` depuis Prisma.
 *
 * Extrait de `continuity-persistence-kernel.ts` :
 *   - `mapContinuityEventToLedger` (mapper interne)
 *   - `sanitizeCharacterState`     (mapper interne)
 *   - `loadContinuityKernel`       (point d'entrée principal)
 *
 * Effectue plusieurs lectures Prisma en parallèle (canon state, memory snapshot,
 * continuity events, canon timeline events) et reconstruit le kernel.
 */
import type { PrismaClient } from "@manga-ai-studio/db";
import type {
  CharacterState,
  ChapterSnapshot,
  ContinuityKernel,
  EventLedgerEntry,
  RelationshipGraphEdge,
} from "../types";
import { asRecord, asStringArray } from "./utils";
import {
  buildFallbackCharacterState,
  buildLocationState,
  buildStoryBibleKernel,
  inferActiveArc,
  mergeWorldState,
} from "./builders";

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
    importance:
      event.importance >= 80
        ? "critical"
        : event.importance >= 55
          ? "major"
          : "minor",
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
  const characterId =
    typeof rec.characterId === "string"
      ? rec.characterId
      : fallbackCharacter?.id ?? null;
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
    relationshipStates: Array.isArray(rec.relationshipStates)
      ? (rec.relationshipStates as CharacterState["relationshipStates"])
      : base.relationshipStates,
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
  // FIX-3 (CRITIQUE) — Charger les events permanents/irréversibles SANS limite
  // (sinon une mort/disparition critique sort silencieusement du buffer après
  // ~40 chapitres et la validation de résurrection se relâche). On dédoublonne
  // ensuite par id, en privilégiant les permanents.
  const [
    recentContinuityEvents,
    recentCanonTimelineEvents,
    permanentContinuityEvents,
    irreversibleCanonTimelineEvents,
  ] = await Promise.all([
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
    prisma.continuityEvent.findMany({
      where: { projectId: input.projectId, permanent: true },
      orderBy: [{ timelineOrder: "desc" }, { createdAt: "desc" }],
    }),
    prisma.canonTimelineEvent.findMany({
      where: { projectId: input.projectId, irreversible: true },
      orderBy: [{ chapterNumber: "desc" }, { createdAt: "desc" }],
    }),
  ]);

  const continuityEventsById = new Map<string, (typeof recentContinuityEvents)[number]>();
  for (const event of [...permanentContinuityEvents, ...recentContinuityEvents]) {
    if (!continuityEventsById.has(event.id)) continuityEventsById.set(event.id, event);
  }
  const continuityEvents = [...continuityEventsById.values()];

  const canonTimelineEventsById = new Map<string, (typeof recentCanonTimelineEvents)[number]>();
  for (const event of [...irreversibleCanonTimelineEvents, ...recentCanonTimelineEvents]) {
    if (!canonTimelineEventsById.has(event.id)) canonTimelineEventsById.set(event.id, event);
  }
  const canonTimelineEvents = [...canonTimelineEventsById.values()];

  const storyBible = buildStoryBibleKernel(project.storyBible, project.tone);
  const worldState = mergeWorldState(latestCanon?.worldState, storyBible, {
    tone: project.tone,
    primaryGenre: project.primaryGenre,
    relationships: project.relationships,
  });
  const fallbackById = new Map(
    project.characters.map(
      (c) =>
        [
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
        ] as const,
    ),
  );

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
        location:
          typeof asRecord(event.metadata).location === "string"
            ? String(asRecord(event.metadata).location)
            : null,
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
