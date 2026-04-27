/**
 * panel-text-contract.test.ts
 *
 * P1.18 — Tests pour le contrat de texte des panels.
 */

import { describe, it, expect } from "vitest";
import {
  createEmptyTextContract,
  createSilentTextContract,
  createDialogueTextContract,
  validatePanelTextContract,
  mergeTextContracts,
  type PanelTextContract,
} from "../../generation/panel-text-contract";

describe("PanelTextContract", () => {
  describe("createEmptyTextContract", () => {
    it("should create a contract with hasText=false", () => {
      const contract = createEmptyTextContract();
      expect(contract.hasText).toBe(false);
      expect(contract.dialogues).toHaveLength(0);
      expect(contract.narration).toBeNull();
      expect(contract.sfx).toHaveLength(0);
    });
  });

  describe("createSilentTextContract", () => {
    it("should create a silent contract with reason", () => {
      const contract = createSilentTextContract("dramatic_pause");
      expect(contract.hasText).toBe(false);
      expect(contract.silenceReason).toBe("dramatic_pause");
    });
  });

  describe("createDialogueTextContract", () => {
    it("should create a contract with dialogues", () => {
      const contract = createDialogueTextContract([
        { speakerId: "marius", text: "Bonjour Maya!" },
        { speakerId: "maya", text: "Salut Marius." },
      ]);

      expect(contract.hasText).toBe(true);
      expect(contract.dialogues).toHaveLength(2);
      expect(contract.dialogues[0].speakerId).toBe("marius");
    });
  });

  describe("validatePanelTextContract", () => {
    it("should pass for valid contract", () => {
      const contract: PanelTextContract = {
        hasText: true,
        dialogues: [{ speakerId: "a", text: "Hello" }],
        narration: null,
        sfx: [],
        placement: { dialoguePosition: "top" },
        silenceReason: null,
      };

      const result = validatePanelTextContract(contract);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should fail for empty dialogue text", () => {
      const contract: PanelTextContract = {
        hasText: true,
        dialogues: [{ speakerId: "a", text: "" }],
        narration: null,
        sfx: [],
        placement: {},
        silenceReason: null,
      };

      const result = validatePanelTextContract(contract);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("dialogue_empty_text");
    });

    it("should fail for hasText=true but no content", () => {
      const contract: PanelTextContract = {
        hasText: true,
        dialogues: [],
        narration: null,
        sfx: [],
        placement: {},
        silenceReason: null,
      };

      const result = validatePanelTextContract(contract);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("has_text_but_no_content");
    });

    it("should pass for silent contract with reason", () => {
      const contract: PanelTextContract = {
        hasText: false,
        dialogues: [],
        narration: null,
        sfx: [],
        placement: {},
        silenceReason: "emotional_moment",
      };

      const result = validatePanelTextContract(contract);
      expect(result.valid).toBe(true);
    });
  });

  describe("mergeTextContracts", () => {
    it("should merge dialogues from both contracts", () => {
      const a: PanelTextContract = {
        hasText: true,
        dialogues: [{ speakerId: "a", text: "Hello" }],
        narration: null,
        sfx: [],
        placement: {},
        silenceReason: null,
      };

      const b: PanelTextContract = {
        hasText: true,
        dialogues: [{ speakerId: "b", text: "Hi" }],
        narration: "The tension was palpable.",
        sfx: [],
        placement: {},
        silenceReason: null,
      };

      const merged = mergeTextContracts(a, b);
      expect(merged.dialogues).toHaveLength(2);
      expect(merged.narration).toBe("The tension was palpable.");
    });

    it("should preserve placement from second contract", () => {
      const a: PanelTextContract = {
        hasText: true,
        dialogues: [],
        narration: "Narration A",
        sfx: [],
        placement: { dialoguePosition: "top" },
        silenceReason: null,
      };

      const b: PanelTextContract = {
        hasText: false,
        dialogues: [],
        narration: null,
        sfx: [],
        placement: { dialoguePosition: "bottom" },
        silenceReason: null,
      };

      const merged = mergeTextContracts(a, b);
      expect(merged.placement?.dialoguePosition).toBe("bottom");
    });
  });
});
