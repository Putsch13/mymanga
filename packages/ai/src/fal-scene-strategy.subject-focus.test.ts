import { describe, expect, it } from "vitest";
import { computeFalSceneAssessment } from "./fal-scene-strategy";

/**
 * P0.4 — Le routing ne doit plus reclassifier implicitement un panel en
 * "hero focus / STRONG" parce qu'un close-up est choisi et que le héros est
 * présent. La décision doit être dominée par le `subjectFocus` du blueprint.
 */
describe("fal-scene-strategy — subject focus (P0.4)", () => {
  it("close-up ennemi avec héros présent ne force pas STRONG hero policy", () => {
    const assessment = computeFalSceneAssessment({
      mode: "PANEL_DRAFT",
      contentIntensityLayer: "TEEN",
      isNewCharacter: false,
      hasCanonReferences: true,
      characterCountInScene: 2,
      purpose: "reaction",
      shotType: "closeup",
      environmentPriority: "low",
      continuityWeight: 60,
      scenePurpose: "L'ennemi toise le héros",
      needsInpaint: false,
      needsPoseVariation: false,
      preferPhotorealCover: false,
      explicitBlocked: false,
      goreStylizedMature: false,
      panelCharacterRoles: ["enemy", "hero"],
      heroPresent: true,
      heroFocus: false,
      subjectFocus: "enemy",
    });

    expect(assessment.panelCategory).not.toBe("CHARACTER_LOCK");
    expect(["LIGHT", "NONE"]).toContain(assessment.referencePolicy);
  });

  it("reaction shot garde un focus non-héros (ne bascule pas STRONG)", () => {
    const assessment = computeFalSceneAssessment({
      mode: "PANEL_DRAFT",
      contentIntensityLayer: "TEEN",
      isNewCharacter: false,
      hasCanonReferences: true,
      characterCountInScene: 1,
      purpose: "reaction",
      shotType: "closeup",
      environmentPriority: "low",
      continuityWeight: 50,
      scenePurpose: "Réaction d'un PNJ témoin",
      needsInpaint: false,
      needsPoseVariation: false,
      preferPhotorealCover: false,
      explicitBlocked: false,
      goreStylizedMature: false,
      panelCharacterRoles: ["npc", "hero"],
      heroPresent: true,
      heroFocus: false,
      subjectFocus: "reaction",
    });

    expect(assessment.panelCategory).not.toBe("CHARACTER_LOCK");
    expect(assessment.referencePolicy).not.toBe("STRONG");
  });

  it("environment panel reste ESTABLISHING_ENVIRONMENT même si le héros est dans la scène", () => {
    const assessment = computeFalSceneAssessment({
      mode: "PANEL_DRAFT",
      contentIntensityLayer: "TEEN",
      isNewCharacter: false,
      hasCanonReferences: true,
      characterCountInScene: 1,
      purpose: "environment",
      shotType: "wide",
      environmentPriority: "high",
      environmentDensityRequired: "high",
      continuityWeight: 40,
      scenePurpose: "Vue du décor — temple abandonné",
      needsInpaint: false,
      needsPoseVariation: false,
      preferPhotorealCover: false,
      explicitBlocked: false,
      goreStylizedMature: false,
      panelCharacterRoles: ["hero"],
      heroPresent: true,
      heroFocus: false,
      subjectFocus: "environment",
    });

    expect(assessment.panelCategory).toBe("ESTABLISHING_ENVIRONMENT");
    expect(assessment.referencePolicy).not.toBe("STRONG");
  });

  it("prop insert ne doit pas recevoir une ref canonique héros", () => {
    const assessment = computeFalSceneAssessment({
      mode: "PANEL_DRAFT",
      contentIntensityLayer: "TEEN",
      isNewCharacter: false,
      hasCanonReferences: true,
      characterCountInScene: 1,
      purpose: "prop_insert",
      shotType: "extreme_closeup",
      environmentPriority: "low",
      continuityWeight: 30,
      scenePurpose: "Gros plan sur la dague",
      needsInpaint: false,
      needsPoseVariation: false,
      preferPhotorealCover: false,
      explicitBlocked: false,
      goreStylizedMature: false,
      panelCharacterRoles: ["hero"],
      heroPresent: true,
      heroFocus: false,
      subjectFocus: "prop",
    });

    expect(assessment.panelCategory).not.toBe("CHARACTER_LOCK");
    expect(["NONE", "LIGHT"]).toContain(assessment.referencePolicy);
  });

  it("un focus hero explicite reste STRONG + CHARACTER_LOCK", () => {
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
      scenePurpose: "Le héros réalise la vérité",
      needsInpaint: false,
      needsPoseVariation: false,
      preferPhotorealCover: false,
      explicitBlocked: false,
      goreStylizedMature: false,
      panelCharacterRoles: ["hero"],
      heroPresent: true,
      heroFocus: true,
      subjectFocus: "hero",
    });

    expect(assessment.panelCategory).toBe("CHARACTER_LOCK");
    expect(assessment.referencePolicy).toBe("STRONG");
  });
});

