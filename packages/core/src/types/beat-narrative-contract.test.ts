import { describe, it, expect } from "vitest";
import {
  beatContractFromLegacyRole,
  mapLegacyPageRoleToStoryFunction,
  DEFAULT_ACTION_ENVELOPE_FOR_FUNCTION,
  DEFAULT_ESCALATION_POLICY_FOR_FUNCTION,
} from "./beat-narrative-contract";

describe("mapLegacyPageRoleToStoryFunction", () => {
  it("ne promeut pas 'confrontation' en combat", () => {
    expect(mapLegacyPageRoleToStoryFunction("confrontation")).toBe(
      "dialogue_tension",
    );
  });
  it("mappe 'cliffhanger' vers une révélation", () => {
    expect(mapLegacyPageRoleToStoryFunction("cliffhanger")).toBe("revelation");
  });
  it("garde un fallback dialogue_tension sur une valeur inconnue", () => {
    expect(mapLegacyPageRoleToStoryFunction("garbage_value")).toBe(
      "dialogue_tension",
    );
  });
});

describe("DEFAULT_ACTION_ENVELOPE_FOR_FUNCTION", () => {
  it("interdit l'action par défaut sur dialogue_tension, aftermath, decision", () => {
    expect(DEFAULT_ACTION_ENVELOPE_FOR_FUNCTION.dialogue_tension).toBe("none");
    expect(DEFAULT_ACTION_ENVELOPE_FOR_FUNCTION.aftermath).toBe("none");
    expect(DEFAULT_ACTION_ENVELOPE_FOR_FUNCTION.decision).toBe("none");
  });
  it("n'autorise aucune fonction à être combat_* par défaut", () => {
    for (const envelope of Object.values(DEFAULT_ACTION_ENVELOPE_FOR_FUNCTION)) {
      expect(envelope === "combat_light" || envelope === "combat_full").toBe(
        false,
      );
    }
  });
});

describe("beatContractFromLegacyRole", () => {
  it("produit un contrat cohérent pour un pageRole dialogue", () => {
    const c = beatContractFromLegacyRole({
      beatId: "b",
      summary: "dialogue on rooftop",
      legacyPageRole: "dialogue",
    });
    expect(c.storyFunction).toBe("dialogue_tension");
    expect(c.actionEnvelope).toBe("none");
    expect(c.visualEscalationPolicy).toBe(
      DEFAULT_ESCALATION_POLICY_FOR_FUNCTION.dialogue_tension,
    );
    expect(c.causalInputs).toEqual([]);
    expect(c.forbiddenVisualEvents).toEqual([]);
  });

  it("escalade le combat uniquement si explicitCombat=true", () => {
    const withoutFlag = beatContractFromLegacyRole({
      beatId: "b",
      summary: "combat scene",
      legacyPageRole: "action",
    });
    expect(withoutFlag.actionEnvelope).not.toBe("combat_full");

    const withFlag = beatContractFromLegacyRole({
      beatId: "b",
      summary: "combat scene",
      legacyPageRole: "action",
      explicitCombat: true,
    });
    expect(withFlag.actionEnvelope).toBe("combat_full");
  });
});
