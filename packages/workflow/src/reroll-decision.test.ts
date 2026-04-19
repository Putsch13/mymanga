import { describe, expect, it } from "vitest";
import {
  makeRerollDecision,
  getRerollDecisionDebugInfo,
  shouldPreserveReferences,
  canUseVisionForReroll,
  type RerollDecisionInput,
} from "./reroll-decision";
import { createQualityGuardStatus, recordVisionFailure } from "./quality-guard-status";
import { createVisionConcurrencyBudget, recordVisionCallStart } from "./vision-concurrency-budget";

function makeInput(overrides: Partial<RerollDecisionInput> = {}): RerollDecisionInput {
  return {
    rerollType: "REROLL_CHARACTER_SOFT",
    currentRerollCount: 0,
    maxRerollsAllowed: 3,
    qualityGuardStatus: createQualityGuardStatus(),
    ...overrides,
  };
}

describe("P5.2 — reroll-decision", () => {
  describe("makeRerollDecision", () => {
    it("allows reroll when everything is healthy", () => {
      const input = makeInput();
      const result = makeRerollDecision(input);

      expect(result.allowed).toBe(true);
      if (result.allowed) {
        expect(result.adjustments.preserveReferences).toBe(false);
        expect(result.adjustments.skipVisionCheck).toBe(false);
      }
    });

    it("blocks reroll when max rerolls reached", () => {
      const input = makeInput({
        currentRerollCount: 3,
        maxRerollsAllowed: 3,
      });
      const result = makeRerollDecision(input);

      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.reason).toBe("max_rerolls_reached");
      }
    });

    it("blocks aggressive reroll in degraded mode", () => {
      let qualityGuard = createQualityGuardStatus();
      for (let i = 0; i < 3; i++) {
        qualityGuard = recordVisionFailure(qualityGuard, "429");
      }

      const input = makeInput({
        rerollType: "REROLL_COMPOSITION",
        qualityGuardStatus: qualityGuard,
      });
      const result = makeRerollDecision(input);

      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.reason).toBe("degraded_mode_blocks_aggressive_reroll");
      }
    });

    it("allows conservative reroll in degraded mode with adjustments", () => {
      let qualityGuard = createQualityGuardStatus();
      for (let i = 0; i < 3; i++) {
        qualityGuard = recordVisionFailure(qualityGuard, "429");
      }

      const input = makeInput({
        rerollType: "REROLL_CHARACTER_SOFT",
        qualityGuardStatus: qualityGuard,
      });
      const result = makeRerollDecision(input);

      expect(result.allowed).toBe(true);
      if (result.allowed) {
        expect(result.adjustments.preserveReferences).toBe(true);
        expect(result.adjustments.skipVisionCheck).toBe(true);
      }
    });

    it("reduces max rerolls in degraded mode", () => {
      let qualityGuard = createQualityGuardStatus();
      for (let i = 0; i < 3; i++) {
        qualityGuard = recordVisionFailure(qualityGuard, "429");
      }

      const input = makeInput({
        rerollType: "REROLL_CHARACTER_SOFT",
        currentRerollCount: 2,
        maxRerollsAllowed: 3,
        qualityGuardStatus: qualityGuard,
      });
      const result = makeRerollDecision(input);

      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.reason).toBe("max_rerolls_reached");
      }
    });

    it("allows extra reroll for critical panels", () => {
      let qualityGuard = createQualityGuardStatus();
      for (let i = 0; i < 3; i++) {
        qualityGuard = recordVisionFailure(qualityGuard, "429");
      }

      const input = makeInput({
        rerollType: "REROLL_CHARACTER_SOFT",
        currentRerollCount: 2,
        maxRerollsAllowed: 3,
        qualityGuardStatus: qualityGuard,
        panelCriticality: "critical",
      });
      const result = makeRerollDecision(input);

      expect(result.allowed).toBe(true);
    });

    it("blocks vision-dependent reroll when vision budget exhausted", () => {
      let visionBudget = createVisionConcurrencyBudget({ baseMaxConcurrentCalls: 1 });
      visionBudget = recordVisionCallStart(visionBudget);

      let qualityGuard = createQualityGuardStatus();
      for (let i = 0; i < 3; i++) {
        qualityGuard = recordVisionFailure(qualityGuard, "429");
      }

      const input = makeInput({
        rerollType: "REROLL_CHARACTER_HARD",
        qualityGuardStatus: qualityGuard,
        visionBudget,
      });
      const result = makeRerollDecision(input);

      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.reason).toBe("vision_budget_exhausted");
      }
    });
  });

  describe("helper functions", () => {
    it("getRerollDecisionDebugInfo for allowed reroll", () => {
      const input = makeInput();
      const result = makeRerollDecision(input);
      const debug = getRerollDecisionDebugInfo(result);

      expect(debug).toContain("allowed=true");
    });

    it("getRerollDecisionDebugInfo for blocked reroll", () => {
      const input = makeInput({
        currentRerollCount: 5,
        maxRerollsAllowed: 3,
      });
      const result = makeRerollDecision(input);
      const debug = getRerollDecisionDebugInfo(result);

      expect(debug).toContain("allowed=false");
      expect(debug).toContain("max_rerolls_reached");
    });

    it("shouldPreserveReferences returns true when adjustments indicate so", () => {
      let qualityGuard = createQualityGuardStatus();
      for (let i = 0; i < 3; i++) {
        qualityGuard = recordVisionFailure(qualityGuard, "429");
      }

      const input = makeInput({
        rerollType: "REROLL_CHARACTER_SOFT",
        qualityGuardStatus: qualityGuard,
      });
      const result = makeRerollDecision(input);

      expect(shouldPreserveReferences(result)).toBe(true);
    });

    it("canUseVisionForReroll returns false when vision unavailable", () => {
      let qualityGuard = createQualityGuardStatus();
      for (let i = 0; i < 3; i++) {
        qualityGuard = recordVisionFailure(qualityGuard, "429");
      }

      const input = makeInput({
        rerollType: "REROLL_CHARACTER_SOFT",
        qualityGuardStatus: qualityGuard,
      });
      const result = makeRerollDecision(input);

      expect(canUseVisionForReroll(result)).toBe(false);
    });
  });
});