/**
 * P1.3 — `dominantSubject` est consulté en complément de `subjectFocus` et
 * suffit à empêcher un lock héros implicite même quand `subjectFocus` n'est
 * pas renseigné (ex. shot-plan legacy sans subjectFocus qui atterrit sur un
 * cast composé d'un unique ennemi).
 */
describe("fal-scene-strategy — dominantSubject (P1.3)", () => {
  it("dominantSubject=enemy (sans subjectFocus explicite) ne passe pas STRONG ni CHARACTER_LOCK", () => {
    const assessment = computeFalSceneAssessment({
      mode: "PANEL_DRAFT",
      contentIntensityLayer: "TEEN",
      isNewCharacter: false,
      hasCanonReferences: true,
      characterCountInScene: 1,
      purpose: "reveal",
      shotType: "closeup",
      environmentPriority: "low",
      continuityWeight: 55,
      scenePurpose: "Close-up sur l'ennemi",
      needsInpaint: false,
      needsPoseVariation: false,
      preferPhotorealCover: false,
      explicitBlocked: false,
      goreStylizedMature: false,
      panelCharacterRoles: ["antagonist"],
      panelCharacterImportanceTiers: ["IMPORTANT_SUPPORTING_CHARACTER"],
      heroPresent: false,
      heroFocus: false,
      subjectFocus: null,
      dominantSubject: {
        kind: "enemy",
        characterIndex: 0,
        characterTier: "IMPORTANT_SUPPORTING_CHARACTER",
        provenance: "inferred",
        reason: "single_character+closeup",
      },
    });

    expect(assessment.panelCategory).not.toBe("CHARACTER_LOCK");
    expect(["LIGHT", "NONE"]).toContain(assessment.referencePolicy);
  });

  it("dominantSubject=environment (sans subjectFocus) → pas de STRONG hero policy", () => {
    const assessment = computeFalSceneAssessment({
      mode: "PANEL_DRAFT",
      contentIntensityLayer: "TEEN",
      isNewCharacter: false,
      hasCanonReferences: false,
      characterCountInScene: 0,
      purpose: "establishing",
      shotType: "wide",
      environmentPriority: "high",
      continuityWeight: 20,
      scenePurpose: "Cimetière désert au coucher du soleil",
      needsInpaint: false,
      needsPoseVariation: false,
      preferPhotorealCover: false,
      explicitBlocked: false,
      goreStylizedMature: false,
      panelCharacterRoles: [],
      heroPresent: false,
      heroFocus: false,
      subjectFocus: null,
      dominantSubject: {
        kind: "environment",
        characterIndex: null,
        characterTier: null,
        provenance: "inferred",
        reason: "no_characters+wide",
      },
    });

    expect(assessment.panelCategory).not.toBe("CHARACTER_LOCK");
    expect(assessment.referencePolicy).toBe("NONE");
  });

  it("dominantSubject=hero (explicite) + héros présent → STRONG reference policy", () => {
    const assessment = computeFalSceneAssessment({
      mode: "PANEL_DRAFT",
      contentIntensityLayer: "TEEN",
      isNewCharacter: false,
      hasCanonReferences: true,
      characterCountInScene: 1,
      purpose: "reveal",
      shotType: "closeup",
      environmentPriority: "low",
      continuityWeight: 70,
      scenePurpose: "Le héros découvre la vérité",
      needsInpaint: false,
      needsPoseVariation: false,
      preferPhotorealCover: false,
      explicitBlocked: false,
      goreStylizedMature: false,
      panelCharacterRoles: ["hero"],
      panelCharacterImportanceTiers: ["MAIN_HERO"],
      heroPresent: true,
      heroFocus: true,
      subjectFocus: "hero",
      dominantSubject: {
        kind: "hero",
        characterIndex: 0,
        characterTier: "MAIN_HERO",
        provenance: "explicit",
        reason: "subjectFocus=hero",
      },
    });

    expect(assessment.referencePolicy).toBe("STRONG");
  });
});
