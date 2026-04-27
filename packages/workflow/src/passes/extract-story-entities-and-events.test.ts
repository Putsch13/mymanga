/**
 * extract-story-entities-and-events.test.ts
 *
 * P1.18 — Tests pour l'extraction d'entités narratives.
 */

import { describe, it, expect } from "vitest";
import {
  extractStoryEntitiesAndEvents,
  assertPremiumStoryExtraction,
} from "./extract-story-entities-and-events";

describe("extractStoryEntitiesAndEvents", () => {
  it("should extract characters from simple text", () => {
    const result = extractStoryEntitiesAndEvents({
      storyText: "Marius regarde Maya avec inquiétude. Ils marchent vers le port.",
      knownCharacters: [
        { id: "marius", name: "Marius" },
        { id: "maya", name: "Maya" },
      ],
      knownLocations: [{ id: "port", name: "Le port" }],
    });

    expect(result.entities.characters).toHaveLength(2);
    expect(result.entities.characters.map((c) => c.name)).toContain("Marius");
    expect(result.entities.characters.map((c) => c.name)).toContain("Maya");
  });

  it("should extract locations", () => {
    const result = extractStoryEntitiesAndEvents({
      storyText: "Au port, les pêcheurs travaillent sous le soleil brûlant.",
      knownCharacters: [],
      knownLocations: [{ id: "port", name: "Le port" }],
    });

    expect(result.entities.locations.length).toBeGreaterThanOrEqual(1);
  });

  it("should extract actions from text", () => {
    const result = extractStoryEntitiesAndEvents({
      storyText: "Marius court vers la porte. Il saute par-dessus l'obstacle.",
      knownCharacters: [{ id: "marius", name: "Marius" }],
      knownLocations: [],
    });

    expect(result.events.actions.length).toBeGreaterThan(0);
  });

  it("should extract emotions", () => {
    const result = extractStoryEntitiesAndEvents({
      storyText: "Maya est triste. Elle pleure en silence.",
      knownCharacters: [{ id: "maya", name: "Maya" }],
      knownLocations: [],
    });

    expect(result.events.emotions.length).toBeGreaterThan(0);
  });

  it("should detect props mentioned in narrative", () => {
    const result = extractStoryEntitiesAndEvents({
      storyText: "Il brandit son épée et regarde la carte ancienne.",
      knownCharacters: [],
      knownLocations: [],
      knownProps: [
        { id: "sword", name: "épée" },
        { id: "map", name: "carte" },
      ],
    });

    expect(result.entities.props.length).toBeGreaterThanOrEqual(1);
  });

  it("should calculate confidence score", () => {
    const result = extractStoryEntitiesAndEvents({
      storyText: "Marius et Maya discutent au café.",
      knownCharacters: [
        { id: "marius", name: "Marius" },
        { id: "maya", name: "Maya" },
      ],
      knownLocations: [{ id: "cafe", name: "Le café" }],
    });

    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it("should not have errors for clean extraction", () => {
    const result = extractStoryEntitiesAndEvents({
      storyText: "Une histoire simple avec Marius.",
      knownCharacters: [{ id: "marius", name: "Marius" }],
      knownLocations: [],
    });

    expect(result.errors).toHaveLength(0);
  });
});

describe("assertPremiumStoryExtraction", () => {
  it("should throw if confidence is too low in premium mode", () => {
    const result = {
      entities: {
        characters: [],
        locations: [],
        props: [],
        npcs: [],
        creatures: [],
        vehicles: [],
      },
      events: {
        actions: [],
        emotions: [],
        visualEvents: [],
        dialogueIntents: [],
        continuityStates: [],
      },
      confidence: 0.3,
      errors: [],
    };

    expect(() => assertPremiumStoryExtraction(result, true)).toThrow();
  });

  it("should throw if errors exist in premium mode", () => {
    const result = {
      entities: {
        characters: [{ id: "a", name: "A", confidence: 0.9 }],
        locations: [],
        props: [],
        npcs: [],
        creatures: [],
        vehicles: [],
      },
      events: {
        actions: [],
        emotions: [],
        visualEvents: [],
        dialogueIntents: [],
        continuityStates: [],
      },
      confidence: 0.9,
      errors: ["unknown_entity_type"],
    };

    expect(() => assertPremiumStoryExtraction(result, true)).toThrow();
  });

  it("should not throw for valid extraction in premium mode", () => {
    const result = {
      entities: {
        characters: [{ id: "a", name: "A", confidence: 0.9 }],
        locations: [{ id: "b", name: "B", confidence: 0.8 }],
        props: [],
        npcs: [],
        creatures: [],
        vehicles: [],
      },
      events: {
        actions: [{ type: "run", subject: "A", confidence: 0.8 }],
        emotions: [],
        visualEvents: [],
        dialogueIntents: [],
        continuityStates: [],
      },
      confidence: 0.85,
      errors: [],
    };

    expect(() => assertPremiumStoryExtraction(result, true)).not.toThrow();
  });
});
