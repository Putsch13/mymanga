import { describe, expect, it } from "vitest";
import { parseVisualWorldContract } from "@manga-ai-studio/core";
import { assertVisualWorldContractPremiumInvariants } from "./visual-world-composer";

describe("assertVisualWorldContractPremiumInvariants", () => {
  it("rejette une créature référencée sur beatBinding absente de creatures[]", () => {
    const raw = {
      chapterId: "ch1",
      source: "ai_generated",
      locations: [
        {
          id: "loc-1",
          label: "Lieu",
          kind: "int",
          description: "d",
          visualAnchors: [],
          architecture: [],
          lighting: [],
          atmosphere: [],
          recurringProps: [],
          negativeConstraints: [],
          source: "ai_generated",
          canonPolicy: "temporary",
        },
      ],
      props: [],
      npcGroups: [],
      creatures: [{ id: "cr1", label: "Bête", visualDescription: "x", requiredBeatIds: ["b1"] }],
      vehicles: [],
      factions: [],
      beatBindings: [
        {
          beatId: "b1",
          locationId: "loc-1",
          primaryPropIds: [],
          npcGroupIds: [],
          creatureIds: ["cr-ghost"],
          vehicleIds: [],
          factionIds: [],
        },
      ],
    };
    const contract = parseVisualWorldContract(raw);
    expect(contract.version).toBe(1);
    expect(() =>
      assertVisualWorldContractPremiumInvariants(contract, { chapterId: "ch1", expectedBeatIds: ["b1"] }),
    ).toThrow(/premium_visual_world_unknown_creature:cr-ghost/);
  });

  it("accepte beatBinding.creatureIds cohérents", () => {
    const raw = {
      chapterId: "ch1",
      source: "ai_generated",
      locations: [
        {
          id: "loc-1",
          label: "Lieu",
          kind: "int",
          description: "d",
          visualAnchors: [],
          architecture: [],
          lighting: [],
          atmosphere: [],
          recurringProps: [],
          negativeConstraints: [],
          source: "ai_generated",
          canonPolicy: "temporary",
        },
      ],
      props: [],
      npcGroups: [],
      creatures: [{ id: "cr1", label: "Bête", visualDescription: "x", requiredBeatIds: [] }],
      vehicles: [],
      factions: [],
      beatBindings: [
        {
          beatId: "b1",
          locationId: "loc-1",
          primaryPropIds: [],
          npcGroupIds: [],
          creatureIds: ["cr1"],
          vehicleIds: [],
          factionIds: [],
        },
      ],
    };
    const contract = parseVisualWorldContract(raw);
    expect(contract.version).toBe(1);
    expect(() =>
      assertVisualWorldContractPremiumInvariants(contract, { chapterId: "ch1", expectedBeatIds: ["b1"] }),
    ).not.toThrow();
  });
});
