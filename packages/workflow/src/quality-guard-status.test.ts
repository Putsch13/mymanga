import { describe, expect, it } from "vitest";
import {
  createQualityGuardStatus,
  recordVisionFailure,
  recordSimilarityFailure,
  recordVisionSuccess,
  isDegradedMode,
  getDegradedModeLabel,
  shouldSkipReroll,
} from "./quality-guard-status";

describe("P0.5 — quality-guard-status", () => {
  it("starts in FULLY_OPERATIONAL mode", () => {
    const status = createQualityGuardStatus();
    expect(status.mode).toBe("FULLY_OPERATIONAL");
    expect(status.visionAvailable).toBe(true);
    expect(status.similarityAvailable).toBe(true);
    expect(isDegradedMode(status)).toBe(false);
  });

  it("enters DEGRADED_VISION_UNAVAILABLE after 3 vision failures", () => {
    let status = createQualityGuardStatus();
    status = recordVisionFailure(status, "429 rate limit");
    expect(status.mode).toBe("FULLY_OPERATIONAL");
    status = recordVisionFailure(status, "429 rate limit");
    expect(status.mode).toBe("FULLY_OPERATIONAL");
    status = recordVisionFailure(status, "429 rate limit");
    expect(status.mode).toBe("DEGRADED_VISION_UNAVAILABLE");
    expect(status.visionAvailable).toBe(false);
    expect(isDegradedMode(status)).toBe(true);
    expect(getDegradedModeLabel(status)).toBe("vision_api_unavailable");
  });

  it("enters DEGRADED_SIMILARITY_UNAVAILABLE after 3 similarity failures", () => {
    let status = createQualityGuardStatus();
    status = recordSimilarityFailure(status, "400 download error");
    status = recordSimilarityFailure(status, "429 rate limit");
    status = recordSimilarityFailure(status, "429 rate limit");
    expect(status.mode).toBe("DEGRADED_SIMILARITY_UNAVAILABLE");
    expect(status.similarityAvailable).toBe(false);
    expect(getDegradedModeLabel(status)).toBe("similarity_api_unavailable");
  });

  it("enters DEGRADED_BOTH_UNAVAILABLE when both fail", () => {
    let status = createQualityGuardStatus();
    for (let i = 0; i < 3; i++) {
      status = recordVisionFailure(status, "429");
      status = recordSimilarityFailure(status, "429");
    }
    expect(status.mode).toBe("DEGRADED_BOTH_UNAVAILABLE");
    expect(getDegradedModeLabel(status)).toBe("vision_and_similarity_unavailable");
  });

  it("recovers to FULLY_OPERATIONAL after success", () => {
    let status = createQualityGuardStatus();
    for (let i = 0; i < 3; i++) {
      status = recordVisionFailure(status, "429");
    }
    expect(status.mode).toBe("DEGRADED_VISION_UNAVAILABLE");

    status = recordVisionSuccess(status);
    expect(status.mode).toBe("FULLY_OPERATIONAL");
    expect(status.visionAvailable).toBe(true);
    expect(status.visionFailureCount).toBe(0);
  });

  it("disables aggressive rerolls in degraded mode", () => {
    let status = createQualityGuardStatus();
    for (let i = 0; i < 3; i++) {
      status = recordVisionFailure(status, "429");
    }

    const compositionReroll = shouldSkipReroll(status, "REROLL_COMPOSITION");
    expect(compositionReroll.skip).toBe(true);
    expect(compositionReroll.reason).toContain("aggressive_reroll_disabled");

    const charReroll = shouldSkipReroll(status, "REROLL_CHARACTER_HARD");
    expect(charReroll.skip).toBe(false);
  });

  it("reduces maxRerolls in degraded mode", () => {
    let status = createQualityGuardStatus();
    expect(status.rerollPolicyAdjustment.maxRerolls).toBe(3);

    for (let i = 0; i < 3; i++) {
      status = recordVisionFailure(status, "429");
    }
    expect(status.rerollPolicyAdjustment.maxRerolls).toBe(2);
    expect(status.rerollPolicyAdjustment.forcePreserveRefs).toBe(true);
    expect(status.rerollPolicyAdjustment.reduceConcurrency).toBe(true);
  });

  it("severely reduces maxRerolls when both APIs are unavailable", () => {
    let status = createQualityGuardStatus();
    for (let i = 0; i < 3; i++) {
      status = recordVisionFailure(status, "429");
      status = recordSimilarityFailure(status, "429");
    }
    expect(status.rerollPolicyAdjustment.maxRerolls).toBe(1);
  });
});
