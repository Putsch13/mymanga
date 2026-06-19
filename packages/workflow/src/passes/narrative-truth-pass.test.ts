import { describe, it, expect } from "vitest";
import { runNarrativeTruthPass } from "./narrative-truth-pass";
import {
  actionContractForEnvelope,
  beatContractFromLegacyRole,
} from "@manga-ai-studio/core";
import type {
  BeatNarrativeContract,
  PanelContract,
} from "@manga-ai-studio/core";

function beat(partial: Partial<BeatNarrativeContract> = {}): BeatNarrativeContract {
  return {
    beatId: "beat-1",
    summary: "Two characters talk on a rooftop.",
    storyFunction: "dialogue_tension",
    actionEnvelope: "none",
    visualEscalationPolicy: "forbid_invented_action",
    causalInputs: [],
    causalOutputs: [],
    forbiddenVisualEvents: [],
    requiredVisualEvents: [],
    ...partial,
  };
}

function panel(
  partial: Partial<Pick<PanelContract, "purpose" | "panelId">> = {},
): Pick<PanelContract, "purpose" | "panelId"> {
  return {
    panelId: "scene1:p1",
    purpose: "dialogue",
    ...partial,
  };
}

describe("runNarrativeTruthPass — dialogue beat, no action allowed", () => {
  it("signale un panel action sur un beat dialogue_tension", () => {
    const result = runNarrativeTruthPass({
      beatContract: beat(),
      actionContract: actionContractForEnvelope("none"),
      panelContract: panel({ purpose: "action" }),
      effectivePrompt: "two characters face each other on the rooftop",
    });
    expect(result.valid).toBe(false);
    expect(result.blocking).toBe(true);
    expect(
      result.violations.map((v) => v.code),
    ).toContain("action_envelope_exceeded");
    expect(
      result.violations.map((v) => v.code),
    ).toContain("action_policy_violation");
  });

  it("bloque un verbe de combat dans le prompt même si purpose=dialogue", () => {
    const result = runNarrativeTruthPass({
      beatContract: beat(),
      actionContract: actionContractForEnvelope("none"),
      panelContract: panel({ purpose: "dialogue" }),
      effectivePrompt: "she strikes him as they argue on the rooftop",
    });
    expect(result.blocking).toBe(true);
    expect(
      result.violations.some((v) => v.code === "forbidden_action_verb_in_prompt"),
    ).toBe(true);
    expect(result.sanitisedPrompt).not.toMatch(/strikes/i);
  });

  it("laisse passer un vrai panel dialogue sans combat", () => {
    const result = runNarrativeTruthPass({
      beatContract: beat(),
      actionContract: actionContractForEnvelope("none"),
      panelContract: panel({ purpose: "dialogue" }),
      effectivePrompt: "two characters lean in, silent tension between them",
    });
    expect(result.valid).toBe(true);
    expect(result.blocking).toBe(false);
    expect(result.violations).toEqual([]);
  });

  it("détecte un forbiddenVisualEvent explicite", () => {
    const result = runNarrativeTruthPass({
      beatContract: beat({
        forbiddenVisualEvents: ["weapon clash"],
      }),
      actionContract: actionContractForEnvelope("none"),
      panelContract: panel({ purpose: "dialogue" }),
      effectivePrompt: "the tense exchange builds into a weapon clash",
    });
    // The prompt contains "weapon clash" which is also in the generic combat
    // banlist — so we expect both codes to fire.
    expect(result.blocking).toBe(true);
    expect(
      result.violations.some((v) => v.code === "narrative_beat_invented"),
    ).toBe(true);
  });
});

describe("runNarrativeTruthPass — combat_full beat", () => {
  it("laisse passer une scène de combat explicite", () => {
    const contract = beat({
      storyFunction: "movement",
      actionEnvelope: "combat_full",
      visualEscalationPolicy: "allow_literal_only",
    });
    const result = runNarrativeTruthPass({
      beatContract: contract,
      actionContract: actionContractForEnvelope("combat_full"),
      panelContract: panel({ purpose: "action" }),
      effectivePrompt: "the hero strikes, blades clashing",
    });
    expect(result.valid).toBe(true);
    expect(result.blocking).toBe(false);
  });
});

describe("beatContractFromLegacyRole — legacy mapping", () => {
  it("mappe 'confrontation' sur dialogue_tension, pas sur combat", () => {
    const c = beatContractFromLegacyRole({
      beatId: "b",
      summary: "verbal showdown",
      legacyPageRole: "confrontation",
    });
    expect(c.storyFunction).toBe("dialogue_tension");
    expect(c.actionEnvelope).toBe("none");
  });

  it("respecte explicitCombat=true pour les beats de vrai combat", () => {
    const c = beatContractFromLegacyRole({
      beatId: "b",
      summary: "real fight scene",
      legacyPageRole: "action",
      explicitCombat: true,
    });
    expect(c.actionEnvelope).toBe("combat_full");
  });
});
