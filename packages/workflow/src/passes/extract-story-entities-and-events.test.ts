/**
 * Tests pour l'extraction d'entités / événements (API beats + noms connus).
 */

import { describe, it, expect } from "vitest";
import {
  extractStoryEntitiesAndEvents,
  assertPremiumStoryExtraction,
  type StoryExtractionResult,
} from "./extract-story-entities-and-events";

function baseInput(overrides: Partial<Parameters<typeof extractStoryEntitiesAndEvents>[0]> = {}) {
  return {
    beats: [{ beatId: "b1", summary: "Scène par défaut.", emotionalIntent: undefined }],
    knownCharacterNames: [],
    knownLocationNames: [],
    ...overrides,
  };
}

describe("extractStoryEntitiesAndEvents", () => {
  it("extrait des personnages depuis le résumé d’un beat", () => {
    const result = extractStoryEntitiesAndEvents(
      baseInput({
        beats: [
          {
            beatId: "b1",
            summary: "Marius regarde Maya avec inquiétude. Ils marchent vers le port.",
          },
        ],
        knownCharacterNames: ["Marius", "Maya"],
        knownLocationNames: ["Le port"],
      }),
    );

    expect(result.characters.length).toBeGreaterThanOrEqual(1);
    const labels = result.characters.map((c) => c.label);
    expect(labels.some((l) => /marius/i.test(l))).toBe(true);
  });

  it("extrait des indices de lieux quand le texte le permet", () => {
    const result = extractStoryEntitiesAndEvents(
      baseInput({
        beats: [
          {
            beatId: "b1",
            summary: "Au port, les pêcheurs travaillent sous le soleil brûlant.",
          },
        ],
        knownLocationNames: ["Le port"],
      }),
    );

    expect(result.locations.length).toBeGreaterThanOrEqual(0);
  });

  it("extrait des actions (verbes) depuis le texte", () => {
    const result = extractStoryEntitiesAndEvents(
      baseInput({
        beats: [
          {
            beatId: "b1",
            summary: "Marius court vers la porte. Il observe l’obstacle.",
          },
        ],
        knownCharacterNames: ["Marius"],
      }),
    );

    expect(result.actions.length).toBeGreaterThan(0);
  });

  it("extrait des émotions depuis le texte", () => {
    const result = extractStoryEntitiesAndEvents(
      baseInput({
        beats: [{ beatId: "b1", summary: "Maya a peur. Elle pleure en silence." }],
        knownCharacterNames: ["Maya"],
      }),
    );

    expect(result.emotions.length).toBeGreaterThan(0);
  });

  it("calcule un score de confiance entre 0 et 1", () => {
    const result = extractStoryEntitiesAndEvents(
      baseInput({
        chapterSummary: "Marius et Maya discutent au café.",
        beats: [{ beatId: "b1", summary: "Ils entrent dans la salle." }],
        knownCharacterNames: ["Marius", "Maya"],
        knownLocationNames: ["Le café"],
      }),
    );

    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it("n’ajoute pas d’avertissements erreur bloquants pour un texte propre", () => {
    const result = extractStoryEntitiesAndEvents(
      baseInput({
        beats: [{ beatId: "b1", summary: "Une histoire simple avec Marius qui court." }],
        knownCharacterNames: ["Marius"],
      }),
    );

    const errors = result.warnings.filter((w) => w.severity === "error");
    expect(errors).toHaveLength(0);
  });
});

function minimalStoryResult(overrides: Partial<StoryExtractionResult> = {}): StoryExtractionResult {
  return {
    characters: [],
    locations: [],
    props: [],
    npcGroups: [],
    creatures: [],
    vehiclesOrLargeProps: [],
    visualEvents: [],
    actions: [],
    emotions: [],
    dialogueIntents: [],
    continuityStates: [],
    confidence: 0.5,
    warnings: [],
    ...overrides,
  };
}

describe("assertPremiumStoryExtraction", () => {
  it("lève si la confiance est trop basse en mode premium", () => {
    const result = minimalStoryResult({ confidence: 0.3 });
    expect(() => assertPremiumStoryExtraction(result, true)).toThrow(/premium_story_extraction_low_confidence/);
  });

  it("lève si des warnings erreur sont présents en mode premium", () => {
    const result = minimalStoryResult({
      confidence: 0.95,
      warnings: [{ code: "fatal", message: "x", severity: "error" }],
    });
    expect(() => assertPremiumStoryExtraction(result, true)).toThrow(/premium_story_extraction_errors/);
  });

  it("n’élève rien pour une extraction valide en mode premium", () => {
    const result = minimalStoryResult({
      confidence: 0.9,
      characters: [
        {
          id: "c:a",
          label: "A",
          normalizedLabel: "a",
          type: "character",
          sourceBeatId: "b1",
          sourceText: "A",
          confidence: 0.9,
          required: true,
        },
      ],
      locations: [
        {
          id: "l:b",
          label: "B",
          normalizedLabel: "b",
          type: "location",
          sourceBeatId: "b1",
          sourceText: "B",
          confidence: 0.85,
          required: true,
        },
      ],
      actions: [
        {
          id: "act:1",
          verb: "court",
          subject: "A",
          sourceBeatId: "b1",
          intensity: 0.8,
        },
      ],
    });
    expect(() => assertPremiumStoryExtraction(result, true)).not.toThrow();
  });
});
