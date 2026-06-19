/**
 * Tests du micro-storyboard par beat (API BeatMicroStoryboardInput actuelle).
 */

import { describe, it, expect } from "vitest";
import {
  buildBeatMicroStoryboard,
  assertPanelSpecificity,
  type ContractBeatInput,
  type MicroStoryboardPanel,
} from "./build-beat-micro-storyboard";

function sampleBeat(overrides: Partial<ContractBeatInput> = {}): ContractBeatInput {
  return {
    beatId: "beat-1",
    beatNumber: 1,
    summary: "Marius regarde Maya avec inquiétude.",
    emotionalIntent: "neutral",
    requiredCharacterIds: ["marius", "maya"],
    requiredProps: [],
    requiredNpcGroups: [],
    visualEvents: [],
    dialogueRequired: true,
    ...overrides,
  };
}

describe("buildBeatMicroStoryboard", () => {
  it("génère un micro-storyboard pour un beat simple", () => {
    const result = buildBeatMicroStoryboard({
      beat: sampleBeat(),
      targetPanelCount: 2,
      characterNameById: { marius: "Marius", maya: "Maya" },
      locationName: "Le port",
    });

    expect(result.beatId).toBe("beat-1");
    expect(result.panels).toHaveLength(2);
    expect(result.panels[0].microAction.length).toBeGreaterThan(10);
    expect(result.panels[0].narrativeRole).toBeTruthy();
    expect(result.panels[0].panelId).toContain("beat-1");
  });

  it("répartit des rôles narratifs sur plusieurs panels", () => {
    const result = buildBeatMicroStoryboard({
      beat: sampleBeat({
        beatId: "beat-2",
        summary: "Une confrontation intense entre les deux personnages.",
        dialogueRequired: false,
        requiredCharacterIds: ["hero", "villain"],
      }),
      targetPanelCount: 4,
      characterNameById: { hero: "Hero", villain: "Villain" },
      locationName: "Arena",
    });

    const roles = result.panels.map((p) => p.narrativeRole);
    expect(roles).toContain("establishing");
  });

  it("évite les micro-actions trop courtes ou vides", () => {
    const result = buildBeatMicroStoryboard({
      beat: sampleBeat({
        beatId: "beat-3",
        summary: "Le héros court à travers la forêt.",
        requiredCharacterIds: ["hero"],
        dialogueRequired: false,
      }),
      targetPanelCount: 3,
      characterNameById: { hero: "Hero" },
      locationName: "Forest",
    });

    for (const panel of result.panels) {
      expect(panel.microAction.length).toBeGreaterThan(10);
    }
  });

  it("fournit un visualSubject pour chaque panel", () => {
    const result = buildBeatMicroStoryboard({
      beat: sampleBeat({
        beatId: "beat-4",
        summary: "Discussion animée au café.",
        requiredCharacterIds: ["a", "b"],
      }),
      targetPanelCount: 2,
      characterNameById: { a: "Alice", b: "Bob" },
      locationName: "Café",
    });

    for (const panel of result.panels) {
      expect(panel.visualSubject.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("assertPanelSpecificity", () => {
  it("accepte un panel précis en mode premium", () => {
    const panel: MicroStoryboardPanel = {
      panelId: "p1",
      panelNumber: 1,
      sourceBeatId: "b1",
      narrativeRole: "action",
      microAction: "Marius recule brusquement face à la menace visible au premier plan.",
      visualSubject: "Marius gros plan",
      emotionalIntent: "tension",
      requiredCharacterIds: ["marius"],
      requiredProps: ["épée"],
      requiredNpcGroups: [],
      dialogueRequired: false,
    };
    expect(() => assertPanelSpecificity(panel, true)).not.toThrow();
  });

  it("rejette un panel générique en mode premium", () => {
    const panel: MicroStoryboardPanel = {
      panelId: "p2",
      panelNumber: 1,
      sourceBeatId: "b1",
      narrativeRole: "action",
      microAction: "Character does something",
      visualSubject: "scene",
      requiredCharacterIds: [],
      requiredProps: [],
      requiredNpcGroups: [],
      dialogueRequired: false,
    };
    expect(() => assertPanelSpecificity(panel, true)).toThrow(/premium_generic_panel_forbidden/);
  });

  it("n’applique pas la contrainte hors mode premium", () => {
    const panel: MicroStoryboardPanel = {
      panelId: "p3",
      panelNumber: 1,
      sourceBeatId: "b1",
      narrativeRole: "action",
      microAction: "generic action",
      visualSubject: "scene",
      requiredCharacterIds: [],
      requiredProps: [],
      requiredNpcGroups: [],
      dialogueRequired: false,
    };
    expect(() => assertPanelSpecificity(panel, false)).not.toThrow();
  });
});
