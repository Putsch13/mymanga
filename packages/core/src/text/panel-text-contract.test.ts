/**
 * Tests du contrat de texte des panels (alignés sur l’API actuelle).
 */

import { describe, it, expect } from "vitest";
import {
  createEmptyTextContract,
  createSilentTextContract,
  createDialogueTextContract,
  validatePanelTextContract,
  mergeTextContracts,
  type PanelTextContract,
} from "../generation/panel-text-contract";

describe("PanelTextContract", () => {
  it("createEmptyTextContract", () => {
    const c = createEmptyTextContract("p1");
    expect(c.panelId).toBe("p1");
    expect(c.hasText).toBe(false);
    expect(c.dialogues).toHaveLength(0);
  });

  it("createSilentTextContract", () => {
    const c = createSilentTextContract("p2", "visual_only");
    expect(c.silenceReason).toBe("visual_only");
    expect(c.hasText).toBe(false);
  });

  it("createDialogueTextContract", () => {
    const c = createDialogueTextContract("p3", [
      { speakerName: "Marius", text: "Bonjour Maya!" },
      { speakerName: "Maya", text: "Salut Marius." },
    ]);
    expect(c.hasText).toBe(true);
    expect(c.dialogues).toHaveLength(2);
    expect(c.dialogues[0].speakerName).toBe("Marius");
  });

  it("validatePanelTextContract accepte un contrat valide", () => {
    const c = createDialogueTextContract("p4", [{ speakerName: "a", text: "Hello" }]);
    const r = validatePanelTextContract(c);
    expect(r.valid).toBe(true);
    expect(r.issues).toHaveLength(0);
  });

  it("validatePanelTextContract refuse un texte de dialogue vide", () => {
    const c: PanelTextContract = {
      ...createDialogueTextContract("p5", [{ speakerName: "a", text: "x" }]),
      dialogues: [{ speakerName: "a", text: "" }],
    };
    const r = validatePanelTextContract(c);
    expect(r.valid).toBe(false);
    expect(r.issues.some((i) => i.startsWith("empty_dialogue_text"))).toBe(true);
  });

  it("validatePanelTextContract refuse hasText sans contenu", () => {
    const c: PanelTextContract = {
      panelId: "p6",
      hasText: true,
      dialogues: [],
      narration: null,
      sfx: [],
      placement: {
        reserveTextArea: false,
        preferredAnchorZones: [],
        avoidFaces: true,
        overflowStrategy: "bubble_stack",
      },
      silenceReason: null,
    };
    const r = validatePanelTextContract(c);
    expect(r.valid).toBe(false);
    expect(r.issues).toContain("text_contract_has_text_but_empty:p6");
  });

  it("mergeTextContracts fusionne dialogues et narration", () => {
    const a = createDialogueTextContract("p7", [{ speakerName: "a", text: "Hello" }]);
    const b = createDialogueTextContract(
      "p7",
      [{ speakerName: "b", text: "Hi" }],
      { narration: "Tension." },
    );
    const merged = mergeTextContracts(a, b);
    expect(merged.dialogues).toHaveLength(1);
    expect(merged.dialogues[0].speakerName).toBe("b");
    expect(merged.narration).toBe("Tension.");
  });
});
