import { describe, expect, it } from "vitest";
import { parseVisualWorldContract } from "@manga-ai-studio/core";

describe("visualWorldContractSchema", () => {
  it("parse un contrat minimal valide", () => {
    const vw = parseVisualWorldContract({
      version: 1,
      chapterId: "ch1",
      source: "studio_curated",
      locations: [
        {
          id: "loc-a",
          label: "Rue",
          kind: "exterior",
          description: "Rue pluvieuse néon",
          visualAnchors: ["néon", "pluie"],
          architecture: [],
          lighting: ["contre-jour"],
          atmosphere: ["tension"],
          recurringProps: [],
          negativeConstraints: ["pas de soleil"],
          source: "user_canon",
          canonPolicy: "locked",
        },
      ],
      props: [],
      npcGroups: [],
      creatures: [],
      vehicles: [],
      factions: [],
      beatBindings: [],
    });
    expect(vw.chapterId).toBe("ch1");
    expect(vw.locations[0]?.canonPolicy).toBe("locked");
  });
});
