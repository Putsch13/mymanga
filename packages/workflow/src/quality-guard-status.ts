/**
 * P0.5 — Quality Guard Status
 *
 * Tracks the operational status of vision/similarity APIs during chapter generation.
 * When these APIs are unavailable (429, 400), the pipeline enters a "degraded" mode:
 *   - Reduces concurrency
 *   - Increases ref memory retention
 *   - Disables aggressive rerolls
 *   - Records the degraded status in generation diagnostics
 */

export type QualityGuardMode =
  | "FULLY_OPERATIONAL"
  | "DEGRADED_VISION_UNAVAILABLE"
  | "DEGRADED_SIMILARITY_UNAVAILABLE"
  | "DEGRADED_BOTH_UNAVAILABLE";

export interface QualityGuardStatus {
  mode: QualityGuardMode;
  visionAvailable: boolean;
  similarityAvailable: boolean;
  visionFailureCount: number;
  similarityFailureCount: number;
  lastVisionError?: string;
  lastSimilarityError?: string;
  rerollPolicyAdjustment: RerollPolicyAdjustment;
}

export interface RerollPolicyAdjustment {
  maxRerolls: number;
  forcePreserveRefs: boolean;
  disableAggressiveRerolls: boolean;
  reduceConcurrency: boolean;
}

const DEFAULT_REROLL_POLICY: RerollPolicyAdjustment = {
  maxRerolls: 3,
  forcePreserveRefs: false,
  disableAggressiveRerolls: false,
  reduceConcurrency: false,
};

const DEGRADED_REROLL_POLICY: RerollPolicyAdjustment = {
  maxRerolls: 2,
  forcePreserveRefs: true,
  disableAggressiveRerolls: true,
  reduceConcurrency: true,
};

const SEVERELY_DEGRADED_REROLL_POLICY: RerollPolicyAdjustment = {
  maxRerolls: 1,
  forcePreserveRefs: true,
  disableAggressiveRerolls: true,
  reduceConcurrency: true,
};

const FAILURE_THRESHOLD = 3;

export function createQualityGuardStatus(): QualityGuardStatus {
  return {
    mode: "FULLY_OPERATIONAL",
    visionAvailable: true,
    similarityAvailable: true,
    visionFailureCount: 0,
    similarityFailureCount: 0,
    rerollPolicyAdjustment: DEFAULT_REROLL_POLICY,
  };
}

export function recordVisionFailure(
  status: QualityGuardStatus,
  error: string,
): QualityGuardStatus {
  const newCount = status.visionFailureCount + 1;
  const visionAvailable = newCount < FAILURE_THRESHOLD;
  const mode = computeMode(visionAvailable, status.similarityAvailable);
  return {
    ...status,
    visionFailureCount: newCount,
    visionAvailable,
    lastVisionError: error,
    mode,
    rerollPolicyAdjustment: computeRerollPolicy(visionAvailable, status.similarityAvailable),
  };
}

export function recordSimilarityFailure(
  status: QualityGuardStatus,
  error: string,
): QualityGuardStatus {
  const newCount = status.similarityFailureCount + 1;
  const similarityAvailable = newCount < FAILURE_THRESHOLD;
  const mode = computeMode(status.visionAvailable, similarityAvailable);
  return {
    ...status,
    similarityFailureCount: newCount,
    similarityAvailable,
    lastSimilarityError: error,
    mode,
    rerollPolicyAdjustment: computeRerollPolicy(status.visionAvailable, similarityAvailable),
  };
}

export function recordVisionSuccess(status: QualityGuardStatus): QualityGuardStatus {
  if (status.visionAvailable && status.visionFailureCount === 0) return status;
  return {
    ...status,
    visionAvailable: true,
    visionFailureCount: 0,
    mode: computeMode(true, status.similarityAvailable),
    rerollPolicyAdjustment: computeRerollPolicy(true, status.similarityAvailable),
  };
}

export function recordSimilaritySuccess(status: QualityGuardStatus): QualityGuardStatus {
  if (status.similarityAvailable && status.similarityFailureCount === 0) return status;
  return {
    ...status,
    similarityAvailable: true,
    similarityFailureCount: 0,
    mode: computeMode(status.visionAvailable, true),
    rerollPolicyAdjustment: computeRerollPolicy(status.visionAvailable, true),
  };
}

function computeMode(visionAvailable: boolean, similarityAvailable: boolean): QualityGuardMode {
  if (visionAvailable && similarityAvailable) return "FULLY_OPERATIONAL";
  if (!visionAvailable && !similarityAvailable) return "DEGRADED_BOTH_UNAVAILABLE";
  if (!visionAvailable) return "DEGRADED_VISION_UNAVAILABLE";
  return "DEGRADED_SIMILARITY_UNAVAILABLE";
}

function computeRerollPolicy(visionAvailable: boolean, similarityAvailable: boolean): RerollPolicyAdjustment {
  if (visionAvailable && similarityAvailable) return DEFAULT_REROLL_POLICY;
  if (!visionAvailable && !similarityAvailable) return SEVERELY_DEGRADED_REROLL_POLICY;
  return DEGRADED_REROLL_POLICY;
}

export function isDegradedMode(status: QualityGuardStatus): boolean {
  return status.mode !== "FULLY_OPERATIONAL";
}

export function getDegradedModeLabel(status: QualityGuardStatus): string | null {
  switch (status.mode) {
    case "FULLY_OPERATIONAL":
      return null;
    case "DEGRADED_VISION_UNAVAILABLE":
      return "vision_api_unavailable";
    case "DEGRADED_SIMILARITY_UNAVAILABLE":
      return "similarity_api_unavailable";
    case "DEGRADED_BOTH_UNAVAILABLE":
      return "vision_and_similarity_unavailable";
  }
}

export function shouldSkipReroll(
  status: QualityGuardStatus,
  rerollReason: string,
): { skip: boolean; reason?: string } {
  if (status.mode === "FULLY_OPERATIONAL") {
    return { skip: false };
  }

  const policy = status.rerollPolicyAdjustment;

  if (policy.disableAggressiveRerolls) {
    const aggressiveReasons = [
      "REROLL_COMPOSITION",
      "REROLL_SUBJECT_FOCUS",
      "REROLL_STYLE",
    ];
    if (aggressiveReasons.includes(rerollReason)) {
      return {
        skip: true,
        reason: `aggressive_reroll_disabled_in_degraded_mode_${status.mode}`,
      };
    }
  }

  return { skip: false };
}
