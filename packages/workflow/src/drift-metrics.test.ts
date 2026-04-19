import { describe, it, expect } from "vitest";
import {
  calculateDriftMetrics,
  formatDriftMetrics,
  isDriftAcceptable,
  getDriftAlerts,
  type PanelDriftInput,
} from "./drift-metrics";
import type { SubjectBalanceScore } from "./subject-balance-score";

function makePanel(
  overrides: Partial<PanelDriftInput> & { panelId: string },
): PanelDriftInput {
  return {
    panelType: "hero_portrait",
    dominantSubject: "hero",
    characterSimilarityScore: null,
    environmentScore: null,
    balanceScore: null,
    heroWasVisible: undefined,
    heroShouldBeVisible: undefined,
    ...overrides,
  };
}

function makeBalanceScore(
  target: number,
  observed: number | null,
): SubjectBalanceScore {
  return {
    targetScore: target,
    observedScore: observed,
    deviation: observed !== null ? observed - target : null,
    isAcceptable: observed !== null ? Math.abs(observed - target) <= 15 : true,
    recommendation: "acceptable",
    debugInfo: "",
  };
}

describe("calculateDriftMetrics", () => {
  it("returns zeroed metrics for empty panels", () => {
    const metrics = calculateDriftMetrics("ch1", []);
    expect(metrics.totalPanels).toBe(0);
    expect(metrics.analyzedPanels).toBe(0);
    expect(metrics.characterDrift.driftRate).toBe(0);
    expect(metrics.overallCoherence).toBe(1);
  });

  it("calculates character drift rate correctly", () => {
    const panels: PanelDriftInput[] = [
      makePanel({ panelId: "p1", characterSimilarityScore: 0.9 }),
      makePanel({ panelId: "p2", characterSimilarityScore: 0.8 }),
      makePanel({ panelId: "p3", characterSimilarityScore: 0.5 }), // drifted
      makePanel({ panelId: "p4", characterSimilarityScore: 0.4 }), // drifted
    ];

    const metrics = calculateDriftMetrics("ch1", panels);
    expect(metrics.characterDrift.panelsWithDrift).toBe(2);
    expect(metrics.characterDrift.driftRate).toBeCloseTo(0.5);
    expect(metrics.characterDrift.averageSimilarityScore).toBeCloseTo(0.65);
    expect(metrics.characterDrift.worstPanelId).toBe("p4");
    expect(metrics.characterDrift.worstPanelScore).toBe(0.4);
  });

  it("calculates environment inconsistency correctly", () => {
    const panels: PanelDriftInput[] = [
      makePanel({ panelId: "p1", environmentScore: 0.7 }),
      makePanel({ panelId: "p2", environmentScore: 0.3 }), // inconsistent
      makePanel({ panelId: "p3", environmentScore: 0.6 }),
    ];

    const metrics = calculateDriftMetrics("ch1", panels);
    expect(metrics.environmentDrift.panelsWithInconsistency).toBe(1);
    expect(metrics.environmentDrift.inconsistencyRate).toBeCloseTo(1 / 3);
    expect(metrics.environmentDrift.averageEnvironmentScore).toBeCloseTo(
      (0.7 + 0.3 + 0.6) / 3,
    );
  });

  it("calculates hero contamination correctly", () => {
    const panels: PanelDriftInput[] = [
      makePanel({
        panelId: "p1",
        panelType: "environment_establishing",
        dominantSubject: "environment",
        heroShouldBeVisible: false,
        heroWasVisible: true, // contaminated
      }),
      makePanel({
        panelId: "p2",
        panelType: "guard_focus",
        dominantSubject: "guard_group",
        heroShouldBeVisible: false,
        heroWasVisible: false,
      }),
      makePanel({
        panelId: "p3",
        panelType: "enemy_focus",
        dominantSubject: "enemy",
        heroShouldBeVisible: false,
        heroWasVisible: true, // contaminated
      }),
      makePanel({
        panelId: "p4",
        panelType: "hero_portrait",
        dominantSubject: "hero",
        heroShouldBeVisible: true,
        heroWasVisible: true, // not contaminated (hero panel)
      }),
    ];

    const metrics = calculateDriftMetrics("ch1", panels);
    expect(metrics.heroContamination.contaminatedPanels).toBe(2);
    expect(metrics.heroContamination.contaminationRate).toBeCloseTo(2 / 3);
    expect(metrics.heroContamination.affectedPanelTypes).toContain(
      "environment_establishing",
    );
    expect(metrics.heroContamination.affectedPanelTypes).toContain("enemy_focus");
  });

  it("detects contamination via balance score deviation", () => {
    const panels: PanelDriftInput[] = [
      makePanel({
        panelId: "p1",
        panelType: "enemy_focus",
        dominantSubject: "enemy",
        heroShouldBeVisible: false,
        heroWasVisible: false,
        balanceScore: makeBalanceScore(20, 50), // hero too visible via balance
      }),
    ];

    const metrics = calculateDriftMetrics("ch1", panels);
    expect(metrics.heroContamination.contaminatedPanels).toBe(1);
    expect(metrics.heroContamination.affectedPanelTypes).toContain("enemy_focus");
  });

  it("calculates overall coherence from weighted components", () => {
    const panels: PanelDriftInput[] = [
      makePanel({ panelId: "p1", characterSimilarityScore: 0.9, environmentScore: 0.8 }),
      makePanel({ panelId: "p2", characterSimilarityScore: 0.85, environmentScore: 0.7 }),
    ];

    const metrics = calculateDriftMetrics("ch1", panels);
    // charDrift = 0, envDrift = 0, contamRate = 0
    // coherence = (1-0)*0.4 + (1-0)*0.3 + (1-0)*0.3 = 1
    expect(metrics.overallCoherence).toBeCloseTo(1);
  });
});

