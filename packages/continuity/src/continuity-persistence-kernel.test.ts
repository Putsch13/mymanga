import { describe, expect, it } from "vitest";
import type { ChapterCanonStateData, ContinuityKernel, SceneStateData } from "./types";
import {
  applySceneEventsToKernel,
  buildChapterSnapshot,
  buildSceneSnapshot,
  deriveSceneEvents,
  materializeCanonStateFromChapterSnapshot,
  prohibitionIsViolated,
  validateSceneSnapshotAgainstKernel,
} from "./continuity-persistence-kernel";

function makeKernel(): ContinuityKernel {
  return {
    storyBible: {
      summary: "Monde sans résurrection ni retcon facile.",
      themes: ["survie"],
      worldRules: ["Le monde ne permet pas de résurrection."],
      loreFacts: [],
      lockedCanonFacts: [],
      globalTone: "dark",
    },
    worldState: {
      currentDateLabel: null,
      activeLocations: ["Laboratoire Omega"],
      activeThreats: ["aberration"],
      activeMysteries: [],
      factions: ["survivors"],
      zonesOfControl: {},
      structuralProhibitions: ["résurrection"],
      globalTone: "dark",
      techLevel: "advanced",
      magicLevel: null,
      globalFlags: {},
    },
    characterStates: [
      {
        characterId: "hero-1",
        identity: { stableName: "Luna", roleType: "hero" },
        appearanceLocked: {
          hairColor: "blue",
          eyeColor: "gold",
          silhouette: null,
          scars: [],
          tattoos: [],
          fixedAccessories: ["pendentif fissuré"],
          forbiddenVisualDrift: [],
        },
        psychologicalCanon: {
          coreTraits: ["créative"],
          fears: ["perdre le contrôle"],
          motivations: ["protéger son monde"],
          speechRules: [],
        },
        physicalCanon: {
          baselineOutfit: "hoodie bleu",
          allowedOutfitVariations: ["cape de pluie"],
          bodyMarkers: [],
        },
        currentState: {
          location: "Laboratoire Omega",
          outfit: "hoodie bleu",
          injuries: ["bras bandé"],
          fatigue: null,
          emotion: "panique",
          objective: "s'échapper",
          possessions: ["clé rouge"],
          knowledge: ["la créature dort sous la salle"],
          obligations: ["garder le pendentif visible"],
        },
        continuityObligations: ["garder le pendentif visible"],
        relationshipStates: [],
      },
    ],
    locationStates: [
      {
        locationId: "loc-1",
        name: "Laboratoire Omega",
        type: "lab",
        visualAnchors: ["cuves brisées", "signalétique biohazard"],
        state: "instable",
        occupants: ["Luna"],
        importantProps: ["clé rouge"],
        eventTraces: ["explosion passée"],
        damageMarkers: ["vitres fissurées"],
        corruptionMarkers: [],
        surveillanceMarkers: ["caméra cassée"],
        vegetationMarkers: [],
        narrativeFunction: "menace scientifique",
      },
    ],
    relationshipGraph: [],
    eventLog: [
      {
        eventId: "evt-loss",
        chapterId: "ch-1",
        sceneId: "sc-1",
        chapterNumber: 1,
        sceneNumber: 1,
        eventType: "inventory_change",
        title: "Objet perdu",
        description: "Luna perd la clé rouge dans la fuite.",
        actorIds: ["hero-1"],
        location: "Laboratoire Omega",
        consequences: [],
        objectsGained: [],
        objectsLost: ["clé rouge"],
        injuriesApplied: [],
        injuriesResolved: [],
        relationshipChanges: [],
        continuityFlags: [],
        irreversible: false,
        importance: "major",
      },
    ],
    arcRegistry: [
      {
        arcId: "arc-1",
        name: "Fuite du laboratoire",
        status: "open",
        setup: ["Luna doit sortir vivante"],
        progression: [],
        tension: 70,
        openPromises: ["sortir du laboratoire"],
        paidPromises: [],
        blockers: ["créature"],
        currentState: "pression maximale",
      },
    ],
    chapterSnapshot: null,
  };
}

