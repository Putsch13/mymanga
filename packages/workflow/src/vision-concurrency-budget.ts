/**
 * P5.1 — Vision Concurrency Budget
 *
 * Gère le budget de concurrence pour les appels API de vision/similarity.
 * Permet d'ajuster dynamiquement la concurrence en fonction de :
 *   - L'état de santé des APIs (QualityGuardStatus)
 *   - Le nombre de panels restants dans le chapitre
 *   - Les erreurs récentes (rate limiting, timeouts)
 *
 * Sorties :
 *   - Fonction pour vérifier si un appel vision peut être fait
 *   - Budget tracking pour metrics
 *   - Recommendation de concurrence pour le pipeline
 */

import type { QualityGuardStatus } from "./quality-guard-status";
import { isDegradedMode } from "./quality-guard-status";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface VisionConcurrencyBudget {
  maxConcurrentCalls: number;
  maxCallsPerMinute: number;
  currentActiveCalls: number;
  callsThisMinute: number;
  windowStartMs: number;
  lastErrorMs: number | null;
  consecutiveErrors: number;
  totalCallsMade: number;
  totalCallsSkipped: number;
  totalErrors: number;
}

export interface VisionBudgetConfig {
  baseMaxConcurrentCalls: number;
  baseMaxCallsPerMinute: number;
  degradedMaxConcurrentCalls: number;
  degradedMaxCallsPerMinute: number;
  errorCooldownMs: number;
  maxConsecutiveErrorsBeforePause: number;
}

export type VisionCallDecision =
  | { allowed: true }
  | { allowed: false; reason: VisionBlockReason; retryAfterMs?: number };

export type VisionBlockReason =
  | "concurrency_limit_reached"
  | "rate_limit_reached"
  | "error_cooldown"
  | "too_many_consecutive_errors"
  | "degraded_mode_restricted";

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: VisionBudgetConfig = {
  baseMaxConcurrentCalls: 4,
  baseMaxCallsPerMinute: 60,
  degradedMaxConcurrentCalls: 2,
  degradedMaxCallsPerMinute: 30,
  errorCooldownMs: 5000,
  maxConsecutiveErrorsBeforePause: 3,
};

// ────────────────────────────────────────────────────────────────────────────
// Budget management
// ────────────────────────────────────────────────────────────────────────────

export function createVisionConcurrencyBudget(
  config: Partial<VisionBudgetConfig> = {},
): VisionConcurrencyBudget {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  return {
    maxConcurrentCalls: fullConfig.baseMaxConcurrentCalls,
    maxCallsPerMinute: fullConfig.baseMaxCallsPerMinute,
    currentActiveCalls: 0,
    callsThisMinute: 0,
    windowStartMs: Date.now(),
    lastErrorMs: null,
    consecutiveErrors: 0,
    totalCallsMade: 0,
    totalCallsSkipped: 0,
    totalErrors: 0,
  };
}

export function adjustBudgetForQualityGuard(
  budget: VisionConcurrencyBudget,
  qualityGuardStatus: QualityGuardStatus,
  config: Partial<VisionBudgetConfig> = {},
): VisionConcurrencyBudget {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };

  if (isDegradedMode(qualityGuardStatus)) {
    return {
      ...budget,
      maxConcurrentCalls: fullConfig.degradedMaxConcurrentCalls,
      maxCallsPerMinute: fullConfig.degradedMaxCallsPerMinute,
    };
  }

  return {
    ...budget,
    maxConcurrentCalls: fullConfig.baseMaxConcurrentCalls,
    maxCallsPerMinute: fullConfig.baseMaxCallsPerMinute,
  };
}

function resetMinuteWindowIfNeeded(budget: VisionConcurrencyBudget): VisionConcurrencyBudget {
  const now = Date.now();
  if (now - budget.windowStartMs >= 60000) {
    return {
      ...budget,
      callsThisMinute: 0,
      windowStartMs: now,
    };
  }
  return budget;
}

