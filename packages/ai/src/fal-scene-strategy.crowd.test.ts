/**
 * P3.1 / P4 — Crowd & group scenes.
 *
 * Un panel avec foule / PNJ multiples / group subjectFocus ne doit :
 *   - PAS être verrouillé CHARACTER_LOCK (c'est pas un portrait héros)
 *   - PAS recevoir une reference policy STRONG juste parce que le héros est
 *     présent dans la scène
 *   - Être classé crowdCritical=true pour que le scheduler aval puisse
 *     appliquer les stratégies adaptées (batch NPCs, keep-foreground)
 *
 * Ces tests complètent `fal-scene-strategy.subject-focus.test.ts` en
 * couvrant explicitement les cas "crowd" que le TODO P3/P4 demande.
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
    shotType: "medium",
    environmentPriority: "medium",
    continuityWeight: 40,
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

describe("fal-scene-strategy — crowd / group (P3.1)", () => {
  it("crowd scene (npcGroup présent + héros dans le cast) est crowdCritical", () => {
    const a = computeFalSceneAssessment({
      ...baseCtx(),
      purpose: "establishing",
      shotType: "wide",
      scenePurpose: "Marché bondé, foule de passants et marchands",
      hasNpcGroup: true,
      npcCount: 6,
      panelCharacterRoles: ["hero"],
      environmentPriority: "high",
      environmentDensityRequired: "high",
    });
    expect(a.crowdCritical).toBe(true);
    expect(a.panelCategory).not.toBe("CHARACTER_LOCK");
  });

  it("subjectFocus=group avec héros présent → PAS STRONG, PAS CHARACTER_LOCK", () => {
    const a = computeFalSceneAssessment({
      ...baseCtx(),
      subjectFocus: "group",
      characterCountInScene: 3,
      panelCharacterRoles: ["hero", "ally", "npc"],
      shotType: "wide",
      scenePurpose: "Le trio affronte la garde dans la cour du palais",
    });
    expect(a.panelCategory).not.toBe("CHARACTER_LOCK");
    expect(["LIGHT", "NONE"]).toContain(a.referencePolicy);
  });

  it("scène d'action avec foule et héros présent → interactionCritical + crowdCritical", () => {
    const a = computeFalSceneAssessment({
      ...baseCtx(),
      purpose: "action",
      shotType: "wide",
      scenePurpose: "Confrontation au milieu de la foule du marché",
      characterCountInScene: 2,
      panelCharacterRoles: ["hero", "antagonist"],
      hasNpcGroup: true,
      npcCount: 8,
      environmentPriority: "high",
      subjectFocus: "group",
    });
    expect(a.crowdCritical).toBe(true);
    expect(a.interactionCritical).toBe(true);
    expect(a.panelCategory).not.toBe("CHARACTER_LOCK");
  });

  it("crowd_reaction cutaway-like → rester non-hero lock", () => {
    const a = computeFalSceneAssessment({
      ...baseCtx(),
      subjectFocus: "reaction",
      shotType: "medium",
      scenePurpose: "Réaction des camarades de classe qui regardent",
      characterCountInScene: 4,
      panelCharacterRoles: ["hero", "npc", "npc", "npc"],
      npcCount: 3,
      hasNpcGroup: true,
      heroPresent: true,
    });
    expect(a.panelCategory).not.toBe("CHARACTER_LOCK");
    expect(a.referencePolicy).not.toBe("STRONG");
  });

  it("establishing wide sans aucun personnage + décor fort → ESTABLISHING_ENVIRONMENT + NONE", () => {
    const a = computeFalSceneAssessment({
      ...baseCtx(),
      purpose: "establishing",
      shotType: "wide",
      scenePurpose: "Vue panoramique du temple au soleil couchant, aucun personnage",
      characterCountInScene: 0,
      panelCharacterRoles: [],
      heroPresent: false,
      hasCanonReferences: false,
      environmentPriority: "high",
      environmentDensityRequired: "high",
      subjectFocus: "environment",
    });
    expect(a.panelCategory).toBe("ESTABLISHING_ENVIRONMENT");
    expect(a.referencePolicy).toBe("NONE");
  });
});
