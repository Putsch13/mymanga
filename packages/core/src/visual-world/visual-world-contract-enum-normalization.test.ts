import { describe, it, expect } from "vitest";
import { parseVisualWorldContract } from "./visual-world-contract";

function buildMinimalContract(overrides: Record<string, unknown> = {}) {
  return {
    chapterId: "ch1",
    source: "ai_generated",
    locations: [
      {
        id: "loc1",
        label: "Port",
        kind: "harbor",
        description: "un port",
        source: "ai_generated",
        canonPolicy: "locked",
      },
    ],
    props: [],
    npcGroups: [],
    creatures: [],
    vehicles: [],
    factions: [],
    beatBindings: [
      { beatId: "b1", locationId: "loc1" },
    ],
    ...overrides,
  };
}

describe("T1 — VisualWorldContract enum normalization", () => {
  it("parses when all enum fields are normal strings", () => {
    const result = parseVisualWorldContract(buildMinimalContract());
    expect(result.source).toBe("ai_generated");
    expect(result.locations[0].source).toBe("ai_generated");
    expect(result.locations[0].canonPolicy).toBe("locked");
  });

  it("normalizes enum fields returned as single-element arrays", () => {
    const result = parseVisualWorldContract(
      buildMinimalContract({
        source: ["studio_curated"],
        locations: [
          {
            id: "loc1",
            label: "Port",
            kind: "harbor",
            description: "un port",
            source: ["story_text"],
            canonPolicy: ["temporary"],
          },
        ],
      }),
    );
    expect(result.source).toBe("studio_curated");
    expect(result.locations[0].source).toBe("story_text");
    expect(result.locations[0].canonPolicy).toBe("temporary");
  });

  it("normalizes prop continuityPolicy and visibilityPolicy arrays", () => {
    const result = parseVisualWorldContract(
      buildMinimalContract({
        props: [
          {
            id: "prop1",
            canonicalName: "Sword",
            category: "weapon",
            visualDescription: "a sword",
            continuityPolicy: ["recurring"],
            visibilityPolicy: ["visible"],
          },
        ],
      }),
    );
    expect(result.props[0].continuityPolicy).toBe("recurring");
    expect(result.props[0].visibilityPolicy).toBe("visible");
  });

  it("normalizes npcGroup recurrencePolicy array", () => {
    const result = parseVisualWorldContract(
      buildMinimalContract({
        npcGroups: [
          {
            id: "npc1",
            label: "Guards",
            role: "patrol",
            visualProfile: "armored",
            outfit: "chain mail",
            silhouette: "tall",
            recurrencePolicy: ["named"],
          },
        ],
      }),
    );
    expect(result.npcGroups[0].recurrencePolicy).toBe("named");
  });

  it("normalizes creature threatLevel array", () => {
    const result = parseVisualWorldContract(
      buildMinimalContract({
        creatures: [
          {
            id: "c1",
            label: "Wolf",
            visualDescription: "big wolf",
            threatLevel: ["high"],
          },
        ],
      }),
    );
    expect(result.creatures[0].threatLevel).toBe("high");
  });

  it("normalizes vehicle scale array", () => {
    const result = parseVisualWorldContract(
      buildMinimalContract({
        vehicles: [
          {
            id: "v1",
            label: "Ship",
            visualDescription: "merchant ship",
            scale: ["massive"],
          },
        ],
      }),
    );
    expect(result.vehicles[0].scale).toBe("massive");
  });

  it("full contract with ALL enum fields as arrays parses successfully", () => {
    const result = parseVisualWorldContract({
      chapterId: "ch_full",
      source: ["mixed"],
      locations: [
        {
          id: "loc1",
          label: "Market",
          kind: "outdoor",
          description: "busy market",
          source: ["user_canon"],
          canonPolicy: ["promote_candidate"],
        },
      ],
      props: [
        {
          id: "prop1",
          canonicalName: "Map",
          category: "document",
          visualDescription: "old map",
          continuityPolicy: ["symbolic"],
          visibilityPolicy: ["mentioned"],
        },
      ],
      npcGroups: [
        {
          id: "npc1",
          label: "Merchants",
          role: "background",
          visualProfile: "colorful",
          outfit: "robes",
          silhouette: "varied",
          recurrencePolicy: ["background"],
        },
      ],
      creatures: [
        {
          id: "c1",
          label: "Cat",
          visualDescription: "small cat",
          threatLevel: ["low"],
        },
      ],
      vehicles: [
        {
          id: "v1",
          label: "Cart",
          visualDescription: "wooden cart",
          scale: ["small"],
        },
      ],
      factions: [],
      beatBindings: [
        { beatId: "b1", locationId: "loc1" },
      ],
    });

    expect(result.source).toBe("mixed");
    expect(result.locations[0].source).toBe("user_canon");
    expect(result.locations[0].canonPolicy).toBe("promote_candidate");
    expect(result.props[0].continuityPolicy).toBe("symbolic");
    expect(result.props[0].visibilityPolicy).toBe("mentioned");
    expect(result.npcGroups[0].recurrencePolicy).toBe("background");
    expect(result.creatures[0].threatLevel).toBe("low");
    expect(result.vehicles[0].scale).toBe("small");
  });
});