export function canMakeVisionCall(
  budget: VisionConcurrencyBudget,
  config: Partial<VisionBudgetConfig> = {},
): VisionCallDecision {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  const updatedBudget = resetMinuteWindowIfNeeded(budget);
  const now = Date.now();

  // Check consecutive errors
  if (updatedBudget.consecutiveErrors >= fullConfig.maxConsecutiveErrorsBeforePause) {
    return {
      allowed: false,
      reason: "too_many_consecutive_errors",
      retryAfterMs: fullConfig.errorCooldownMs * 2,
    };
  }

  // Check error cooldown
  if (
    updatedBudget.lastErrorMs !== null &&
    now - updatedBudget.lastErrorMs < fullConfig.errorCooldownMs
  ) {
    return {
      allowed: false,
      reason: "error_cooldown",
      retryAfterMs: fullConfig.errorCooldownMs - (now - updatedBudget.lastErrorMs),
    };
  }

  // Check concurrency limit
  if (updatedBudget.currentActiveCalls >= updatedBudget.maxConcurrentCalls) {
    return {
      allowed: false,
      reason: "concurrency_limit_reached",
    };
  }

  // Check rate limit
  if (updatedBudget.callsThisMinute >= updatedBudget.maxCallsPerMinute) {
    const timeLeftInWindow = 60000 - (now - updatedBudget.windowStartMs);
    return {
      allowed: false,
      reason: "rate_limit_reached",
      retryAfterMs: timeLeftInWindow,
    };
  }

  return { allowed: true };
}

export function recordVisionCallStart(budget: VisionConcurrencyBudget): VisionConcurrencyBudget {
  const updatedBudget = resetMinuteWindowIfNeeded(budget);
  return {
    ...updatedBudget,
    currentActiveCalls: updatedBudget.currentActiveCalls + 1,
    callsThisMinute: updatedBudget.callsThisMinute + 1,
    totalCallsMade: updatedBudget.totalCallsMade + 1,
  };
}

export function recordVisionCallEnd(
  budget: VisionConcurrencyBudget,
  success: boolean,
): VisionConcurrencyBudget {
  const now = Date.now();
  return {
    ...budget,
    currentActiveCalls: Math.max(0, budget.currentActiveCalls - 1),
    consecutiveErrors: success ? 0 : budget.consecutiveErrors + 1,
    lastErrorMs: success ? budget.lastErrorMs : now,
    totalErrors: success ? budget.totalErrors : budget.totalErrors + 1,
  };
}

export function recordVisionCallSkipped(budget: VisionConcurrencyBudget): VisionConcurrencyBudget {
  return {
    ...budget,
    totalCallsSkipped: budget.totalCallsSkipped + 1,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Concurrency recommendation
// ────────────────────────────────────────────────────────────────────────────

export interface ConcurrencyRecommendation {
  recommendedConcurrency: number;
  reason: string;
  shouldThrottle: boolean;
  estimatedWaitMs: number;
}

export function getVisionConcurrencyRecommendation(
  budget: VisionConcurrencyBudget,
  qualityGuardStatus: QualityGuardStatus,
  remainingPanels: number,
): ConcurrencyRecommendation {
  // If in degraded mode, recommend minimal concurrency
  if (isDegradedMode(qualityGuardStatus)) {
    return {
      recommendedConcurrency: 1,
      reason: `degraded_mode_${qualityGuardStatus.mode}`,
      shouldThrottle: true,
      estimatedWaitMs: 2000,
    };
  }

  // If too many errors, throttle heavily
  if (budget.consecutiveErrors >= 2) {
    return {
      recommendedConcurrency: 1,
      reason: "consecutive_errors",
      shouldThrottle: true,
      estimatedWaitMs: 5000,
    };
  }

  // If near rate limit (using budget's own limits), reduce concurrency
  const usageRatio = budget.callsThisMinute / budget.maxCallsPerMinute;
  if (usageRatio > 0.8) {
    return {
      recommendedConcurrency: Math.max(1, Math.floor(budget.maxConcurrentCalls / 2)),
      reason: "approaching_rate_limit",
      shouldThrottle: true,
      estimatedWaitMs: 1000,
    };
  }

  // If many panels remaining, be conservative
  if (remainingPanels > 50) {
    return {
      recommendedConcurrency: Math.max(2, Math.floor(budget.maxConcurrentCalls * 0.75)),
      reason: "many_panels_remaining",
      shouldThrottle: false,
      estimatedWaitMs: 0,
    };
  }

  // Normal operation
  return {
    recommendedConcurrency: budget.maxConcurrentCalls,
    reason: "normal_operation",
    shouldThrottle: false,
    estimatedWaitMs: 0,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Debug / Metrics
// ────────────────────────────────────────────────────────────────────────────

export function getVisionBudgetDebugInfo(budget: VisionConcurrencyBudget): string {
  const now = Date.now();
  const windowAge = Math.round((now - budget.windowStartMs) / 1000);
  return [
    `active=${budget.currentActiveCalls}/${budget.maxConcurrentCalls}`,
    `minute=${budget.callsThisMinute}/${budget.maxCallsPerMinute}`,
    `windowAge=${windowAge}s`,
    `errors=${budget.consecutiveErrors}`,
    `total=${budget.totalCallsMade}`,
    `skipped=${budget.totalCallsSkipped}`,
  ].join(" | ");
}
