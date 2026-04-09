import { describe, expect, it } from "vitest";
import { computeFalSceneAssessment, computeSceneComplexityScore } from "./fal-scene-strategy";

describe("fal scene strategy", () => {
  it("classe une humiliation en cour de lycée comme environnement critique", () => {
    const assessment = computeFalSceneAssessment({
      mode: "PANEL_DRAFT",
      contentIntensityLayer: "TEEN",
      isNewCharacter: false,
      hasCanonReferences: true,
      characterCountInScene: 3,
      npcCount: 4,
      hasNpcGroup: true,
      shotType: "wide",
      environmentPriority: "high",
      environmentDensityRequired: "high",
      continuityWeight: 80,
      scenePurpose: "Kutsi humilie Miro dans la cour du lycée devant les autres élèves",
      needsInpaint: false,
      needsPoseVariation: false,
      preferPhotorealCover: false,
      explicitBlocked: false,
      goreStylizedMature: false,
    });

    expect(assessment.panelCategory).toBe("ESTABLISHING_ENVIRONMENT");
    expect(assessment.sceneArchetype).toBe("school_bullying");
    expect(assessment.referencePolicy).toBe("LIGHT");
    expect(assessment.retryPolicy).toBe("robust");
  });

  it("garde un portrait canon en character lock", () => {
    const assessment = computeFalSceneAssessment({
      mode: "CHARACTER_SHEET",
      contentIntensityLayer: "GENERAL_SAFE",
      isNewCharacter: false,
      hasCanonReferences: true,
      characterCountInScene: 1,
      continuityWeight: 90,
      needsInpaint: false,
      needsPoseVariation: false,
      preferPhotorealCover: false,
      explicitBlocked: false,
      goreStylizedMature: false,
    });

    expect(assessment.panelCategory).toBe("CHARACTER_LOCK");
    expect(assessment.referencePolicy).toBe("STRONG");
  });

  it("score davantage les scènes larges à décor dense", () => {
    const score = computeSceneComplexityScore({
      mode: "PANEL_DRAFT",
      contentIntensityLayer: "GENERAL_SAFE",
      isNewCharacter: false,
      hasCanonReferences: false,
      characterCountInScene: 4,
      npcCount: 3,
      shotType: "wide",
      environmentPriority: "high",
      environmentDensityRequired: "high",
      locationComplexity: 20,
      needsInpaint: false,
      needsPoseVariation: false,
      preferPhotorealCover: false,
      explicitBlocked: false,
      goreStylizedMature: false,
    });

    expect(score).toBeGreaterThanOrEqual(70);
  });
});
