import { describe, expect, it, vi } from "vitest";
import {
  runVisualPanelQa,
  runVisualPanelQaWithOptionalVision,
  buildRetryPrompt,
  createRetryRecord,
  checkNarrativeFidelity,
  checkCharacterFidelity,
  checkComposition,
  checkTechnical,
  isCriticalPanelForVisualQa,
  type VisualQaInput,
  type RetryContext,
} from "./visual-panel-qa";
import type { CanonicalPanelPlan } from "@manga-ai-studio/core";

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
  describe("runVisualPanelQaWithOptionalVision", () => {
    it("sans VISUAL_PANEL_QA_VISION, retombe sur la QA heuristique uniquement", async () => {
      vi.stubEnv("VISUAL_PANEL_QA_VISION", "");
      const input = createMockInput();
      const result = await runVisualPanelQaWithOptionalVision(input);
      expect(result.visionAnalysis).toBeUndefined();
      expect(result.passed).toBe(runVisualPanelQa(input).passed);
      vi.unstubAllEnvs();
    });

    it("en production, panel critique sans vision → échec explicite (relecture manuelle)", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("VISUAL_PANEL_QA_VISION", "");
      vi.stubEnv("ENABLE_VISUAL_QA_MOCKS", "");
      const input = createMockInput();
      const result = await runVisualPanelQaWithOptionalVision(input);
      expect(result.passed).toBe(false);
      expect(result.shouldMarkManualReview).toBe(true);
      expect(result.reasons).toContain("Vision QA unavailable for critical panel");
      vi.unstubAllEnvs();
    });

    it("en développement, panel critique sans vision → heuristique prudente (pas succès optimiste)", async () => {
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("VISUAL_PANEL_QA_VISION", "");
      vi.stubEnv("ENABLE_VISUAL_QA_MOCKS", "");
      const input = createMockInput();
      const result = await runVisualPanelQaWithOptionalVision(input);
      expect(result.passed).toBe(false);
      vi.unstubAllEnvs();
    });
  });

  describe("isCriticalPanelForVisualQa", () => {
    it("returns true for actor-driven dialogue panel", () => {
      const panel = {
        panelId: "p1",
        beatId: "b1",
        panelIndex: 0,
        pageNumber: 1,
        panelNumberInPage: 1,
        role: "speaker" as const,
        isCutaway: false,
        isActorDriven: true,
        purpose: "x",
        shotType: "medium",
        cameraAngle: "eye_level",
        subjectFocus: "hero",
        requiredCharacterIds: [],
        mustShowCharacterIds: ["h1"],
        mayShowCharacterIds: [],
        requiredEntityIds: [],
        mustShowEnemy: false,
        requiredNpcCount: 0,
        requiredProps: [],
        requiredLocationSignals: [],
        textPlan: {
          panelId: "p1",
          mode: "dialogue" as const,
          reserveTextArea: true,
        },
        criticality: "medium" as const,
        notes: [],
      } satisfies CanonicalPanelPlan;
      expect(isCriticalPanelForVisualQa(panel)).toBe(true);
    });
  });

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
      expect(result.maxAttempts).toBe(2);
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

    it("should simplify scene for simplify_scene strategy", () => {
      const context: RetryContext = {
        panelId: "panel_001",
        originalPrompt: "Original prompt",
        previousResults: [],
        currentStrategy: "simplify_scene",
      };
      const result = buildRetryPrompt(context);

      expect(result.simplifiedScene).toBe(true);
      expect(result.prompt).toContain("Simplify");
    });

    it("should add focal hint for composition_fix strategy", () => {
      const context: RetryContext = {
        panelId: "panel_001",
        originalPrompt: "Original prompt",
        previousResults: [],
        currentStrategy: "composition_fix",
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
