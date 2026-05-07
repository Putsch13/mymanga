import { describe, it, expect } from "vitest";
import { buildIntentNarrativeContract, parseIntentNarrativeContract } from "./intent-narrative-contract";

describe("IntentNarrativeContract", () => {
  describe("parseIntentNarrativeContract", () => {
    it("parses a minimal valid contract", () => {
      const contract = parseIntentNarrativeContract({
        version: 1,
        chapterId: "ch1",
        storyFacts: ["fact1"],
        requiredEvents: [],
      });
      expect(contract.chapterId).toBe("ch1");
      expect(contract.storyFacts).toEqual(["fact1"]);
    });

    it("rejects missing chapterId", () => {
      expect(() => parseIntentNarrativeContract({ version: 1 })).toThrow();
    });

    it("normalizes requiredEvent type from array", () => {
      const contract = parseIntentNarrativeContract({
        version: 1,
        chapterId: "ch1",
        requiredEvents: [
          { id: "e1", label: "test", type: ["dialogue"], actors: [] },
        ],
      });
      expect(contract.requiredEvents[0].type).toBe("dialogue");
    });
  });

  describe("buildIntentNarrativeContract", () => {
    it("extracts events from sentences", () => {
      const result = buildIntentNarrativeContract({
        chapterId: "ch1",
        userIntent: "Le héros entre dans la taverne. Il découvre un passage secret. Le rival crie une menace.",
      });
      expect(result.requiredEvents.length).toBe(3);
      expect(result.requiredEvents[2].requiredDialogue).toBe(true);
      expect(result.requiredEvents[2].type).toBe("dialogue");
    });

    it("detects known characters in intent", () => {
      const result = buildIntentNarrativeContract({
        chapterId: "ch1",
        userIntent: "Akira affronte son rival dans l'arène",
        knownCharacterIds: ["char_1", "char_2"],
        knownCharacterNames: ["Akira", "Suko"],
      });
      expect(result.requiredCharacters).toContain("char_1");
      expect(result.requiredCharacters).not.toContain("char_2");
    });

    it("detects known locations in intent", () => {
      const result = buildIntentNarrativeContract({
        chapterId: "ch1",
        userIntent: "L'action se passe dans le Port de Kaze",
        knownLocationNames: ["Port de Kaze", "Forêt sombre"],
      });
      expect(result.requiredLocations).toContain("Port de Kaze");
      expect(result.requiredLocations).not.toContain("Forêt sombre");
    });
  });
});
