import { describe, expect, it } from "vitest";
import { computeFalSceneAssessment } from "./fal-scene-heuristics";

describe("computeFalSceneAssessment hero lock policy", () => {
  it("n'autorise pas NONE quand un héros est en close-up", () => {
    const assessment = computeFalSceneAssessment({
      mode: "PANEL_DRAFT",
      contentIntensityLayer: "TEEN",
      isNewCharacter: false,
      hasCanonReferences: true,
      characterCountInScene: 1,
      purpose: "reaction",
      shotType: "closeup",
      environmentPriority: "low",
      continuityWeight: 70,
      scenePurpose: "Le héros comprend la trahison",
      styleBackgroundDensity: "medium",
      needsInpaint: false,
      needsPoseVariation: false,
      preferPhotorealCover: false,
      explicitBlocked: false,
      goreStylizedMature: false,
      panelCharacterRoles: ["hero"],
      heroPresent: true,
      heroFocus: true,
    });

    expect(assessment.referencePolicy).toBe("STRONG");
    expect(assessment.panelCategory).toBe("CHARACTER_LOCK");
  });

  it("garde au moins LIGHT quand un personnage canonique est présent", () => {
    const assessment = computeFalSceneAssessment({
      mode: "PANEL_DRAFT",
      contentIntensityLayer: "TEEN",
      isNewCharacter: false,
      hasCanonReferences: true,
      characterCountInScene: 2,
      purpose: "dialogue",
      shotType: "medium",
      environmentPriority: "high",
      continuityWeight: 60,
      scenePurpose: "Discussion entre héros et allié",
      styleBackgroundDensity: "high",
      needsInpaint: false,
      needsPoseVariation: false,
      preferPhotorealCover: false,
      explicitBlocked: false,
      goreStylizedMature: false,
      panelCharacterRoles: ["support", "ally"],
      heroPresent: false,
      heroFocus: false,
    });

    expect(["LIGHT", "STRONG"]).toContain(assessment.referencePolicy);
  });
});
