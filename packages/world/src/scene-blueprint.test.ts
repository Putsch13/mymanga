import { describe, expect, it } from "vitest";
import { buildSceneBlueprint } from "./scene-blueprint";
import { buildFixedRegressionSuite, buildMetamorphicPair, buildProceduralStressSuite, runBlueprintSuite } from "./qa-suites";

describe("scene blueprint", () => {
  it("builds a structured blueprint before final prompt composition", () => {
    const base = buildFixedRegressionSuite()[0];
    const blueprint = buildSceneBlueprint(base.input);

    expect(blueprint.environment.mustShowLocationSignals.length).toBeGreaterThan(1);
    expect(blueprint.constraints.hard.length).toBeGreaterThan(0);
    expect(blueprint.promptBridge.environmentLine).toContain("location signals");
  });

  it("passes fixed regression suite", () => {
    const report = runBlueprintSuite("fixed_regression_suite", buildFixedRegressionSuite());
    if (report.failed > 0) {
      throw new Error(JSON.stringify(report.results.filter((result) => !result.ok)));
    }
    expect(report.failed).toBe(0);
    expect(report.passed).toBe(report.total);
  });

  it("passes a seeded procedural stress suite", () => {
    const base = buildFixedRegressionSuite()[0].input;
    const suite = buildProceduralStressSuite(base, [11, 27, 51, 88, 144]);
    const report = runBlueprintSuite("procedural_stress_suite", suite);
    expect(report.failed).toBe(0);
  });

  it("keeps stable elements stable and changed elements changed in metamorphic pairs", () => {
    const base = buildFixedRegressionSuite()[0].input;
    const { a, b } = buildMetamorphicPair(
      base,
      {},
      { scene: { ...base.scene, weather: "clear" } },
    );

    expect(a.seed).toBe(b.seed);
    expect(a.environment.primaryLocation).toBe(b.environment.primaryLocation);
    expect(a.environment.weather).not.toBe(b.environment.weather);
  });
});
