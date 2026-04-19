/**
 * P5.2 — Reroll Decision
 *
 * Détermine si un reroll est autorisé en fonction de :
 *   - L'état de santé des APIs (QualityGuardStatus)
 *   - Le budget de concurrence vision
 *   - Le type de reroll demandé (agressif vs conservateur)
 *   - Le nombre de rerolls déjà effectués
 *
 * Cette logique centralise la décision de reroll pour éviter des retries
 * inutiles quand le système est en mode dégradé.
 */

import type { QualityGuardStatus } from "./quality-guard-status";
import { isDegradedMode, shouldSkipReroll } from "./quality-guard-status";
import type { VisionConcurrencyBudget } from "./vision-concurrency-budget";
import { canMakeVisionCall } from "./vision-concurrency-budget";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export type RerollType =
  | "REROLL_CHARACTER_HARD"
  | "REROLL_CHARACTER_SOFT"
  | "REROLL_COMPOSITION"
  | "REROLL_STYLE"
  | "REROLL_SUBJECT_FOCUS"
  | "REROLL_ENVIRONMENT"
  | "REROLL_PROP"
  | "REROLL_CUTAWAY"
  | "REROLL_FULL";

export type RerollDecisionResult =
  | { allowed: true; adjustments: RerollAdjustments }
  | { allowed: false; reason: RerollBlockReason; details: string };

export type RerollBlockReason =
  | "degraded_mode_blocks_aggressive_reroll"
  | "max_rerolls_reached"
  | "vision_budget_exhausted"
  | "consecutive_failures"
  | "quality_check_unavailable";

export interface RerollAdjustments {
  preserveReferences: boolean;
  reducedConcurrency: boolean;
  skipVisionCheck: boolean;
  maxRetries: number;
}

export interface RerollDecisionInput {
  rerollType: RerollType;
  currentRerollCount: number;
  maxRerollsAllowed: number;
  qualityGuardStatus: QualityGuardStatus;
  visionBudget?: VisionConcurrencyBudget | null;
  panelCriticality?: "critical" | "high" | "medium" | "low";
}

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────

const AGGRESSIVE_REROLL_TYPES: RerollType[] = [
  "REROLL_COMPOSITION",
  "REROLL_SUBJECT_FOCUS",
  "REROLL_STYLE",
  "REROLL_FULL",
];

const CONSERVATIVE_REROLL_TYPES: RerollType[] = [
  "REROLL_CHARACTER_HARD",
  "REROLL_CHARACTER_SOFT",
  "REROLL_ENVIRONMENT",
  "REROLL_PROP",
  "REROLL_CUTAWAY",
];

// ────────────────────────────────────────────────────────────────────────────
// Decision logic
// ────────────────────────────────────────────────────────────────────────────

function isAggressiveReroll(rerollType: RerollType): boolean {
  return AGGRESSIVE_REROLL_TYPES.includes(rerollType);
}

function calculateEffectiveMaxRerolls(
  baseMax: number,
  qualityGuardStatus: QualityGuardStatus,
  panelCriticality?: string,
): number {
  let effectiveMax = baseMax;

  // Reduce max rerolls in degraded mode
  if (isDegradedMode(qualityGuardStatus)) {
    effectiveMax = Math.min(effectiveMax, qualityGuardStatus.rerollPolicyAdjustment.maxRerolls);
  }

  // Allow one extra reroll for critical panels
  if (panelCriticality === "critical") {
    effectiveMax = Math.min(baseMax + 1, effectiveMax + 1);
  }

  return Math.max(1, effectiveMax);
}

function buildAdjustments(
  qualityGuardStatus: QualityGuardStatus,
  rerollType: RerollType,
  visionBudget?: VisionConcurrencyBudget | null,
): RerollAdjustments {
  const policy = qualityGuardStatus.rerollPolicyAdjustment;

  const visionDecision = visionBudget ? canMakeVisionCall(visionBudget) : { allowed: true };

  return {
    preserveReferences: policy.forcePreserveRefs || isDegradedMode(qualityGuardStatus),
    reducedConcurrency: policy.reduceConcurrency,
    skipVisionCheck: !visionDecision.allowed || !qualityGuardStatus.visionAvailable,
    maxRetries: policy.maxRerolls,
  };
}

export function makeRerollDecision(input: RerollDecisionInput): RerollDecisionResult {
  const {
    rerollType,
    currentRerollCount,
    maxRerollsAllowed,
    qualityGuardStatus,
    visionBudget,
    panelCriticality,
  } = input;

  // Calculate effective max rerolls based on current state
  const effectiveMaxRerolls = calculateEffectiveMaxRerolls(
    maxRerollsAllowed,
    qualityGuardStatus,
    panelCriticality,
  );

  // Check if max rerolls reached
  if (currentRerollCount >= effectiveMaxRerolls) {
    return {
      allowed: false,
      reason: "max_rerolls_reached",
      details: `rerolls=${currentRerollCount}/${effectiveMaxRerolls}`,
    };
  }

  // Check if aggressive reroll is blocked in degraded mode
  if (isAggressiveReroll(rerollType)) {
    const skipCheck = shouldSkipReroll(qualityGuardStatus, rerollType);
    if (skipCheck.skip) {
      return {
        allowed: false,
        reason: "degraded_mode_blocks_aggressive_reroll",
        details: skipCheck.reason ?? "aggressive_blocked",
      };
    }
  }

  // Check if vision budget allows the reroll (for vision-dependent rerolls)
  const needsVisionCheck = [
    "REROLL_CHARACTER_HARD",
    "REROLL_COMPOSITION",
    "REROLL_SUBJECT_FOCUS",
  ].includes(rerollType);

  if (needsVisionCheck && visionBudget) {
    const visionDecision = canMakeVisionCall(visionBudget);
    if (!visionDecision.allowed && !qualityGuardStatus.visionAvailable) {
      return {
        allowed: false,
        reason: "vision_budget_exhausted",
        details: !visionDecision.allowed
          ? `vision_blocked_${(visionDecision as { reason?: string }).reason}`
          : "vision_api_unavailable",
      };
    }
  }

  // Reroll is allowed with adjustments
  const adjustments = buildAdjustments(qualityGuardStatus, rerollType, visionBudget);

  return {
    allowed: true,
    adjustments,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

export function getRerollDecisionDebugInfo(result: RerollDecisionResult): string {
  if (result.allowed) {
    return [
      "allowed=true",
      `preserveRefs=${result.adjustments.preserveReferences}`,
      `skipVision=${result.adjustments.skipVisionCheck}`,
      `maxRetries=${result.adjustments.maxRetries}`,
    ].join(" | ");
  }
  return `allowed=false reason=${result.reason} details=${result.details}`;
}

export function shouldPreserveReferences(result: RerollDecisionResult): boolean {
  return result.allowed && result.adjustments.preserveReferences;
}

export function canUseVisionForReroll(result: RerollDecisionResult): boolean {
  return result.allowed && !result.adjustments.skipVisionCheck;
}
