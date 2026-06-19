import { describe, it, expect } from "vitest";
import {
  analyzeShotDiversity,
  enforceShotDiversity,
  detectConsecutiveRepetitions,
  computePlannedCoverage,
  MANGA_SHOT_BUDGET,
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

describe("analyzeShotDiversity", () => {
  it("returns valid for empty blueprints", () => {
    const report = analyzeShotDiversity([]);
    expect(report.valid).toBe(true);
    expect(report.violations).toHaveLength(0);
  });

  it("detects hero_over_represented when ratio exceeds MAX_HERO_CENTER_RATIO", () => {
    const blueprints = Array.from({ length: 10 }, () => makeBlueprint({ subjectFocus: "hero", heroCenterAllowed: true }));
    const report = analyzeShotDiversity(blueprints);
    expect(report.heroCenterRatio).toBe(1.0);
    expect(report.violations.some(v => v.type === "hero_over_represented")).toBe(true);
    expect(report.valid).toBe(false);
  });

  it("marks hero >70% as blocking (fail threshold)", () => {
    const heroPanels = Array.from({ length: 8 }, () => makeBlueprint({ subjectFocus: "hero", heroCenterAllowed: true }));
    const envPanels = Array.from({ length: 2 }, () => makeBlueprint({ subjectFocus: "environment", heroCenterAllowed: false }));
    const report = analyzeShotDiversity([...heroPanels, ...envPanels]);
    expect(report.heroCenterRatio).toBe(0.8);
    const heroViolation = report.violations.find(v => v.type === "hero_over_represented");
    expect(heroViolation).toBeDefined();
    expect(heroViolation!.severity).toBe("blocking");
  });

  it("marks hero 60-70% as warning", () => {
    const heroPanels = Array.from({ length: 13 }, () => makeBlueprint({ subjectFocus: "hero", heroCenterAllowed: true }));
    const envPanels = Array.from({ length: 7 }, () => makeBlueprint({ subjectFocus: "environment", heroCenterAllowed: false }));
    const report = analyzeShotDiversity([...heroPanels, ...envPanels]);
    expect(report.heroCenterRatio).toBe(0.65);
    const heroViolation = report.violations.find(v => v.type === "hero_over_represented");
    expect(heroViolation).toBeDefined();
    expect(heroViolation!.severity).toBe("warning");
  });

  it("accepts a well-balanced chapter", () => {
    const hero = Array.from({ length: 4 }, () => makeBlueprint({ subjectFocus: "hero", heroCenterAllowed: true }));
    const env = Array.from({ length: 3 }, () => makeBlueprint({ subjectFocus: "environment", heroCenterAllowed: false }));
    const npc = Array.from({ length: 3 }, () => makeBlueprint({ subjectFocus: "npc", heroCenterAllowed: false, mustShowEnemy: true }));
    const reaction = Array.from({ length: 2 }, () => makeBlueprint({ subjectFocus: "reaction", heroCenterAllowed: false }));
    const insert = Array.from({ length: 2 }, () => makeBlueprint({ subjectFocus: "prop", heroCenterAllowed: false, cutawayType: "prop_insert" }));
    const blueprints = [...hero, ...env, ...npc, ...reaction, ...insert];
    const report = analyzeShotDiversity(blueprints);
    expect(report.heroCenterRatio).toBeLessThanOrEqual(MANGA_SHOT_BUDGET.MAX_HERO_CENTER_RATIO);
  });
});

describe("enforceShotDiversity", () => {
  it("converts excess hero panels to diverse shot types", () => {
    const blueprints = Array.from({ length: 10 }, (_, i) => makeBlueprint({ panelIndex: i }));
    const result = enforceShotDiversity(blueprints);
    const heroCount = result.blueprints.filter(b => b.heroCenterAllowed && b.subjectFocus === "hero").length;
    expect(heroCount / result.blueprints.length).toBeLessThanOrEqual(MANGA_SHOT_BUDGET.MAX_HERO_CENTER_RATIO + 0.05);
    expect(result.report.corrections.length).toBeGreaterThan(0);
  });

  it("breaks consecutive same shot type", () => {
    const blueprints = Array.from({ length: 6 }, (_, i) =>
      makeBlueprint({ panelIndex: i, subjectFocus: "environment", heroCenterAllowed: false, shotType: "wide" }),
    );
    const result = enforceShotDiversity(blueprints);
    const allWideEnv = result.blueprints.every(b => b.shotType === "wide" && b.subjectFocus === "environment");
    expect(allWideEnv).toBe(false);
  });

  it("breaks consecutive hero-centered panels", () => {
    const blueprints = Array.from({ length: 5 }, (_, i) =>
      makeBlueprint({ panelIndex: i, subjectFocus: "hero", heroCenterAllowed: true }),
    );
    const result = enforceShotDiversity(blueprints);
    let maxConsecutiveHero = 0;
    let current = 0;
    for (const b of result.blueprints) {
      if (b.heroCenterAllowed) {
        current++;
        maxConsecutiveHero = Math.max(maxConsecutiveHero, current);
      } else {
        current = 0;
      }
    }
    expect(maxConsecutiveHero).toBeLessThanOrEqual(MANGA_SHOT_BUDGET.MAX_CONSECUTIVE_HERO_CENTER);
  });
});

describe("detectConsecutiveRepetitions", () => {
  it("detects repeated patterns", () => {
    const blueprints = Array.from({ length: 5 }, () =>
      makeBlueprint({ shotType: "medium", subjectFocus: "hero", heroCenterAllowed: true }),
    );
    const repetitions = detectConsecutiveRepetitions(blueprints, 3);
    expect(repetitions.length).toBeGreaterThan(0);
    expect(repetitions[0]!.repeatedPattern).toContain("medium/hero/hero");
  });

  it("returns empty for varied panels", () => {
    const blueprints = [
      makeBlueprint({ shotType: "wide", subjectFocus: "environment", heroCenterAllowed: false }),
      makeBlueprint({ shotType: "medium", subjectFocus: "hero", heroCenterAllowed: true }),
      makeBlueprint({ shotType: "closeup", subjectFocus: "npc", heroCenterAllowed: false }),
      makeBlueprint({ shotType: "wide", subjectFocus: "reaction", heroCenterAllowed: false }),
    ];
    const repetitions = detectConsecutiveRepetitions(blueprints, 3);
    expect(repetitions).toHaveLength(0);
  });
});

describe("computePlannedCoverage", () => {
  it("computes ratios correctly", () => {
    const blueprints = [
      makeBlueprint({ subjectFocus: "hero", heroCenterAllowed: true }),
      makeBlueprint({ subjectFocus: "environment", heroCenterAllowed: false }),
      makeBlueprint({ subjectFocus: "npc", heroCenterAllowed: false, requiredNpcCount: 2 }),
      makeBlueprint({ subjectFocus: "enemy", heroCenterAllowed: false, mustShowEnemy: true }),
    ];
    const coverage = computePlannedCoverage(blueprints);
    expect(coverage.heroCenterRatio).toBe(0.25);
    expect(coverage.environmentRatio).toBe(0.25);
    expect(coverage.enemyCoverage).toBeGreaterThan(0);
  });
});
