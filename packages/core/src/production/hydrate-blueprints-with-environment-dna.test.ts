import { describe, expect, it } from "vitest";
import { hydrateBlueprintsWithEnvironmentDna } from "./hydrate-blueprints-with-environment-dna";
import type { PanelBlueprintPremium } from "../types/narrative-facts";
import type { VisualWorldContract } from "../visual-world/visual-world-contract";

function minimalVw(overrides: Partial<VisualWorldContract> = {}): VisualWorldContract {
  const locId = "loc-1";
  return {
    chapterId: "ch1",
    source: "ai_generated",
    locations: [
      {
        id: locId,
        label: "Port",
        kind: "exterior",
        description: "Quai venteux au crépuscule",
        visualAnchors: ["grues"],
        architecture: ["entrepôts"],
        lighting: ["lueur orange"],
        atmosphere: ["brume"],
        recurringProps: ["cordages"],
        negativeConstraints: ["pas de foule dense"],
        source: "ai_generated",
        canonPolicy: "temporary",
      },
    ],
    props: [],
    npcGroups: [],
    creatures: [],
    vehicles: [],
    factions: [],
    beatBindings: [{ beatId: "b1", locationId: locId, primaryPropIds: [], npcGroupIds: [] }],
    ...overrides,
  };
}

describe("hydrateBlueprintsWithEnvironmentDna", () => {
  it("retourne les blueprints inchangés si pas de visual world", () => {
    const bp: PanelBlueprintPremium[] = [
      {
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
      },
    ];
    expect(hydrateBlueprintsWithEnvironmentDna({ blueprints: bp, visualWorld: null })).toEqual(bp);
  });

  it("remplit environmentVisualDna depuis le contrat monde visuel", () => {
    const vw = minimalVw();
    const [out] = hydrateBlueprintsWithEnvironmentDna({
      blueprints: [
        {
          panelId: "p1",
          beatId: "b1",
          panelNumber: 1,
          purpose: "establishing",
          shotType: "wide",
          cameraAngle: "eye_level",
          subjectFocus: "environment",
          mustShowEnemy: false,
          requiredNpcCount: 0,
          requiredProps: [],
          requiredLocationSignals: ["port"],
          cutawayType: "none",
          heroCenterAllowed: true,
          criticality: "medium",
          mustShowCharacterIds: [],
          requiredCharacterIds: [],
        },
      ],
      visualWorld: vw,
    });
    expect(out.environmentVisualDna?.locationName).toBe("Port");
    expect(out.environmentVisualDna?.anchorId).toBe("loc-1");
    expect(out.environmentVisualDna?.architectureHints).toContain("entrepôts");
  });
});
