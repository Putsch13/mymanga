import { describe, it, expect } from "vitest";
import {
  runVisualPanelQa,
  buildRetryPrompt,
  createRetryRecord,
  checkNarrativeFidelity,
  checkCharacterFidelity,
  checkComposition,
  checkTechnical,
  type VisualQaInput,
  type RetryContext,
} from "./visual-panel-qa";

function createMockInput(overrides: Partial<VisualQaInput> = {}): VisualQaInput {
  return {
    panelId: "panel_001",
    imageUrl: "https://example.com/image.png",
    panelMetadata: {
      role: "hero",
      purpose: "Hero enters the scene",
      shotType: "medium",
      subjectFocus: "hero",
      isCutaway: false,
      mustShowCharacterIds: ["hero_001"],
      reserveTextArea: true,
      textMode: "dialogue",
    },
    promptUsed: "Anime-style hero character entering a dramatic scene",
    expectedCharacters: [
      { characterId: "hero_001", name: "Hero", isProtagonist: true },
    ],
    attemptNumber: 1,
    ...overrides,
  };
}

describe("visual-panel-qa", () => {
  describe("runVisualPanelQa", () => {
    it("should pass when all checks succeed", () => {
      const input = createMockInput();
      const result = runVisualPanelQa(input);

      expect(result.passed).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(0.75);
      expect(result.retryRecommended).toBe(false);
    });

    it("should include attempt information", () => {
      const input = createMockInput({ attemptNumber: 2 });
      const result = runVisualPanelQa(input);

      expect(result.attemptNumber).toBe(2);
      expect(result.maxAttempts).toBe(4);
    });

    it("should recommend retry when score is below threshold", () => {
      const input = createMockInput();
      const result = runVisualPanelQa(input, {
        narrativeFidelity: 0,
        characterFidelity: 0,
        composition: 0,
        technical: 1,
      });

      if (!result.passed) {
        expect(result.retryRecommended).toBe(true);
        expect(result.retryStrategy).toBeDefined();
      }
    });

    it("should mark for manual review when max attempts reached", () => {
      const input = createMockInput({ attemptNumber: 4 });
      const result = runVisualPanelQa(input, {
        narrativeFidelity: 0,
        characterFidelity: 0,
        composition: 0,
        technical: 0,
      });

      if (!result.passed) {
        expect(result.shouldMarkManualReview).toBe(true);
        expect(result.retryRecommended).toBe(false);
      }
    });
  });

  describe("checkNarrativeFidelity", () => {
    it("should return full score for passing checks", () => {
      const input = createMockInput();
      const result = checkNarrativeFidelity(input);

      expect(result.score).toBe(1.0);
      expect(result.failures).toHaveLength(0);
    });
  });

  describe("checkCharacterFidelity", () => {
    it("should return full score when no protagonist required", () => {
      const input = createMockInput({
        expectedCharacters: [
          { characterId: "npc_001", name: "NPC", isProtagonist: false },
        ],
      });
      const result = checkCharacterFidelity(input);

      expect(result.score).toBe(1.0);
    });

    it("should handle panels with no required characters", () => {
      const input = createMockInput({
        panelMetadata: {
          ...createMockInput().panelMetadata,
          mustShowCharacterIds: [],
        },
        expectedCharacters: [],
      });
      const result = checkCharacterFidelity(input);

      expect(result.score).toBe(1.0);
    });
  });

  describe("checkComposition", () => {
    it("should return full score for passing composition", () => {
      const input = createMockInput();
      const result = checkComposition(input);

      expect(result.score).toBe(1.0);
      expect(result.failures).toHaveLength(0);
    });

    it("should handle panels without text reservation", () => {
      const input = createMockInput({
        panelMetadata: {
          ...createMockInput().panelMetadata,
          reserveTextArea: false,
        },
      });
      const result = checkComposition(input);

      expect(result.score).toBe(1.0);
    });
  });

  describe("checkTechnical", () => {
    it("should return full score for passing technical checks", () => {
      const input = createMockInput();
      const result = checkTechnical(input);

      expect(result.score).toBe(1.0);
      expect(result.failures).toHaveLength(0);
    });
  });

  describe("buildRetryPrompt", () => {
    it("should return original prompt for same_prompt strategy", () => {
      const context: RetryContext = {
        panelId: "panel_001",
        originalPrompt: "Original test prompt",
        previousResults: [],
        currentStrategy: "same_prompt",
      };
      const result = buildRetryPrompt(context);

      expect(result.prompt).toBe("Original test prompt");
      expect(result.strengthenedRefs).toBe(false);
      expect(result.simplifiedScene).toBe(false);
    });

    it("should strengthen refs for stronger_character_lock strategy", () => {
      const context: RetryContext = {
        panelId: "panel_001",
        originalPrompt: "Original prompt",
        previousResults: [],
        currentStrategy: "stronger_character_lock",
      };
      const result = buildRetryPrompt(context);

      expect(result.strengthenedRefs).toBe(true);
      expect(result.prompt).toContain("protagonist");
    });

    it("should add composition hints for composition_fix strategy", () => {
      const context: RetryContext = {
        panelId: "panel_001",
        originalPrompt: "Original prompt",
        previousResults: [],
        currentStrategy: "composition_fix",
      };
      const result = buildRetryPrompt(context);

      expect(result.prompt).toContain("text bubbles");
    });

    it("should simplify scene for simpler_scene strategy", () => {
      const context: RetryContext = {
        panelId: "panel_001",
        originalPrompt: "Original prompt",
        previousResults: [],
        currentStrategy: "simpler_scene",
      };
      const result = buildRetryPrompt(context);

      expect(result.simplifiedScene).toBe(true);
      expect(result.prompt).toContain("Simplify");
    });

    it("should add focus hint for force_subject_focus strategy", () => {
      const context: RetryContext = {
        panelId: "panel_001",
        originalPrompt: "Original prompt",
        previousResults: [],
        currentStrategy: "force_subject_focus",
      };
      const result = buildRetryPrompt(context);

      expect(result.prompt).toContain("focal point");
    });
  });

  describe("createRetryRecord", () => {
    it("should create a complete retry record", () => {
      const qaResult = runVisualPanelQa(createMockInput());
      const record = createRetryRecord(
        "panel_001",
        "https://example.com/image.png",
        "Test prompt",
        qaResult,
        "refined_prompt"
      );

      expect(record.panelId).toBe("panel_001");
      expect(record.imageUrl).toBe("https://example.com/image.png");
      expect(record.promptUsed).toBe("Test prompt");
      expect(record.qaResult).toBe(qaResult);
      expect(record.strategy).toBe("refined_prompt");
      expect(record.timestamp).toBeDefined();
    });

    it("should handle null strategy", () => {
      const qaResult = runVisualPanelQa(createMockInput());
      const record = createRetryRecord(
        "panel_001",
        "https://example.com/image.png",
        "Test prompt",
        qaResult,
        null
      );

      expect(record.strategy).toBeNull();
    });
  });
});
