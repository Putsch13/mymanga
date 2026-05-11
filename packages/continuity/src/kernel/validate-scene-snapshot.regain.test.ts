/**
 * Tests TODO-5 (CRITIQUE) — Inversion logique BUG-19.
 *
 * Avant : `eventLog` est trié DESC (récent en idx 0), mais le filter
 * `gainIdx < lossIdx` traitait un gain RÉCENT (idx 0) comme antérieur à
 * une perte ANCIENNE (idx 5) → l'item était à tort marqué "toujours perdu".
 * Conséquence : faux positif `timeline_violation` à chaque scène.
 */
import { describe, it, expect } from "vitest";
import { validateSceneSnapshotAgainstKernel } from "./validate-scene-snapshot";
import type {
  ContinuityKernel,
  EventLedgerEntry,
  SceneSnapshot,
  CharacterState,
} from "../types";

function buildLedgerEvent(
  partial: Partial<EventLedgerEntry> & {
    eventId: string;
    chapterNumber: number;
    actorIds: string[];
    eventType: string;
  },
): EventLedgerEntry {
  return {
    eventId: partial.eventId,
    chapterId: `chap-${partial.chapterNumber}`,
    sceneId: null,
    chapterNumber: partial.chapterNumber,
    sceneNumber: null,
    eventType: partial.eventType,
    title: partial.eventType,
    description: partial.eventType,
    actorIds: partial.actorIds,
    location: null,
    consequences: [],
    objectsGained: partial.objectsGained ?? [],
    objectsLost: partial.objectsLost ?? [],
    injuriesApplied: [],
    injuriesResolved: [],
    relationshipChanges: [],
    continuityFlags: [],
    irreversible: partial.irreversible ?? false,
    importance: partial.importance ?? "minor",
  };
}

const characterId = "char-lux";

const baseCharacterState: CharacterState = {
  characterId,
  identity: { stableName: "Lux", roleType: "hero" },
  appearanceLocked: {
    hairColor: null,
    eyeColor: null,
    silhouette: null,
    scars: [],
    tattoos: [],
    fixedAccessories: [],
    forbiddenVisualDrift: [],
  },
  psychologicalCanon: {
    coreTraits: [],
    fears: [],
    motivations: [],
    speechRules: [],
  },
  physicalCanon: {
    baselineOutfit: null,
    allowedOutfitVariations: [],
    bodyMarkers: [],
  },
  currentState: {
    location: "lieu-init",
    outfit: null,
    injuries: [],
    fatigue: 0,
    emotion: null,
    objective: null,
    possessions: [],
    knowledge: [],
    obligations: [],
  },
  continuityObligations: [],
  relationshipStates: [],
};

function buildKernel(eventLog: EventLedgerEntry[]): ContinuityKernel {
  return {
    storyBible: {
      worldRules: [],
      themes: [],
      loreFacts: [],
      lockedCanonFacts: [],
      summary: null,
    },
    worldState: {
      activeLocations: [],
      factions: [],
      structuralProhibitions: [],
    },
    characterStates: [baseCharacterState],
    locationStates: [],
    relationshipGraph: [],
    eventLog,
    arcRegistry: [],
    chapterSnapshot: null,
  } as unknown as ContinuityKernel;
}

function buildSceneSnapshot(possessions: string[]): SceneSnapshot {
  return {
    chapterId: "chap-current",
    chapterNumber: 6,
    sceneId: "scene-current",
    sceneNumber: 1,
    title: "Scène test",
    summary: "Scène neutre sans verbe de récupération.",
    dramaticGoal: "test",
    location: {
      name: "lieu-temple",
      visualAnchors: [],
      occupants: [],
      importantProps: [],
      eventTraces: [],
    },
    sceneBlueprintHints: { visualAnchors: [], compositionHints: [] },
    characters: [
      {
        ...baseCharacterState,
        currentState: { ...baseCharacterState.currentState, possessions },
      },
    ],
    relationshipGraph: [],
    structuredContinuity: null,
    continuityAnchors: [],
    textConstraints: [],
    recentEvents: [],
  } as unknown as SceneSnapshot;
}

describe("validateSceneSnapshotAgainstKernel — TODO-5 regain logic", () => {
  it("ne doit PAS flagger un objet regagné légitimement après une perte (regain plus récent)", () => {
    // eventLog DESC : idx 0 = plus RÉCENT
    // ch3 (idx 0) : gain de l'amulette (regain explicite)
    // ch2 (idx 1) : perte de l'amulette
    const eventLog: EventLedgerEntry[] = [
      buildLedgerEvent({
        eventId: "ev-gain-ch3",
        chapterNumber: 3,
        actorIds: [characterId],
        eventType: "inventory_change",
        objectsGained: ["amulette"],
      }),
      buildLedgerEvent({
        eventId: "ev-loss-ch2",
        chapterNumber: 2,
        actorIds: [characterId],
        eventType: "inventory_change",
        objectsLost: ["amulette"],
      }),
    ];
    const kernel = buildKernel(eventLog);
    const sceneSnapshot = buildSceneSnapshot(["amulette"]);

    const result = validateSceneSnapshotAgainstKernel({ kernel, sceneSnapshot });

    expect(
      result.issues.filter((i) => i.type === "timeline_violation"),
    ).toHaveLength(0);
  });

  it("doit flagger un objet perdu et JAMAIS regagné (perte sans gain ultérieur)", () => {
    // eventLog DESC :
    // ch5 (idx 0) : perte de la clé
    // (rien après)
    const eventLog: EventLedgerEntry[] = [
      buildLedgerEvent({
        eventId: "ev-loss-ch5",
        chapterNumber: 5,
        actorIds: [characterId],
        eventType: "inventory_change",
        objectsLost: ["clé"],
      }),
    ];
    const kernel = buildKernel(eventLog);
    const sceneSnapshot = buildSceneSnapshot(["clé"]);

    const result = validateSceneSnapshotAgainstKernel({ kernel, sceneSnapshot });

    expect(
      result.issues.filter((i) => i.type === "timeline_violation"),
    ).toHaveLength(1);
    expect(result.issues[0].message).toMatch(/clé/i);
  });

  it("doit flagger si la perte est plus RÉCENTE que le gain (perdu en dernier)", () => {
    // eventLog DESC :
    // ch5 (idx 0) : perte (le plus récent)
    // ch2 (idx 1) : gain (plus ancien)
    const eventLog: EventLedgerEntry[] = [
      buildLedgerEvent({
        eventId: "ev-loss-ch5",
        chapterNumber: 5,
        actorIds: [characterId],
        eventType: "inventory_change",
        objectsLost: ["bague"],
      }),
      buildLedgerEvent({
        eventId: "ev-gain-ch2",
        chapterNumber: 2,
        actorIds: [characterId],
        eventType: "inventory_change",
        objectsGained: ["bague"],
      }),
    ];
    const kernel = buildKernel(eventLog);
    const sceneSnapshot = buildSceneSnapshot(["bague"]);

    const result = validateSceneSnapshotAgainstKernel({ kernel, sceneSnapshot });

    expect(
      result.issues.filter((i) => i.type === "timeline_violation"),
    ).toHaveLength(1);
  });
});
