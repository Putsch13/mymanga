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
  it("hors mode strict : medium avec requiredCharacterIds sans DNA n’est pas bloquant", () => {
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
    expect(continuityPreflightBlockingReasons([p])).toEqual([
      "p1:missing_character_visual_dna:ids=hero-1",
    ]);
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

  it("strictCharacterDnaBinding : bloque un panel medium avec requiredCharacterIds sans DNA", () => {
    const [p] = computePanelContinuityPreflights(
      [
        minimalBp({
          requiredCharacterIds: ["hero-1"],
          criticality: "medium",
        }),
      ],
      { strictCharacterDnaBinding: true },
    );
    expect(p.blocking).toBe(true);
    expect(continuityPreflightBlockingReasons([p])).toEqual(["p1:missing_character_visual_dna:ids=hero-1"]);
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
      "p1:missing_environment_visual_dna",
    ]);
  });

  it("strictEnvironmentLocationBinding : bloque un panel medium avec signaux lieu mais sans environmentVisualDna", () => {
    const [p] = computePanelContinuityPreflights(
      [
        minimalBp({
          requiredCharacterIds: [],
          criticality: "medium",
          requiredLocationSignals: ["port"],
        }),
      ],
      { strictEnvironmentLocationBinding: true },
    );
    expect(p.missingEnvironmentDna).toBe(true);
    expect(p.blocking).toBe(true);
    expect(continuityPreflightBlockingReasons([p])).toEqual(["p1:missing_environment_visual_dna"]);
  });

  it("strictEnvironmentLocationBinding désactivé : medium avec signaux lieu reste non bloquant", () => {
    const [p] = computePanelContinuityPreflights([
      minimalBp({
        requiredCharacterIds: [],
        criticality: "medium",
        requiredLocationSignals: ["port"],
      }),
    ]);
    expect(p.missingEnvironmentDna).toBe(true);
    expect(p.blocking).toBe(false);
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

  it("strictCharacterDnaBinding : bloque si requiredNpcCount > entrées npcVisualDna", () => {
    const [p] = computePanelContinuityPreflights(
      [
        minimalBp({
          criticality: "medium",
          requiredNpcCount: 2,
          npcVisualDna: [{ continuityId: "n1", displayName: "PNJ A", category: "guard" }],
        }),
      ],
      { strictCharacterDnaBinding: true },
    );
    expect(p.blocking).toBe(true);
    expect(p.missing.some((m) => m.startsWith("npc_visual_dna_insufficient:"))).toBe(true);
    expect(continuityPreflightBlockingReasons([p])).toEqual([
      "p1:npc_visual_dna_insufficient:need_2_have_1",
    ]);
  });

  it("strictCharacterDnaBinding : inclut requiredCharacters (alias) dans les IDs exigeant du DNA", () => {
    const [p] = computePanelContinuityPreflights(
      [
        minimalBp({
          requiredCharacterIds: [],
          requiredCharacters: ["co-hero-2"],
          criticality: "medium",
        }),
      ],
      { strictCharacterDnaBinding: true },
    );
    expect(p.blocking).toBe(true);
    expect(continuityPreflightBlockingReasons([p])).toEqual([
      "p1:missing_character_visual_dna:ids=co-hero-2",
    ]);
  });

  it("hors strict : requiredNpcCount > npcVisualDna reste avertissement non bloquant", () => {
    const [p] = computePanelContinuityPreflights([
      minimalBp({
        criticality: "medium",
        requiredNpcCount: 2,
        npcVisualDna: [{ continuityId: "n1", displayName: "PNJ A", category: "guard" }],
      }),
    ]);
    expect(p.blocking).toBe(false);
    expect(p.warnings.some((w) => w.startsWith("npc_visual_dna:"))).toBe(true);
    expect(p.missing.some((m) => m.includes("npc_visual"))).toBe(false);
  });
});
