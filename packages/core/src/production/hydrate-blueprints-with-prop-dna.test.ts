import { describe, expect, it } from "vitest";
import type { PanelBlueprintPremium } from "../types/narrative-facts";
import { parseVisualWorldContract, type VisualWorldContract } from "../visual-world/visual-world-contract";
import { hydrateBlueprintsWithPropDna } from "./hydrate-blueprints-with-prop-dna";

function minimalVw(): VisualWorldContract {
  const locId = "loc-1";
  return parseVisualWorldContract({
    version: 1,
    chapterId: "ch1",
    source: "ai_generated",
    locations: [
      {
        id: locId,
        label: "Port",
        kind: "exterior",
        description: "Quai",
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
    props: [
      {
        id: "p1",
        canonicalName: "Épée",
        category: "weapon",
        visualDescription: "Lame simple",
        ownerCharacterId: null,
        locationId: locId,
        requiredBeatIds: ["b1"],
        continuityPolicy: "recurring",
      },
    ],
    npcGroups: [],
    creatures: [],
    vehicles: [],
    factions: [],
    beatBindings: [
      {
        beatId: "b1",
        locationId: locId,
        primaryPropIds: ["bad-id"],
        npcGroupIds: [],
        creatureIds: [],
        vehicleIds: [],
        factionIds: [],
        continuityObjectIds: [],
      },
    ],
  });
}

function minimalBp(): PanelBlueprintPremium {
  return {
    panelId: "p1",
    beatId: "b1",
    panelNumber: 1,
    purpose: "x",
    shotType: "medium",
    cameraAngle: "eye_level",
    subjectFocus: "hero",
    mustShowEnemy: false,
    requiredNpcCount: 0,
    requiredProps: [],
    requiredLocationSignals: [],
    cutawayType: "none",
    heroCenterAllowed: true,
    criticality: "medium",
    mustShowCharacterIds: [],
    requiredCharacterIds: [],
  };
}

describe("hydrateBlueprintsWithPropDna", () => {
  it("strict : id prop inconnu sur le binding → skip graceful (pas de throw), props valides conservés", () => {
    const result = hydrateBlueprintsWithPropDna({
      blueprints: [minimalBp()],
      visualWorld: minimalVw(),
      strict: true,
    });
    expect(result).toHaveLength(1);
    const validPropIds = result[0]!.requiredProps.map((p) => p.id);
    expect(validPropIds).not.toContain("bad-id");
    expect(validPropIds).toContain("p1");
  });
});