describe("continuity persistence kernel", () => {
  it("detects an object reappearing without explicit regain event", () => {
    const kernel = makeKernel();
    const sceneStateData: SceneStateData = {
      location: "Laboratoire Omega",
      timeOfDay: "night",
      mood: "tense",
      dramaticGoal: "reprendre son souffle",
      conflictAxis: "survivre",
      presentCharacterIds: ["hero-1"],
      characterOverrides: [
        {
          characterId: "hero-1",
          outfit: "hoodie bleu",
          visibleInjuries: ["bras bandé"],
          emotionalState: "panique",
          props: ["clé rouge"],
          poseRestrictions: [],
        },
      ],
      continuityAnchors: ["Lieu verrouillé : Laboratoire Omega"],
      imageReferenceIds: [],
      textConstraints: ["Le pendentif doit rester visible."],
    };
    const snapshot = buildSceneSnapshot({
      kernel,
      chapterId: "ch-2",
      chapterNumber: 2,
      sceneId: "scene-2",
      sceneNumber: 1,
      summary: "Luna cache la clé rouge sans expliquer comment elle l'a récupérée.",
      dramaticGoal: "reprendre le contrôle",
      location: "Laboratoire Omega",
      sceneStateData,
      participantNames: ["Luna"],
      sceneBlueprints: [],
    });

    const validation = validateSceneSnapshotAgainstKernel({ kernel, sceneSnapshot: snapshot });
    expect(validation.accepted).toBe(false);
    expect(validation.issues.some((issue) => issue.type === "timeline_violation")).toBe(true);
  });

  it("materializes validated scene deltas into the chapter canon", () => {
    const kernel = makeKernel();
    kernel.eventLog = [];
    const sceneStateData: SceneStateData = {
      location: "Jardin des serres",
      timeOfDay: "sunset",
      mood: "emotional",
      dramaticGoal: "trouver un apaisement",
      conflictAxis: "souffler",
      presentCharacterIds: ["hero-1"],
      characterOverrides: [
        {
          characterId: "hero-1",
          outfit: "cape de pluie",
          visibleInjuries: ["bras bandé"],
          emotionalState: "calme",
          props: ["clé rouge", "journal"],
          poseRestrictions: [],
        },
      ],
      continuityAnchors: ["Lieu verrouillé : Jardin des serres"],
      imageReferenceIds: [],
      textConstraints: ["Le jardin doit rester reconnaissable."],
    };
    const snapshot = buildSceneSnapshot({
      kernel,
      chapterId: "ch-2",
      chapterNumber: 2,
      sceneId: "scene-2",
      sceneNumber: 1,
      title: "Respiration",
      summary: "Luna retrouve son calme dans le Jardin des serres et ramasse un journal.",
      dramaticGoal: "stabiliser l'émotion",
      location: "Jardin des serres",
      sceneStateData,
      participantNames: ["Luna"],
      sceneBlueprints: [],
    });
    const validation = validateSceneSnapshotAgainstKernel({ kernel, sceneSnapshot: snapshot });
    expect(validation.accepted).toBe(true);

    const events = deriveSceneEvents({ kernel, sceneSnapshot: snapshot });
    const nextKernel = applySceneEventsToKernel(kernel, snapshot, events);
    const chapterSnapshot = buildChapterSnapshot({
      kernel: nextKernel,
      chapterId: "ch-2",
      chapterNumber: 2,
      title: "Respiration",
      summary: snapshot.summary,
      sceneSnapshots: [snapshot],
      continuityWarnings: validation.warnings,
    });
    const baseCanon: ChapterCanonStateData = {
      worldState: kernel.worldState,
      characterStates: kernel.characterStates,
      openThreads: [],
      resolvedThreads: [],
      canonEvents: [],
      narrativeSummary: "Avant",
      continuityWarnings: [],
      registryVersion: 1,
    };
    const materialized = materializeCanonStateFromChapterSnapshot(baseCanon, chapterSnapshot);

    expect(materialized.characterStates[0]?.currentState.location).toBe("Jardin des serres");
    expect(materialized.characterStates[0]?.currentState.possessions).toContain("journal");
    expect(materialized.worldState.activeLocations).toContain("Jardin des serres");
    expect(materialized.canonEvents.length).toBeGreaterThan(0);
  });

  it("BUG-19 — un objet regagné via un event propre ne déclenche plus de violation", () => {
    const kernel = makeKernel();
    // Ajoute un event de regain postérieur à la perte pour la clé rouge.
    kernel.eventLog.push({
      eventId: "evt-regain",
      chapterId: "ch-1",
      sceneId: "sc-3",
      chapterNumber: 1,
      sceneNumber: 3,
      eventType: "inventory_change",
      title: "Clé retrouvée",
      description: "Luna retrouve la clé rouge dans une console cassée.",
      actorIds: ["hero-1"],
      location: "Laboratoire Omega",
      consequences: [],
      objectsGained: ["clé rouge"],
      objectsLost: [],
      injuriesApplied: [],
      injuriesResolved: [],
      relationshipChanges: [],
      continuityFlags: [],
      irreversible: false,
      importance: "major",
    });

    const sceneStateData: SceneStateData = {
      location: "Laboratoire Omega",
      timeOfDay: "night",
      mood: "tense",
      dramaticGoal: "avancer",
      conflictAxis: "survivre",
      presentCharacterIds: ["hero-1"],
      characterOverrides: [
        {
          characterId: "hero-1",
          outfit: "hoodie bleu",
          visibleInjuries: ["bras bandé"],
          emotionalState: "déterminée",
          props: ["clé rouge"],
          poseRestrictions: [],
        },
      ],
      continuityAnchors: [],
      imageReferenceIds: [],
      textConstraints: [],
    };
    const snapshot = buildSceneSnapshot({
      kernel,
      chapterId: "ch-2",
      chapterNumber: 2,
      sceneId: "scene-2",
      sceneNumber: 1,
      summary: "Luna glisse la clé rouge dans sa poche et repart.",
      dramaticGoal: "avancer",
      location: "Laboratoire Omega",
      sceneStateData,
      participantNames: ["Luna"],
      sceneBlueprints: [],
    });
    const validation = validateSceneSnapshotAgainstKernel({ kernel, sceneSnapshot: snapshot });
    expect(validation.accepted).toBe(true);
    expect(
      validation.issues.some(
        (issue) => issue.type === "timeline_violation" && issue.message.includes("clé rouge"),
      ),
    ).toBe(false);
  });

  it("BUG-18 — prohibitionIsViolated ignore les occurrences niées", () => {
    expect(prohibitionIsViolated("La cité sans magie reste calme.", "magie")).toBe(false);
    expect(prohibitionIsViolated("Pas de résurrection possible ici.", "résurrection")).toBe(false);
    expect(prohibitionIsViolated("Un mage invoque la magie interdite.", "magie")).toBe(true);
    expect(prohibitionIsViolated("No magic works in this room.", "magic")).toBe(false);
    expect(prohibitionIsViolated("He casts magic despite the ban.", "magic")).toBe(true);
  });

  it("BUG-18 — le validateur ne déclenche plus de lore_violation sur mention niée", () => {
    const kernel = makeKernel();
    const sceneStateData: SceneStateData = {
      location: "Laboratoire Omega",
      timeOfDay: "night",
      mood: "tense",
      dramaticGoal: "stabiliser",
      conflictAxis: "paix",
      presentCharacterIds: ["hero-1"],
      characterOverrides: [
        {
          characterId: "hero-1",
          outfit: "hoodie bleu",
          visibleInjuries: ["bras bandé"],
          emotionalState: "calme",
          props: ["clé rouge"],
          poseRestrictions: [],
        },
      ],
      continuityAnchors: [],
      imageReferenceIds: [],
      textConstraints: [],
    };
    const snapshot = buildSceneSnapshot({
      kernel,
      chapterId: "ch-2",
      chapterNumber: 2,
      sceneId: "scene-2",
      sceneNumber: 1,
      summary: "Dans ce monde sans résurrection possible, Luna veille sur ses morts.",
      dramaticGoal: "deuil",
      location: "Laboratoire Omega",
      sceneStateData,
      participantNames: ["Luna"],
      sceneBlueprints: [],
    });
    const validation = validateSceneSnapshotAgainstKernel({ kernel, sceneSnapshot: snapshot });
    expect(
      validation.issues.some(
        (issue) =>
          issue.type === "lore_violation"
          && issue.message.includes("interdiction structurelle"),
      ),
    ).toBe(false);
  });

  it("prefers structured deltas over ambiguous prose for inventory and relationships", () => {
    const kernel = makeKernel();
    kernel.relationshipGraph = [
      {
        sourceCharacterId: "hero-1",
        targetCharacterId: "hero-2",
        relationType: "hostile",
        intensity: 80,
        note: "méfiance",
        currentDynamic: "hostile",
      },
    ];
    kernel.characterStates.push({
      ...kernel.characterStates[0]!,
      characterId: "hero-2",
      identity: { stableName: "Soren", roleType: "ally" },
      currentState: {
        location: "Laboratoire Omega",
        outfit: "veste sombre",
        injuries: [],
        fatigue: null,
        emotion: "méfiant",
        objective: "surveiller Luna",
        possessions: [],
        knowledge: [],
        obligations: [],
      },
    });
    const sceneStateData: SceneStateData = {
      location: "Laboratoire Omega",
      timeOfDay: "night",
      mood: "tense",
      dramaticGoal: "conclure une trêve fragile",
      conflictAxis: "alliance",
      presentCharacterIds: ["hero-1", "hero-2"],
      characterOverrides: [
        {
          characterId: "hero-1",
          outfit: "hoodie bleu",
          visibleInjuries: ["bras bandé"],
          emotionalState: "déterminée",
          props: ["clé rouge"],
          poseRestrictions: [],
        },
        {
          characterId: "hero-2",
          outfit: "veste sombre",
          visibleInjuries: [],
          emotionalState: "calme",
          props: [],
          poseRestrictions: [],
        },
      ],
      continuityAnchors: [],
      imageReferenceIds: [],
      textConstraints: [],
    };
    const snapshot = buildSceneSnapshot({
      kernel,
      chapterId: "ch-2",
      chapterNumber: 2,
      sceneId: "scene-2",
      sceneNumber: 1,
      summary: "Luna retrouve la clé rouge et Soren accepte enfin une trêve.",
      dramaticGoal: "faire équipe",
      location: "Laboratoire Omega",
      sceneStateData,
      participantNames: ["Luna", "Soren"],
      sceneBlueprints: [],
      continuityPayload: {
        source: "generator_structured",
        confidence: 0.92,
        sceneEvents: [
          {
            eventType: "inventory_change",
            title: "Clé récupérée",
            description: "Luna récupère explicitement la clé rouge.",
            actorNames: ["Luna"],
            location: "Laboratoire Omega",
            objectsGained: ["clé rouge"],
            continuityFlags: ["inventory_persisted"],
            importance: "major",
          },
        ],
        characterDeltas: [
          {
            characterName: "Luna",
            location: "Laboratoire Omega",
            emotionalState: "déterminée",
            objective: "faire équipe",
            gainedItems: ["clé rouge"],
            relationshipChanges: [
              {
                targetCharacterName: "Soren",
                shift: "trêve fragile",
                intensityDelta: -30,
              },
            ],
          },
          {
            characterName: "Soren",
            location: "Laboratoire Omega",
            emotionalState: "calme",
            objective: "coopérer",
          },
        ],
        locationDeltas: [],
        arcDeltas: [
          {
            arcName: "Fuite du laboratoire",
            progression: ["Luna et Soren forment une trêve."],
            tensionDelta: -10,
            currentState: "coopération fragile",
          },
        ],
      },
    });

    const validation = validateSceneSnapshotAgainstKernel({ kernel, sceneSnapshot: snapshot });
    expect(validation.accepted).toBe(true);

    const events = deriveSceneEvents({ kernel, sceneSnapshot: snapshot });
    expect(events[0]?.objectsGained).toContain("clé rouge");
    const nextKernel = applySceneEventsToKernel(kernel, snapshot, events);
    expect(nextKernel.relationshipGraph[0]?.currentDynamic).toBe("trêve fragile");
    expect(nextKernel.arcRegistry[0]?.currentState).toBe("coopération fragile");
  });
});
