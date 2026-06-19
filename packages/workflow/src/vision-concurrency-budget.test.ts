import { describe, expect, it } from "vitest";
import {
  createVisionConcurrencyBudget,
  adjustBudgetForQualityGuard,
  canMakeVisionCall,
  recordVisionCallStart,
  recordVisionCallEnd,
  recordVisionCallSkipped,
  getVisionConcurrencyRecommendation,
  getVisionBudgetDebugInfo,
} from "./vision-concurrency-budget";
import { createQualityGuardStatus, recordVisionFailure } from "./quality-guard-status";

describe("P5.1 — vision-concurrency-budget", () => {
  describe("createVisionConcurrencyBudget", () => {
    it("creates budget with default values", () => {
      const budget = createVisionConcurrencyBudget();

      expect(budget.maxConcurrentCalls).toBe(4);
      expect(budget.maxCallsPerMinute).toBe(60);
      expect(budget.currentActiveCalls).toBe(0);
      expect(budget.callsThisMinute).toBe(0);
      expect(budget.consecutiveErrors).toBe(0);
    });

    it("accepts custom config", () => {
      const budget = createVisionConcurrencyBudget({
        baseMaxConcurrentCalls: 8,
        baseMaxCallsPerMinute: 120,
      });

      expect(budget.maxConcurrentCalls).toBe(8);
      expect(budget.maxCallsPerMinute).toBe(120);
    });
  });

  describe("adjustBudgetForQualityGuard", () => {
    it("reduces limits in degraded mode", () => {
      let qualityGuard = createQualityGuardStatus();
      for (let i = 0; i < 3; i++) {
        qualityGuard = recordVisionFailure(qualityGuard, "429");
      }

      const budget = createVisionConcurrencyBudget();
      const adjusted = adjustBudgetForQualityGuard(budget, qualityGuard);

      expect(adjusted.maxConcurrentCalls).toBe(2);
      expect(adjusted.maxCallsPerMinute).toBe(30);
    });

    it("keeps normal limits when fully operational", () => {
      const qualityGuard = createQualityGuardStatus();
      const budget = createVisionConcurrencyBudget();
      const adjusted = adjustBudgetForQualityGuard(budget, qualityGuard);

      expect(adjusted.maxConcurrentCalls).toBe(4);
      expect(adjusted.maxCallsPerMinute).toBe(60);
    });
  });

  describe("canMakeVisionCall", () => {
    it("allows call when budget is available", () => {
      const budget = createVisionConcurrencyBudget();
      const decision = canMakeVisionCall(budget);

      expect(decision.allowed).toBe(true);
    });

    it("blocks when concurrency limit reached", () => {
      let budget = createVisionConcurrencyBudget({ baseMaxConcurrentCalls: 2 });
      budget = recordVisionCallStart(budget);
      budget = recordVisionCallStart(budget);

      const decision = canMakeVisionCall(budget);

      expect(decision.allowed).toBe(false);
      if (!decision.allowed) {
        expect(decision.reason).toBe("concurrency_limit_reached");
      }
    });

    it("blocks when rate limit reached", () => {
      let budget = createVisionConcurrencyBudget({ baseMaxCallsPerMinute: 2 });
      budget = recordVisionCallStart(budget);
      budget = recordVisionCallEnd(budget, true);
      budget = recordVisionCallStart(budget);
      budget = recordVisionCallEnd(budget, true);

      const decision = canMakeVisionCall(budget);

      expect(decision.allowed).toBe(false);
      if (!decision.allowed) {
        expect(decision.reason).toBe("rate_limit_reached");
        expect(decision.retryAfterMs).toBeDefined();
      }
    });

    it("blocks after too many consecutive errors", () => {
      let budget = createVisionConcurrencyBudget({
        maxConsecutiveErrorsBeforePause: 2,
        errorCooldownMs: 0,
      });
      budget = recordVisionCallStart(budget);
      budget = recordVisionCallEnd(budget, false);
      budget = recordVisionCallStart(budget);
      budget = recordVisionCallEnd(budget, false);

      const decision = canMakeVisionCall(budget, {
        maxConsecutiveErrorsBeforePause: 2,
        errorCooldownMs: 0,
      });

      expect(decision.allowed).toBe(false);
      if (!decision.allowed) {
        expect(decision.reason).toBe("too_many_consecutive_errors");
      }
    });
  });

  describe("recordVisionCallStart/End", () => {
    it("tracks active calls", () => {
      let budget = createVisionConcurrencyBudget();

      budget = recordVisionCallStart(budget);
      expect(budget.currentActiveCalls).toBe(1);
      expect(budget.callsThisMinute).toBe(1);
      expect(budget.totalCallsMade).toBe(1);

      budget = recordVisionCallEnd(budget, true);
      expect(budget.currentActiveCalls).toBe(0);
      expect(budget.consecutiveErrors).toBe(0);
    });

    it("tracks errors", () => {
      let budget = createVisionConcurrencyBudget();

      budget = recordVisionCallStart(budget);
      budget = recordVisionCallEnd(budget, false);

      expect(budget.consecutiveErrors).toBe(1);
      expect(budget.totalErrors).toBe(1);
      expect(budget.lastErrorMs).not.toBeNull();
    });

    it("resets consecutive errors on success", () => {
      let budget = createVisionConcurrencyBudget();

      budget = recordVisionCallStart(budget);
      budget = recordVisionCallEnd(budget, false);
      expect(budget.consecutiveErrors).toBe(1);

      budget = recordVisionCallStart(budget);
      budget = recordVisionCallEnd(budget, true);
      expect(budget.consecutiveErrors).toBe(0);
    });
  });

  describe("recordVisionCallSkipped", () => {
    it("tracks skipped calls", () => {
      let budget = createVisionConcurrencyBudget();

      budget = recordVisionCallSkipped(budget);
      expect(budget.totalCallsSkipped).toBe(1);

      budget = recordVisionCallSkipped(budget);
      expect(budget.totalCallsSkipped).toBe(2);
    });
  });

  describe("getVisionConcurrencyRecommendation", () => {
    it("recommends minimal concurrency in degraded mode", () => {
      let qualityGuard = createQualityGuardStatus();
      for (let i = 0; i < 3; i++) {
        qualityGuard = recordVisionFailure(qualityGuard, "429");
      }

      const budget = createVisionConcurrencyBudget();
      const rec = getVisionConcurrencyRecommendation(budget, qualityGuard, 50);

      expect(rec.recommendedConcurrency).toBe(1);
      expect(rec.shouldThrottle).toBe(true);
      expect(rec.reason).toContain("degraded_mode");
    });

    it("recommends normal concurrency when healthy", () => {
      const qualityGuard = createQualityGuardStatus();
      const budget = createVisionConcurrencyBudget();
      const rec = getVisionConcurrencyRecommendation(budget, qualityGuard, 10);

      expect(rec.recommendedConcurrency).toBe(4);
      expect(rec.shouldThrottle).toBe(false);
      expect(rec.reason).toBe("normal_operation");
    });

    it("throttles when approaching rate limit", () => {
      const qualityGuard = createQualityGuardStatus();
      let budget = createVisionConcurrencyBudget({ baseMaxCallsPerMinute: 10 });

      for (let i = 0; i < 9; i++) {
        budget = recordVisionCallStart(budget);
        budget = recordVisionCallEnd(budget, true);
      }

      const rec = getVisionConcurrencyRecommendation(budget, qualityGuard, 10);

      expect(rec.shouldThrottle).toBe(true);
      expect(rec.reason).toBe("approaching_rate_limit");
    });

    it("is conservative with many panels remaining", () => {
      const qualityGuard = createQualityGuardStatus();
      const budget = createVisionConcurrencyBudget();
      const rec = getVisionConcurrencyRecommendation(budget, qualityGuard, 60);

      expect(rec.recommendedConcurrency).toBeLessThan(4);
      expect(rec.reason).toBe("many_panels_remaining");
    });
  });

  describe("getVisionBudgetDebugInfo", () => {
    it("returns human-readable debug info", () => {
      let budget = createVisionConcurrencyBudget();
      budget = recordVisionCallStart(budget);

      const debug = getVisionBudgetDebugInfo(budget);

      expect(debug).toContain("active=1/4");
      expect(debug).toContain("minute=1/60");
      expect(debug).toContain("errors=0");
    });
  });
});
