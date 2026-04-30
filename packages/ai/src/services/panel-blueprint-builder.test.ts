import { describe, it, expect, afterEach } from "vitest";
import type { PanelBlueprintPremium } from "@manga-ai-studio/core";
import { expandBlueprintsToMinimum } from "./panel-blueprint-builder";
import { BlueprintEnrichmentDisabledError } from "./blueprints/minimum-blueprint-expansion";

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

describe("expandBlueprintsToMinimum (H2 — padding refusé)", () => {
  afterEach(() => {
    delete process.env.MANGA_ALLOW_BLUEPRINT_EXPANSION_LEGACY;
  });

  it("ne modifie pas si déjà au-dessus du minimum", () => {
    const blueprints = Array.from({ length: 80 }, (_, i) => makeBlueprint(i));
    const result = expandBlueprintsToMinimum(blueprints, 75);
    expect(result.length).toBe(80);
  });

  it("retourne l'array vide si on part d'un array vide", () => {
    const result = expandBlueprintsToMinimum([], 75);
    expect(result.length).toBe(0);
  });

  it("THROW BlueprintEnrichmentDisabledError quand raw < minimum (H2 strict)", () => {
    const blueprints = Array.from({ length: 30 }, (_, i) => makeBlueprint(i));
    expect(() => expandBlueprintsToMinimum(blueprints, 75)).toThrow(
      BlueprintEnrichmentDisabledError,
    );
  });

  it("autorise le padding UNIQUEMENT avec MANGA_ALLOW_BLUEPRINT_EXPANSION_LEGACY=true", () => {
    process.env.MANGA_ALLOW_BLUEPRINT_EXPANSION_LEGACY = "true";
    const blueprints = Array.from({ length: 20 }, (_, i) => makeBlueprint(i));
    const result = expandBlueprintsToMinimum(blueprints, 75);
    expect(result.length).toBe(75);
    result.forEach((bp, idx) => {
      expect(bp.panelNumber).toBe(idx + 1);
      expect(bp.panelIndex).toBe(idx);
    });
  });
});
