import { describe, it, expect } from "vitest";
import {
  PREMIUM_DENSIFY_VARIANTS,
  densifyBlueprintsToPremiumRangeEstimate,
  densifyBlueprintsToPremiumRangeContract,
} from "./densify-premium-blueprints";
import { PRODUCTION_RULES } from "../production/production-rules";
import type { PanelBlueprintPremium } from "../types/narrative-facts";

function seedBp(beatId: string, idx: number): PanelBlueprintPremium {
  return {
    panelId: `${beatId}_p_${idx}`,
    beatId,
    panelNumber: idx + 1,
    purpose: "seed",
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
    mustShowCharacterIds: ["c1"],
    requiredCharacterIds: ["c1"],
  };
}

describe("densify-premium-blueprints", () => {
  it("expose une seule liste de variantes", () => {
    expect(PREMIUM_DENSIFY_VARIANTS.length).toBeGreaterThanOrEqual(6);
  });

  it("densifyBlueprintsToPremiumRangeEstimate remonte au minPanels", () => {
    const beats = [
      { beatId: "b1", blueprints: [seedBp("b1", 0), seedBp("b1", 1)] },
      { beatId: "b2", blueprints: [seedBp("b2", 0)] },
    ];
    const min = PRODUCTION_RULES.panelCount.minimum;
    const { blueprints, added } = densifyBlueprintsToPremiumRangeEstimate({
      beats,
      minPanels: min,
      maxPanels: PRODUCTION_RULES.panelCount.maximum,
    });
    expect(blueprints.length).toBe(min);
    expect(added).toBe(min - 3);
  });

  it("densifyBlueprintsToPremiumRangeContract renvoie des beats renumérotés", () => {
    const beats = [{ beatId: "b1", _blueprints: [seedBp("b1", 0)] }];
    const min = PRODUCTION_RULES.panelCount.minimum;
    const { allBlueprints, beats: outBeats } = densifyBlueprintsToPremiumRangeContract({
      beats,
      minPanels: min,
      maxPanels: PRODUCTION_RULES.panelCount.maximum,
    });
    expect(allBlueprints.length).toBe(min);
    expect(outBeats[0]?._blueprints.length).toBe(min);
    expect(allBlueprints[0]?.panelNumber).toBe(1);
    expect(allBlueprints[min - 1]?.panelNumber).toBe(min);
  });
});
