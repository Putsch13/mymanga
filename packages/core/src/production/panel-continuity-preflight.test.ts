import { describe, expect, it } from "vitest";
import {
  computePanelContinuityPreflights,
  continuityPreflightBlockingReasons,
} from "./panel-continuity-preflight";
import type { PanelBlueprintPremium } from "../types/narrative-facts";

function minimalBp(overrides: Partial<PanelBlueprintPremium>): PanelBlueprintPremium {
  return {
    panelId: "p1",
    beatId: "b1",
    panelNumber: 1,
    purpose: "test",
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

describe("computePanelContinuityPreflights", () => {
  it("ne bloque pas un panel medium sans DNA", () => {
    const [p] = computePanelContinuityPreflights([
      minimalBp({
        requiredCharacterIds: ["hero-1"],
        criticality: "medium",
      }),
    ]);
    expect(p.blocking).toBe(false);
    expect(p.missingEnvironmentDna).toBe(false);
    expect(p.missing.some((m) => m.includes("character_visual_dna_missing"))).toBe(true);
  });

  it("bloque un panel critique avec personnages requis mais sans characterVisualDna", () => {
    const [p] = computePanelContinuityPreflights([
      minimalBp({
        requiredCharacterIds: ["hero-1"],
        criticality: "critical",
      }),
    ]);
    expect(p.blocking).toBe(true);
    expect(p.missingEnvironmentDna).toBe(false);
    expect(continuityPreflightBlockingReasons([p]).length).toBe(1);
  });

  it("ne bloque pas un panel critique avec DNA présent", () => {
    const [p] = computePanelContinuityPreflights([
      minimalBp({
        requiredCharacterIds: ["hero-1"],
        criticality: "critical",
        characterVisualDna: [{ characterId: "hero-1", hairColor: "noir" }],
      }),
    ]);
    expect(p.blocking).toBe(false);
    expect(p.missingEnvironmentDna).toBe(false);
    expect(p.missing).toHaveLength(0);
  });

  it("bloque un panel critique avec signaux lieu mais sans environmentVisualDna", () => {
    const [p] = computePanelContinuityPreflights([
      minimalBp({
        requiredCharacterIds: [],
        criticality: "critical",
        requiredLocationSignals: ["port", "quai"],
      }),
    ]);
    expect(p.missingEnvironmentDna).toBe(true);
    expect(p.blocking).toBe(true);
    expect(continuityPreflightBlockingReasons([p])).toEqual([
      "p1:critical_panel_missing_environment_visual_dna",
    ]);
  });

  it("bloque un panel dialogue speaker_visible sans DNA pour l’ancre parlante", () => {
    const [p] = computePanelContinuityPreflights([
      minimalBp({
        criticality: "medium",
        dialogueCarrier: "speaker_visible",
        speakerAnchorCharacterId: "spk-1",
        requiredCharacterIds: [],
        mustShowCharacterIds: [],
      }),
    ]);
    expect(p.blocking).toBe(true);
    expect(p.anchorSpeakerCharacterId).toBe("spk-1");
    expect(continuityPreflightBlockingReasons([p])).toEqual([
      "p1:speaker_visible_missing_character_visual_dna:spk-1",
    ]);
  });
});
