import { describe, expect, it } from "vitest";
import type { PanelBlueprintPremium } from "../types/narrative-facts";
import type { VisualWorldContract } from "../visual-world/visual-world-contract";
import { hydrateBlueprintsWithVisualWorldNpcAndProps } from "./hydrate-blueprints-with-visual-world-npc-prop";

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
        id: "prop-crate",
        canonicalName: "Caisse scellée",
        category: "evidence",
        visualDescription: "Caisse métallique rayée",
        ownerCharacterId: null,
        locationId: locId,
        requiredBeatIds: ["b1"],
        continuityPolicy: "recurring",
      },
    ],
    npcGroups: [
      {
        id: "npc-guard",
        label: "Garde portuaire",
        role: "antagonist_support",
        visualProfile: "Imposant, manteau huilé",
        outfit: "Uniforme portuaire délavé",
        silhouette: "Large épaules",
        relationToLocation: "Poste de garde quai nord",
        requiredBeatIds: [],
        recurrencePolicy: "named",
      },
    ],
    creatures: [],
    vehicles: [],
    factions: [],
    beatBindings: [
      {
        beatId: "b1",
        locationId: locId,
        primaryPropIds: ["prop-crate"],
        npcGroupIds: ["npc-guard"],
      },
    ],
    ...overrides,
  };
}

function minimalBlueprint(overrides: Partial<PanelBlueprintPremium> = {}): PanelBlueprintPremium {
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
    ...overrides,
  };
}

describe("hydrateBlueprintsWithVisualWorldNpcAndProps", () => {
  it("retourne les blueprints inchangés si pas de visual world", () => {
    const bp = [minimalBlueprint()];
    expect(hydrateBlueprintsWithVisualWorldNpcAndProps({ blueprints: bp, visualWorld: null })).toEqual(bp);
  });

  it("fusionne npcVisualDna et requiredProps depuis beatBindings et listes par beat", () => {
    const vw = minimalVw();
    const [out] = hydrateBlueprintsWithVisualWorldNpcAndProps({
      blueprints: [minimalBlueprint()],
      visualWorld: vw,
    });
    expect(out.npcVisualDna?.length).toBe(1);
    expect(out.npcVisualDna?.[0].continuityId).toBe("npc-guard");
    expect(out.npcVisualDna?.[0].displayName).toBe("Garde portuaire");
    expect(out.requiredProps?.length).toBe(1);
    expect(out.requiredProps?.[0].id).toBe("prop-crate");
    expect(out.requiredProps?.[0].canonicalName).toBe("Caisse scellée");
  });

  it("ne remplace pas les entrées existantes avec le même id", () => {
    const vw = minimalVw();
    const existingProp = {
      id: "prop-crate",
      canonicalName: "Ancien nom",
      aliases: [] as string[],
      category: "evidence",
      narrativeRole: "worldbuilding" as const,
      requiredForBeatIds: ["b1"],
      visibilityMode: "background_support" as const,
      mustBeVisible: true,
      confidence: 1,
      source: "story_inference" as const,
      ownerCategory: "ambient" as const,
      ownerId: null as string | null,
    };
    const [out] = hydrateBlueprintsWithVisualWorldNpcAndProps({
      blueprints: [
        minimalBlueprint({
          requiredProps: [existingProp],
        }),
      ],
      visualWorld: vw,
    });
    expect(out.requiredProps?.[0].canonicalName).toBe("Ancien nom");
  });
});