describe("formatDriftMetrics", () => {
  it("formats metrics into readable string", () => {
    const metrics = calculateDriftMetrics("ch-test", [
      makePanel({ panelId: "p1", characterSimilarityScore: 0.8, environmentScore: 0.7 }),
    ]);

    const formatted = formatDriftMetrics(metrics);
    expect(formatted).toContain("chapter=ch-test");
    expect(formatted).toContain("total=1");
    expect(formatted).toContain("coherence:");
  });
});

describe("isDriftAcceptable", () => {
  it("returns true for good metrics", () => {
    const metrics = calculateDriftMetrics("ch1", [
      makePanel({ panelId: "p1", characterSimilarityScore: 0.9 }),
    ]);
    expect(isDriftAcceptable(metrics)).toBe(true);
  });

  it("returns false for high character drift", () => {
    const panels = Array.from({ length: 10 }, (_, i) =>
      makePanel({
        panelId: `p${i}`,
        characterSimilarityScore: i < 3 ? 0.9 : 0.4, // 70% drifted
      }),
    );
    const metrics = calculateDriftMetrics("ch1", panels);
    expect(isDriftAcceptable(metrics)).toBe(false);
  });

  it("returns false for high hero contamination", () => {
    const panels = Array.from({ length: 5 }, (_, i) =>
      makePanel({
        panelId: `p${i}`,
        panelType: "environment_establishing",
        dominantSubject: "environment",
        heroShouldBeVisible: false,
        heroWasVisible: true, // all contaminated
      }),
    );
    const metrics = calculateDriftMetrics("ch1", panels);
    expect(isDriftAcceptable(metrics)).toBe(false);
  });
});

describe("getDriftAlerts", () => {
  it("returns empty array for good metrics", () => {
    const metrics = calculateDriftMetrics("ch1", []);
    expect(getDriftAlerts(metrics)).toEqual([]);
  });

  it("returns HIGH_CHARACTER_DRIFT alert", () => {
    const panels = Array.from({ length: 10 }, (_, i) =>
      makePanel({
        panelId: `p${i}`,
        characterSimilarityScore: i < 4 ? 0.9 : 0.4,
      }),
    );
    const metrics = calculateDriftMetrics("ch1", panels);
    const alerts = getDriftAlerts(metrics);
    expect(alerts.some((a) => a.includes("HIGH_CHARACTER_DRIFT"))).toBe(true);
  });

  it("returns HIGH_HERO_CONTAMINATION alert", () => {
    const panels = Array.from({ length: 10 }, (_, i) =>
      makePanel({
        panelId: `p${i}`,
        panelType: "guard_focus",
        dominantSubject: "guard_group",
        heroShouldBeVisible: false,
        heroWasVisible: i < 4, // 40% contaminated
      }),
    );
    const metrics = calculateDriftMetrics("ch1", panels);
    const alerts = getDriftAlerts(metrics);
    expect(alerts.some((a) => a.includes("HIGH_HERO_CONTAMINATION"))).toBe(true);
  });

  it("returns LOW_OVERALL_COHERENCE alert", () => {
    const panels = Array.from({ length: 20 }, (_, i) =>
      makePanel({
        panelId: `p${i}`,
        panelType: "environment_establishing",
        dominantSubject: "environment",
        characterSimilarityScore: 0.3,
        environmentScore: 0.2,
        heroShouldBeVisible: false,
        heroWasVisible: true,
      }),
    );
    const metrics = calculateDriftMetrics("ch1", panels);
    const alerts = getDriftAlerts(metrics);
    expect(alerts.some((a) => a.includes("LOW_OVERALL_COHERENCE"))).toBe(true);
  });
});
