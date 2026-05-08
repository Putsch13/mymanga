import { describe, expect, it } from "vitest";
import { hydrateBlueprintsWithEnvironmentDna, MissingVisualWorldError } from "./hydrate-blueprints-with-environment-dna";
import type { PanelBlueprintPremium } from "../types/narrative-facts";
import type { LocationCanon } from "../types/chapter-studio";
import { parseVisualWorldContract, type VisualWorldContract } from "../visual-world/visual-world-contract";

function minimalVw(overrides: Partial<VisualWorldContract> = {}): VisualWorldContract {
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
    beatBindings: [
      {
        beatId: "b1",
        locationId: locId,
        primaryPropIds: [],
        npcGroupIds: [],
        creatureIds: [],
        vehicleIds: [],
        factionIds: [],
        continuityObjectIds: [],
      },
    ],
    ...overrides,
  });
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
    expect(out.environmentVisualDna?.locationId).toBe("loc-1");
    expect(out.environmentVisualDna?.anchorId).toBe("loc-1");
    expect(out.environmentAnchorId).toBe("loc-1");
    expect(out.environmentVisualDna?.architectureHints).toContain("entrepôts");
    expect(out.environmentVisualDna?.atmosphere).toContain("brume");
    expect(out.environmentVisualDna?.visualAnchors).toContain("grues");
  });

  const bareBlueprint: PanelBlueprintPremium = {
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

  it("T3: visualWorld null + strict true → MissingVisualWorldError", () => {
    expect(() =>
      hydrateBlueprintsWithEnvironmentDna({
        blueprints: [bareBlueprint],
        visualWorld: null,
        strict: true,
      }),
    ).toThrow(MissingVisualWorldError);
  });

  it("T3: visualWorld null + locationCanons → fallback minimal applied", () => {
    const canon: LocationCanon = {
      locationId: "canon-loc-1",
      label: "Taverne",
      visualMarkers: ["enseigne rouillée"],
      architecture: ["bois sombre"],
      density: "moderate",
      atmosphere: ["chaleur"],
      timeOfDayVariants: [],
      weatherVariants: [],
      mustKeep: [],
      forbiddenDrift: ["neon"],
      isPrimary: true,
      fixedElements: [],
      lightingRules: ["chandelles"],
      palette: [],
      referenceImages: [],
    };

    const [out] = hydrateBlueprintsWithEnvironmentDna({
      blueprints: [bareBlueprint],
      visualWorld: null,
      locationCanons: [canon],
    });

    expect(out.environmentVisualDna).toBeDefined();
    expect(out.environmentVisualDna?.locationName).toBe("Taverne");
    expect(out.environmentVisualDna?.locationId).toBe("canon-loc-1");
    expect(out.environmentVisualDna?.visualAnchors).toContain("enseigne rouillée");
    expect(out.environmentVisualDna?.architectureHints).toContain("bois sombre");
    expect(out.environmentVisualDna?.atmosphere).toContain("chaleur");
    expect(out.environmentVisualDna?.lightingHints).toContain("chandelles");
    expect(out.environmentVisualDna?.forbiddenDrift).toContain("neon");
  });

  it("T3: visualWorld null + locationCanons → selects primary canon", () => {
    const secondary: LocationCanon = {
      locationId: "loc-sec",
      label: "Ruelle",
      visualMarkers: [],
      architecture: [],
      atmosphere: [],
      forbiddenDrift: [],
      isPrimary: false,
      fixedElements: [],
      lightingRules: [],
      palette: [],
      referenceImages: [],
      mustKeep: [],
      timeOfDayVariants: [],
      weatherVariants: [],
    };
    const primary: LocationCanon = {
      locationId: "loc-pri",
      label: "Arène",
      visualMarkers: ["colonnes"],
      architecture: ["romaine"],
      atmosphere: ["poussiéreuse"],
      forbiddenDrift: [],
      isPrimary: true,
      fixedElements: [],
      lightingRules: [],
      palette: [],
      referenceImages: [],
      mustKeep: [],
      timeOfDayVariants: [],
      weatherVariants: [],
    };

    const [out] = hydrateBlueprintsWithEnvironmentDna({
      blueprints: [bareBlueprint],
      visualWorld: null,
      locationCanons: [secondary, primary],
    });

    expect(out.environmentVisualDna?.locationName).toBe("Arène");
  });

  it("T4: beat sans locationId bindé → fallback première location du contrat", () => {
    const vw = minimalVw({
      beatBindings: [
        {
          beatId: "b1",
          primaryPropIds: [],
          npcGroupIds: [],
          creatureIds: [],
          vehicleIds: [],
          factionIds: [],
          continuityObjectIds: [],
        },
      ],
    });
    const bp: PanelBlueprintPremium = {
      ...bareBlueprint,
      beatId: "b1",
    };
    const [out] = hydrateBlueprintsWithEnvironmentDna({
      blueprints: [bp],
      visualWorld: vw,
      strict: true,
    });
    expect(out.environmentVisualDna?.locationName).toBe("Port");
    expect(out.environmentVisualDna?.locationId).toBe("loc-1");
  });

  it("T5: beat absent des beatBindings → fallback première location du contrat", () => {
    const vw = minimalVw();
    const bp: PanelBlueprintPremium = {
      ...bareBlueprint,
      beatId: "b_unknown",
    };
    const [out] = hydrateBlueprintsWithEnvironmentDna({
      blueprints: [bp],
      visualWorld: vw,
    });
    expect(out.environmentVisualDna?.locationName).toBe("Port");
  });

  it("T6: beat absent + contrat sans locations → blueprint inchangé", () => {
    const vw = minimalVw({ locations: [], beatBindings: [] });
    const bp: PanelBlueprintPremium = {
      ...bareBlueprint,
      beatId: "b_unknown",
    };
    const [out] = hydrateBlueprintsWithEnvironmentDna({
      blueprints: [bp],
      visualWorld: vw,
    });
    expect(out.environmentVisualDna).toBeUndefined();
  });
});
