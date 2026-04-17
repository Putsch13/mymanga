import { describe, it, expect } from "vitest";
import type { PanelBlueprintPremium } from "@manga-ai-studio/core";
import { expandBlueprintsToMinimum } from "./panel-blueprint-builder";

function makeBlueprint(i: number, overrides: Partial<PanelBlueprintPremium> = {}): PanelBlueprintPremium {
  return {
    panelId: `panel_beat1_${i}`,
    beatId: "beat1",
    panelIndex: i,
    panelNumber: i + 1,
    purpose: "hero reaction",
    shotType: "medium",
    cameraAngle: "eye_level",
    subjectFocus: "hero",
    secondaryFocus: null,
    requiredCharacters: ["hero"],
    requiredCharacterIds: ["hero"],
    mustShowCharacterIds: ["hero"],
    mayShowCharacterIds: [],
    mustShowEnemy: false,
    requiredNpcCount: 0,
    requiredProps: [],
    optionalProps: [],
    presenceObligations: [],
    requiredLocationSignals: [],
    speakerAnchorCharacterId: null,
    speakerAnchorCharacterName: null,
    dialogueCarrier: "narration",
    dialogueLinesAnchored: 0,
    cutawayType: "none",
    heroCenterAllowed: true,
    criticality: "medium",
    notes: [],
    ...overrides,
  };
}

describe("expandBlueprintsToMinimum", () => {
  it("ne modifie pas si déjà au-dessus du minimum", () => {
    const blueprints = Array.from({ length: 80 }, (_, i) => makeBlueprint(i));
    const result = expandBlueprintsToMinimum(blueprints, 75);
    expect(result.length).toBe(80);
  });

  it("étend jusqu'au minimum 75 avec des variantes cutaway/reaction/env", () => {
    const blueprints = Array.from({ length: 30 }, (_, i) => makeBlueprint(i));
    const result = expandBlueprintsToMinimum(blueprints, 75);
    expect(result.length).toBe(75);
    // Vérifie que les nouveaux blueprints ne sont PAS tous hero-centrés
    const addedPanels = result.slice(30);
    const nonHeroFocus = addedPanels.filter((bp) => bp.subjectFocus !== "hero");
    expect(nonHeroFocus.length).toBe(addedPanels.length);
  });

  it("renumérote panelNumber séquentiellement après extension", () => {
    const blueprints = Array.from({ length: 20 }, (_, i) => makeBlueprint(i));
    const result = expandBlueprintsToMinimum(blueprints, 75);
    expect(result.length).toBe(75);
    result.forEach((bp, idx) => {
      expect(bp.panelNumber).toBe(idx + 1);
      expect(bp.panelIndex).toBe(idx);
    });
  });

  it("inclut au moins un environment et un reaction dans les ajouts", () => {
    const blueprints = Array.from({ length: 10 }, (_, i) => makeBlueprint(i));
    const result = expandBlueprintsToMinimum(blueprints, 75);
    const added = result.slice(10);
    const hasEnv = added.some((bp) => bp.subjectFocus === "environment");
    const hasReaction = added.some((bp) => bp.subjectFocus === "reaction");
    expect(hasEnv).toBe(true);
    expect(hasReaction).toBe(true);
  });

  it("retourne l'array vide si on part d'un array vide", () => {
    const result = expandBlueprintsToMinimum([], 75);
    expect(result.length).toBe(0);
  });
});
