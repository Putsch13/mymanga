/**
 * P0.1 (sprint 5) — `cutawayType` propage jusqu'à `computeFalSceneAssessment`
 * et empêche tout lock héros implicite.
 */
import { describe, expect, it } from "vitest";
import { computeFalSceneAssessment } from "./fal-scene-strategy";

function baseCtx(): Parameters<typeof computeFalSceneAssessment>[0] {
  return {
    mode: "PANEL_DRAFT",
    contentIntensityLayer: "TEEN",
    isNewCharacter: false,
    hasCanonReferences: true,
    characterCountInScene: 1,
    purpose: "reaction",
    shotType: "closeup",
    environmentPriority: "low",
    continuityWeight: 50,
    scenePurpose: "",
    needsInpaint: false,
    needsPoseVariation: false,
    preferPhotorealCover: false,
    explicitBlocked: false,
    goreStylizedMature: false,
    panelCharacterRoles: ["hero"],
    heroPresent: true,
    heroFocus: false,
    subjectFocus: null,
  };
}

describe("fal-scene-strategy — cutawayType priorité (P0.1)", () => {
  it("cutawayType=environment_establishing avec hero présent → ESTABLISHING_ENVIRONMENT (pas CHARACTER_LOCK)", () => {
    const a = computeFalSceneAssessment({
      ...baseCtx(),
      shotType: "wide",
      purpose: "establishing",
      scenePurpose: "Vue panoramique — héros en silhouette au loin",
      cutawayType: "environment_establishing",
      heroFocus: true, // même si heroFocus a été forcé (legacy caller), le cutaway prime
    });
    expect(a.panelCategory).toBe("ESTABLISHING_ENVIRONMENT");
    expect(a.referencePolicy).not.toBe("STRONG");
  });

  it("cutawayType=prop_insert avec hero présent → ESTABLISHING_ENVIRONMENT (pas CHARACTER_LOCK)", () => {
    const a = computeFalSceneAssessment({
      ...baseCtx(),
      shotType: "extreme_closeup",
      purpose: "prop_insert",
      scenePurpose: "Gros plan sur la dague posée près du héros",
      cutawayType: "prop_insert",
      heroFocus: true,
    });
    expect(a.panelCategory).toBe("ESTABLISHING_ENVIRONMENT");
    expect(a.panelCategory).not.toBe("CHARACTER_LOCK");
  });

  it("cutawayType=aftermath avec hero présent → ESTABLISHING_ENVIRONMENT (pas CHARACTER_LOCK)", () => {
    const a = computeFalSceneAssessment({
      ...baseCtx(),
      shotType: "medium",
      purpose: "aftermath",
      scenePurpose: "Ruines fumantes, le héros agenouillé en arrière-plan",
      cutawayType: "aftermath",
      heroFocus: true,
    });
    expect(a.panelCategory).toBe("ESTABLISHING_ENVIRONMENT");
  });

  it("cutawayType=reaction_insert avec hero présent → CHARACTER_IN_SCENE (pas CHARACTER_LOCK)", () => {
    const a = computeFalSceneAssessment({
      ...baseCtx(),
      characterCountInScene: 2,
      panelCharacterRoles: ["hero", "npc"],
      shotType: "closeup",
      purpose: "reaction",
      scenePurpose: "Réaction d'un témoin PNJ",
      cutawayType: "reaction_insert",
      heroFocus: true,
    });
    expect(a.panelCategory).toBe("CHARACTER_IN_SCENE");
    expect(a.panelCategory).not.toBe("CHARACTER_LOCK");
  });

  it("cutawayType=crowd → CHARACTER_IN_SCENE + crowdCritical", () => {
    const a = computeFalSceneAssessment({
      ...baseCtx(),
      shotType: "wide",
      characterCountInScene: 1,
      panelCharacterRoles: ["hero"],
      purpose: "establishing",
      scenePurpose: "Foule en panique autour du héros",
      npcCount: 10,
      hasNpcGroup: true,
      cutawayType: "crowd",
      heroFocus: true,
    });
    expect(a.panelCategory).toBe("CHARACTER_IN_SCENE");
    expect(a.crowdCritical).toBe(true);
  });

  it("cutawayType=null + subjectFocus=hero + hero seul closeup → CHARACTER_LOCK (comportement legacy conservé)", () => {
    const a = computeFalSceneAssessment({
      ...baseCtx(),
      shotType: "closeup",
      panelCharacterRoles: ["hero"],
      heroFocus: true,
      subjectFocus: "hero",
      cutawayType: null,
    });
    expect(a.panelCategory).toBe("CHARACTER_LOCK");
    expect(a.referencePolicy).toBe("STRONG");
  });
});
