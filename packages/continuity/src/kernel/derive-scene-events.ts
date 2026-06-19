/**
 * P5.2 — Dérivation des événements de scène + projection dans le kernel.
 *
 * Extrait depuis `continuity-persistence-kernel.ts` :
 *   - `deriveSceneEvents`     : transforme un `SceneSnapshot` en
 *     `EventLedgerEntry[]` (soit depuis `structuredContinuity.sceneEvents`,
 *     soit dérivés des deltas character/inventory/injury).
 *   - `applySceneEventsToKernel` : applique les events + le snapshot scène
 *     au `ContinuityKernel` pour produire le kernel post-scène.
 *
 * Pures, sans I/O.
 */
import type {
  ContinuityKernel,
  EventLedgerEntry,
  SceneSnapshot,
} from "../types";
import { uniq } from "./utils";
import { capEventLogPreservingIrreversible } from "./event-log-cap";
import {
  applyStructuredArcDeltas,
  applyStructuredRelationshipChanges,
  resolveCharacterIdByName,
} from "./delta-appliers";

function buildEventId(
  prefix: string,
  chapterNumber: number,
  sceneNumber: number,
  suffix: string,
): string {
  return `${prefix}:${chapterNumber}:${sceneNumber}:${suffix}`;
}

export function deriveSceneEvents(input: {
  kernel: ContinuityKernel;
  sceneSnapshot: SceneSnapshot;
}): EventLedgerEntry[] {
  if (input.sceneSnapshot.structuredContinuity?.sceneEvents?.length) {
    return input.sceneSnapshot.structuredContinuity.sceneEvents.map((event, index) => ({
      eventId: buildEventId(
        event.eventType,
        input.sceneSnapshot.chapterNumber,
        input.sceneSnapshot.sceneNumber,
        `${index}`,
      ),
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

  // FIX-6 (MAJEUR) — Le fallback ne produisait que location_change /
  // inventory_change / injury / scene_snapshot mais JAMAIS `death`.
  // Conséquence : si la scène structurée ne fournit pas explicitement
  // `sceneEvents`, une mort narrative restait invisible côté kernel et
  // `validateSceneSnapshotAgainstKernel` ne pouvait plus bloquer la
  // résurrection. On scanne désormais le summary pour des signaux de
  // mort + le nom du personnage concerné et on génère un event
  // irréversible/critical.
  const deathSignalRe =
    /(meurt|décède|decede|est tu[ée]|p[ée]rit|tombe?\s+raide|s'éteint|expire(?:\s+sous)?|succombe|achev[ée]?|mort de\s+|pr[ée]cipite\s+vers\s+la\s+mort|dies|killed|perishes?)/i;
  const summaryLower = input.sceneSnapshot.summary?.toLowerCase() ?? "";
  for (const character of input.sceneSnapshot.characters) {
    const previous = input.kernel.characterStates.find(
      (state) => state.characterId === character.characterId,
    );
    if (!previous) continue;
    const charName = (
      character.identity.stableName ?? character.characterId
    ).toLowerCase();
    if (!charName) continue;
    if (
      summaryLower.includes(charName)
      && deathSignalRe.test(input.sceneSnapshot.summary ?? "")
    ) {
      const alreadyDead = input.kernel.eventLog.some(
        (event) =>
          event.eventType === "death"
          && event.actorIds.includes(character.characterId),
      );
      if (!alreadyDead) {
        events.push({
          eventId: buildEventId(
            "death",
            input.sceneSnapshot.chapterNumber,
            input.sceneSnapshot.sceneNumber,
            character.characterId,
          ),
          chapterId: input.sceneSnapshot.chapterId,
          sceneId: input.sceneSnapshot.sceneId,
          chapterNumber: input.sceneSnapshot.chapterNumber,
          sceneNumber: input.sceneSnapshot.sceneNumber,
          eventType: "death",
          title: `Mort de ${character.identity.stableName ?? character.characterId}`,
          description: input.sceneSnapshot.summary ?? "",
          actorIds: [character.characterId],
          location: input.sceneSnapshot.location.name,
          consequences: ["death"],
          objectsGained: [],
          objectsLost: [],
          injuriesApplied: [],
          injuriesResolved: [],
          relationshipChanges: [],
          continuityFlags: ["death", "irreversible"],
          irreversible: true,
          importance: "critical",
        });
      }
    }
  }

  for (const character of input.sceneSnapshot.characters) {
    const previous = input.kernel.characterStates.find(
      (state) => state.characterId === character.characterId,
    );
    if (!previous) continue;

    if (previous.currentState.location !== input.sceneSnapshot.location.name) {
      events.push({
        eventId: buildEventId(
          "location_change",
          input.sceneSnapshot.chapterNumber,
          input.sceneSnapshot.sceneNumber,
          character.characterId,
        ),
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

    const newItems = character.currentState.possessions.filter(
      (item) => !previous.currentState.possessions.includes(item),
    );
    if (newItems.length > 0) {
      events.push({
        eventId: buildEventId(
          "inventory_gain",
          input.sceneSnapshot.chapterNumber,
          input.sceneSnapshot.sceneNumber,
          character.characterId,
        ),
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

    const appliedInjuries = character.currentState.injuries.filter(
      (injury) => !previous.currentState.injuries.includes(injury),
    );
    const healedInjuries = previous.currentState.injuries.filter(
      (injury) => !character.currentState.injuries.includes(injury),
    );
    if (appliedInjuries.length > 0 || healedInjuries.length > 0) {
      events.push({
        eventId: buildEventId(
          "injury_change",
          input.sceneSnapshot.chapterNumber,
          input.sceneSnapshot.sceneNumber,
          character.characterId,
        ),
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
    eventId: buildEventId(
      "scene_snapshot",
      input.sceneSnapshot.chapterNumber,
      input.sceneSnapshot.sceneNumber,
      input.sceneSnapshot.sceneId,
    ),
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
    const sceneCharacter = sceneSnapshot.characters.find(
      (character) => character.characterId === state.characterId,
    );
    return sceneCharacter ? sceneCharacter : state;
  });
  const existingLocation = kernel.locationStates.find(
    (location) => location.name.toLowerCase() === sceneSnapshot.location.name.toLowerCase(),
  );
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
    // FIX-3 : préserve les events irréversibles à travers les slices.
    eventLog: capEventLogPreservingIrreversible([...events, ...kernel.eventLog], 60),
  };
}
