/**
 * P2.2 — Tests de la couche `business-metrics`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  computeChapterStabilityScore,
  emitChapterStabilityScore,
  emitDecorDriftDetected,
  emitHeroBiasOnNonHeroPanel,
  emitImagePersistFailed,
  emitManualVisualRefNonCanonical,
  emitNpcAiFallback,
  emitNpcDriftDetected,
  emitPanelRetry,
  type BusinessMetricEvent,
} from "./business-metrics";

function parseLogLine(line: string): { event: string; ns: string; level: string; payload: Record<string, unknown>; projectId?: string; chapterId?: string } {
  return JSON.parse(line);
}

const logs: { level: string; line: string }[] = [];

beforeEach(() => {
  logs.length = 0;
  vi.spyOn(console, "log").mockImplementation((line: string) => {
    logs.push({ level: "info", line });
  });
  vi.spyOn(console, "warn").mockImplementation((line: string) => {
    logs.push({ level: "warn", line });
  });
  vi.spyOn(console, "error").mockImplementation((line: string) => {
    logs.push({ level: "error", line });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("business-metrics: émetteurs (P2.2)", () => {
  it("emitHeroBiasOnNonHeroPanel émet un event metric.hero_bias_on_non_hero_panel en warn", () => {
    emitHeroBiasOnNonHeroPanel(
      {
        dominantKind: "environment",
        panelCategory: "CHARACTER_LOCK",
        cutawayType: "environment_establishing",
        biasSource: "implicit",
      },
      { projectId: "p1", chapterId: "c1", panelId: "panel-3" },
    );
    expect(logs).toHaveLength(1);
    expect(logs[0]!.level).toBe("warn");
    const parsed = parseLogLine(logs[0]!.line);
    const event = parsed.event as BusinessMetricEvent;
    expect(event).toBe("metric.hero_bias_on_non_hero_panel");
    expect(parsed.ns).toBe("metrics");
    expect(parsed.projectId).toBe("p1");
    expect(parsed.chapterId).toBe("c1");
    expect(parsed.payload).toMatchObject({
      dominantKind: "environment",
      panelCategory: "CHARACTER_LOCK",
      cutawayType: "environment_establishing",
      biasSource: "implicit",
      panelId: "panel-3",
    });
  });

  it("emitNpcDriftDetected émet metric.npc_drift_detected en warn et inclut severity", () => {
    emitNpcDriftDetected(
      {
        npcLabel: "Guard Captain",
        npcId: "npc-gc",
        driftedFields: ["uniformColor", "helmetShape"],
        severity: "critical",
      },
      { projectId: "p1" },
    );
    const parsed = parseLogLine(logs[0]!.line);
    expect(parsed.event).toBe("metric.npc_drift_detected");
    expect(parsed.payload.severity).toBe("critical");
    expect(parsed.payload.driftedFields).toEqual(["uniformColor", "helmetShape"]);
  });

  it("emitDecorDriftDetected porte locationId + driftedMarkers", () => {
    emitDecorDriftDetected(
      {
        locationId: "loc-1",
        locationName: "Tavern Blackmoon",
        driftedMarkers: ["fireplace missing", "bar orientation flipped"],
        severity: "major",
      },
      { projectId: "p1", sceneId: "sc-3" },
    );
    const parsed = parseLogLine(logs[0]!.line);
    expect(parsed.event).toBe("metric.decor_drift_detected");
    expect(parsed.payload).toMatchObject({
      locationId: "loc-1",
      locationName: "Tavern Blackmoon",
      severity: "major",
      sceneId: "sc-3",
    });
  });

  it("emitPanelRetry émet metric.panel_retry en info avec attemptNumber", () => {
    emitPanelRetry(
      {
        panelCategory: "CHARACTER_LOCK",
        retryMode: "environment",
        retryReason: "drift_background",
        attemptNumber: 2,
      },
      { projectId: "p", panelId: "pn-1" },
    );
    expect(logs[0]!.level).toBe("info");
    const parsed = parseLogLine(logs[0]!.line);
    expect(parsed.event).toBe("metric.panel_retry");
    expect(parsed.payload.attemptNumber).toBe(2);
    expect(parsed.payload.panelId).toBe("pn-1");
  });

  it("emitNpcAiFallback tronque rawDescriptionPreview à 120 chars", () => {
    const longDesc = "x".repeat(500);
    emitNpcAiFallback(
      { reason: "invalid_schema", rawDescriptionPreview: longDesc },
      { projectId: "p" },
    );
    const parsed = parseLogLine(logs[0]!.line);
    expect(parsed.event).toBe("metric.npc_ai_fallback");
    expect((parsed.payload.rawDescriptionPreview as string).length).toBe(120);
  });

  it("emitImagePersistFailed inclut stage + provider", () => {
    emitImagePersistFailed(
      { stage: "upload", provider: "fal", detail: "network reset" },
      { projectId: "p" },
    );
    const parsed = parseLogLine(logs[0]!.line);
    expect(parsed.event).toBe("metric.image_persist_failed");
    expect(parsed.payload.stage).toBe("upload");
    expect(parsed.payload.provider).toBe("fal");
  });

  it("emitManualVisualRefNonCanonical indique hadMediaAssetId", () => {
    emitManualVisualRefNonCanonical(
      {
        characterId: "char-1",
        assetProvenance: "external_stable_url",
        hadMediaAssetId: false,
      },
      { projectId: "p", userId: "user-1" },
    );
    const parsed = parseLogLine(logs[0]!.line);
    expect(parsed.event).toBe("metric.manual_visual_ref_non_canonical");
    expect(parsed.payload.hadMediaAssetId).toBe(false);
    expect(parsed.payload.userId).toBe("user-1");
  });

  it("emitChapterStabilityScore clamp et normalise", () => {
    emitChapterStabilityScore(
      {
        score: 1.2, // > 1 → clamp à 1
        panelCount: 50,
        driftIssuesCount: -2, // < 0 → clamp à 0
        continuityIssuesCount: 3,
        retryRate: 0.4,
      },
      { projectId: "p", chapterId: "c1" },
    );
    const parsed = parseLogLine(logs[0]!.line);
    expect(parsed.event).toBe("metric.chapter_stability_score");
    expect(parsed.payload.score).toBe(1);
    expect(parsed.payload.driftIssuesCount).toBe(0);
    expect(parsed.payload.continuityIssuesCount).toBe(3);
    expect(parsed.payload.panelCount).toBe(50);
  });
});

describe("computeChapterStabilityScore (P2.2)", () => {
  it("score = 1 si aucun incident et aucun retry", () => {
    expect(
      computeChapterStabilityScore({
        panelCount: 60,
        driftIssues: [],
        continuityIssues: [],
        retryCount: 0,
      }),
    ).toEqual({ score: 1, retryRate: 0 });
  });

  it("1 critical continuity sur 50 panels abaisse significativement le score", () => {
    const { score } = computeChapterStabilityScore({
      panelCount: 50,
      driftIssues: [],
      continuityIssues: [{ severity: "critical" }],
      retryCount: 0,
    });
    // 1 critical * 1.5 / 50 = 0.03 → score ~0.97
    expect(score).toBeGreaterThan(0.9);
    expect(score).toBeLessThan(1);
  });

  it("pénalités cumulatives : drift major + continuity critical + retry élevé", () => {
    const { score, retryRate } = computeChapterStabilityScore({
      panelCount: 40,
      driftIssues: [
        { severity: "major" },
        { severity: "minor" },
      ],
      continuityIssues: [
        { severity: "critical" },
        { severity: "major" },
      ],
      retryCount: 20,
    });
    expect(retryRate).toBe(0.5);
    // drift = (0.5 + 0.2)/40 = 0.0175
    // continuity = (1*1.5 + 0.5*1.5)/40 = 0.05625
    // retryPenalty = 0.5 * 0.3 = 0.15
    // score ~ 1 - 0.22 ≈ 0.78
    expect(score).toBeGreaterThan(0.7);
    expect(score).toBeLessThan(0.85);
  });

  it("score est clampé à 0 quand les pénalités excèdent 1", () => {
    const { score } = computeChapterStabilityScore({
      panelCount: 5,
      driftIssues: new Array(5).fill({ severity: "critical" as const }),
      continuityIssues: new Array(10).fill({ severity: "critical" as const }),
      retryCount: 20,
    });
    expect(score).toBe(0);
  });

  it("panelCount=0 est traité comme 1 pour éviter NaN", () => {
    const { score } = computeChapterStabilityScore({
      panelCount: 0,
      driftIssues: [],
      continuityIssues: [],
      retryCount: 0,
    });
    expect(score).toBe(1);
  });

  it("retryRate cappé à 1 si retryCount > panelCount", () => {
    const { retryRate } = computeChapterStabilityScore({
      panelCount: 10,
      driftIssues: [],
      continuityIssues: [],
      retryCount: 999,
    });
    expect(retryRate).toBe(1);
  });
});
