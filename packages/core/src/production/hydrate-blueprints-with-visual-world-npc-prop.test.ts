import { describe, expect, it } from "vitest";
import type { PanelBlueprintPremium } from "../types/narrative-facts";
import { parseVisualWorldContract, type VisualWorldContract } from "../visual-world/visual-world-contract";
import { hydrateBlueprintsWithVisualWorldNpcAndProps } from "./hydrate-blueprints-with-visual-world-npc-prop";

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
        relationToCharacterIds: [],
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
        creatureIds: [],
        vehicleIds: [],
        factionIds: [],
        continuityObjectIds: [],
      },
    ],
    ...overrides,
  });
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
    expect(out.requiredProps?.[0].source).toBe("visual_world_contract");
    expect(out.propVisualDna?.length).toBe(1);
    expect(out.propVisualDna?.[0].id).toBe("prop-crate");
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

  it("injecte créatures, véhicules et factions liés au beat comme npcVisualDna catégorisés", () => {
    const vw = minimalVw({
      creatures: [
        {
          id: "cr1",
          label: "Bête",
          visualDescription: "Massive shadow beast",
          requiredBeatIds: ["b1"],
          threatLevel: "high",
        },
      ],
      vehicles: [{ id: "v1", label: "Van", visualDescription: "Black van", requiredBeatIds: ["b1"], scale: "medium" }],
      factions: [
        {
          id: "f1",
          label: "Syndicat",
          visualMarkers: ["red armbands"],
          visualMotifs: [],
          colors: [],
          requiredBeatIds: ["b1"],
        },
      ],
    });
    const [out] = hydrateBlueprintsWithVisualWorldNpcAndProps({
      blueprints: [minimalBlueprint()],
      visualWorld: vw,
    });
    const byId = new Map(out.npcVisualDna?.map((d) => [d.continuityId, d]));
    expect(byId.get("npc-guard")?.category).toBe("antagonist_support");
    expect(byId.get("cr1")?.category).toBe("creature");
    expect(byId.get("v1")?.category).toBe("vehicle");
    expect(byId.get("f1")?.category).toBe("faction");
    expect(out.npcVisualDna?.length).toBe(4);
  });

  it("lie une créature au beat via beatBinding.creatureIds même sans requiredBeatIds sur la créature", () => {
    const locId = "loc-1";
    const vw = parseVisualWorldContract({
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
      props: [],
      npcGroups: [],
      creatures: [
        { id: "cr-bound", label: "Wyrm", visualDescription: "Long serpent métallique", requiredBeatIds: [] },
      ],
      vehicles: [],
      factions: [],
      beatBindings: [
        {
          beatId: "b1",
          locationId: locId,
          primaryPropIds: [],
          npcGroupIds: [],
          creatureIds: ["cr-bound"],
          vehicleIds: [],
          factionIds: [],
          continuityObjectIds: [],
        },
      ],
    });
    const [out] = hydrateBlueprintsWithVisualWorldNpcAndProps({
      blueprints: [minimalBlueprint()],
      visualWorld: vw,
    });
    const cr = out.npcVisualDna?.find((d) => d.continuityId === "cr-bound");
    expect(cr?.category).toBe("creature");
    expect(cr?.displayName).toBe("Wyrm");
  });
});
