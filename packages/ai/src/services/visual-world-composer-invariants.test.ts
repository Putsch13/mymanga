import { describe, expect, it } from "vitest";
import { parseVisualWorldContract } from "@manga-ai-studio/core";
import { assertVisualWorldContractPremiumInvariants } from "./visual-world-composer";

describe("assertVisualWorldContractPremiumInvariants", () => {
  it("répare une créature référencée sur beatBinding absente de creatures[]", () => {
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
    const warnings = assertVisualWorldContractPremiumInvariants(contract, {
      chapterId: "ch1",
      expectedBeatIds: ["b1"],
    });
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toMatch(/cr-ghost/);
    const binding = contract.beatBindings.find((b) => b.beatId === "b1")!;
    expect(binding.creatureIds).toEqual([]);
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
    const warnings = assertVisualWorldContractPremiumInvariants(contract, {
      chapterId: "ch1",
      expectedBeatIds: ["b1"],
    });
    expect(warnings).toEqual([]);
  });

  it("répare un prop inconnu dans primaryPropIds", () => {
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
      creatures: [],
      vehicles: [],
      factions: [],
      beatBindings: [
        {
          beatId: "b1",
          locationId: "loc-1",
          primaryPropIds: ["train_japonais"],
          npcGroupIds: [],
          creatureIds: [],
          vehicleIds: [],
          factionIds: [],
        },
      ],
    };
    const contract = parseVisualWorldContract(raw);
    const warnings = assertVisualWorldContractPremiumInvariants(contract, {
      chapterId: "ch1",
      expectedBeatIds: ["b1"],
    });
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toMatch(/train_japonais/);
    expect(contract.beatBindings[0]!.primaryPropIds).toEqual([]);
  });

  it("répare un locationId manquant avec fallback première location (sous le seuil)", () => {
    // TODO-16 (MAJEUR) — Le seuil de tolérance pour les beats sans
    // locationId explicite est passé de 50% à 15%. On teste donc avec
    // 1 beat sur 8 en fallback (12.5%) — toujours sous le seuil.
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
        {
          id: "loc-2",
          label: "Autre lieu",
          kind: "int",
          description: "d2",
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
      creatures: [],
      vehicles: [],
      factions: [],
      beatBindings: [
        // 1 beat sur 8 en fallback (12.5% — sous le seuil 15% du TODO-16)
        { beatId: "b1", primaryPropIds: [], npcGroupIds: [], creatureIds: [], vehicleIds: [], factionIds: [] },
        { beatId: "b2", locationId: "loc-1", primaryPropIds: [], npcGroupIds: [], creatureIds: [], vehicleIds: [], factionIds: [] },
        { beatId: "b3", locationId: "loc-2", primaryPropIds: [], npcGroupIds: [], creatureIds: [], vehicleIds: [], factionIds: [] },
        { beatId: "b4", locationId: "loc-1", primaryPropIds: [], npcGroupIds: [], creatureIds: [], vehicleIds: [], factionIds: [] },
        { beatId: "b5", locationId: "loc-1", primaryPropIds: [], npcGroupIds: [], creatureIds: [], vehicleIds: [], factionIds: [] },
        { beatId: "b6", locationId: "loc-2", primaryPropIds: [], npcGroupIds: [], creatureIds: [], vehicleIds: [], factionIds: [] },
        { beatId: "b7", locationId: "loc-1", primaryPropIds: [], npcGroupIds: [], creatureIds: [], vehicleIds: [], factionIds: [] },
        { beatId: "b8", locationId: "loc-2", primaryPropIds: [], npcGroupIds: [], creatureIds: [], vehicleIds: [], factionIds: [] },
      ],
    };
    const contract = parseVisualWorldContract(raw);
    const warnings = assertVisualWorldContractPremiumInvariants(contract, {
      chapterId: "ch1",
      expectedBeatIds: ["b1", "b2", "b3", "b4", "b5", "b6", "b7", "b8"],
    });
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toMatch(/fallback/);
    expect(contract.beatBindings[0]!.locationId).toBe("loc-1");
  });

  it("rejette le contrat quand >15% des beats sont en fallback location (TODO-16)", () => {
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
      creatures: [],
      vehicles: [],
      factions: [],
      beatBindings: [
        // 2 beats sur 4 en fallback (50% — au-dessus du seuil 15% du TODO-16)
        { beatId: "b1", primaryPropIds: [], npcGroupIds: [], creatureIds: [], vehicleIds: [], factionIds: [] },
        { beatId: "b2", primaryPropIds: [], npcGroupIds: [], creatureIds: [], vehicleIds: [], factionIds: [] },
        { beatId: "b3", locationId: "loc-1", primaryPropIds: [], npcGroupIds: [], creatureIds: [], vehicleIds: [], factionIds: [] },
        { beatId: "b4", locationId: "loc-1", primaryPropIds: [], npcGroupIds: [], creatureIds: [], vehicleIds: [], factionIds: [] },
      ],
    };
    const contract = parseVisualWorldContract(raw);
    expect(() =>
      assertVisualWorldContractPremiumInvariants(contract, {
        chapterId: "ch1",
        expectedBeatIds: ["b1", "b2", "b3", "b4"],
      }),
    ).toThrow(/premium_visual_world_location_fallback_excess/);
  });

  it("throw sur chapterId mismatch (erreur structurelle)", () => {
    const raw = {
      chapterId: "ch-wrong",
      source: "ai_generated",
      locations: [],
      props: [],
      npcGroups: [],
      creatures: [],
      vehicles: [],
      factions: [],
      beatBindings: [],
    };
    const contract = parseVisualWorldContract(raw);
    expect(() =>
      assertVisualWorldContractPremiumInvariants(contract, {
        chapterId: "ch1",
        expectedBeatIds: [],
      }),
    ).toThrow(/premium_visual_world_chapter_mismatch/);
  });
});
