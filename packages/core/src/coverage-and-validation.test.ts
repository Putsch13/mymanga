import { describe, it, expect } from "vitest";
import {
  computeCoverageGaps,
  validateShotCompliance,
} from "./shot-diversity-enforcer";
import type { PanelBlueprintPremium } from "./types/narrative-facts";

function makeBlueprint(overrides: Partial<PanelBlueprintPremium> = {}): PanelBlueprintPremium {
  return {
    beatId: "beat_1",
    panelIndex: 0,
    shotType: "medium",
    subjectFocus: "hero",
    heroCenterAllowed: true,
    purpose: "test",
    cutawayType: "none",
    mustShowEnemy: false,
    requiredNpcCount: 0,
    ...overrides,
  } as PanelBlueprintPremium;
}

describe("computeCoverageGaps", () => {
  it("returns ok when planned matches rendered", () => {
    const planned = { enemyCoverage: 0.1, npcCoverage: 0.1, cutawayCoverage: 0.05, heroCenterRatio: 0.3, environmentRatio: 0.15, insertRatio: 0.05 };
    const gaps = computeCoverageGaps(planned, planned);
    expect(gaps.every(g => g.severity === "ok")).toBe(true);
  });

  it("returns critical when gap > 0.15", () => {
    const planned = { enemyCoverage: 0.2, npcCoverage: 0.1, cutawayCoverage: 0.05, heroCenterRatio: 0.3, environmentRatio: 0.15, insertRatio: 0.05 };
    const rendered = { enemyCoverage: 0.0, npcCoverage: 0.1, cutawayCoverage: 0.05, heroCenterRatio: 0.3, environmentRatio: 0.15, insertRatio: 0.05 };
    const gaps = computeCoverageGaps(planned, rendered);
    const enemyGap = gaps.find(g => g.metric === "enemyCoverage");
    expect(enemyGap!.severity).toBe("critical");
    expect(enemyGap!.delta).toBeCloseTo(0.2);
  });

  it("returns warning when gap between 0.08 and 0.15", () => {
    const planned = { enemyCoverage: 0.1, npcCoverage: 0.2, cutawayCoverage: 0.05, heroCenterRatio: 0.3, environmentRatio: 0.15, insertRatio: 0.05 };
    const rendered = { enemyCoverage: 0.1, npcCoverage: 0.1, cutawayCoverage: 0.05, heroCenterRatio: 0.3, environmentRatio: 0.15, insertRatio: 0.05 };
    const gaps = computeCoverageGaps(planned, rendered);
    const npcGap = gaps.find(g => g.metric === "npcCoverage");
    expect(npcGap!.severity).toBe("warning");
  });
});

describe("validateShotCompliance", () => {
  it("passes when all required subjects are detected", () => {
    const bp = makeBlueprint({ requiredSubjects: ["hero", "suzo"] });
    const result = validateShotCompliance("shot_1", bp, {
      detectedSubjects: ["Hero", "Suzo", "background"],
    });
    expect(result.passed).toBe(true);
    expect(result.failures).toHaveLength(0);
  });

  it("fails when a required subject is missing", () => {
    const bp = makeBlueprint({ requiredSubjects: ["hero", "suzo"] });
    const result = validateShotCompliance("shot_1", bp, {
      detectedSubjects: ["Hero"],
    });
    expect(result.passed).toBe(false);
    expect(result.failures).toContain("missing_required_subject:suzo");
  });

  it("fails when enemy required but not detected", () => {
    const bp = makeBlueprint({ mustShowEnemy: true });
    const result = validateShotCompliance("shot_1", bp, {
      detectedSubjects: ["Hero"],
    });
    expect(result.passed).toBe(false);
    expect(result.failures).toContain("enemy_required_but_not_detected");
  });

  it("passes when enemy required and detected", () => {
    const bp = makeBlueprint({ mustShowEnemy: true });
    const result = validateShotCompliance("shot_1", bp, {
      detectedSubjects: ["Guard", "soldier"],
    });
    expect(result.passed).toBe(true);
  });

  it("fails for environment shot without visible environment", () => {
    const bp = makeBlueprint({ subjectFocus: "environment" });
    const result = validateShotCompliance("shot_1", bp, {
      hasVisibleEnvironment: false,
    });
    expect(result.passed).toBe(false);
    expect(result.failures).toContain("environment_shot_without_visible_environment");
  });
});
