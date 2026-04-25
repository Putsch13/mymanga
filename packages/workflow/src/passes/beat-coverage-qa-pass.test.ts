import { describe, expect, it } from "vitest";
import { runBeatCoverageQaPass, formatBeatCoverageQaLog } from "./beat-coverage-qa-pass";
import { PIPELINE_ERROR_CODES } from "@manga-ai-studio/core";

describe("beat-coverage-qa-pass", () => {
  const fullyCoveredPanels = [
    { panelId: "p1", sourceBeatId: "beat-1" },
    { panelId: "p2", sourceBeatId: "beat-1" },
    { panelId: "p3", sourceBeatId: "beat-2" },
    { panelId: "p4", sourceBeatId: "beat-3" },
  ];

  const partiallyMissingPanels = [
    { panelId: "p1", sourceBeatId: "beat-1" },
    { panelId: "p2", sourceBeatId: "beat-2" },
  ];

  describe("runBeatCoverageQaPass", () => {
    it("passes when all beats are covered", () => {
      const result = runBeatCoverageQaPass({
        expectedBeatIds: ["beat-1", "beat-2", "beat-3"],
        panels: fullyCoveredPanels,
      });

      expect(result.ok).toBe(true);
      expect(result.stats.coveragePercent).toBe(100);
      expect(result.stats.uncoveredBeats).toBe(0);
    });

    it("fails in strict mode when beats are uncovered", () => {
      const result = runBeatCoverageQaPass({
        expectedBeatIds: ["beat-1", "beat-2", "beat-3"],
        panels: partiallyMissingPanels,
        strictMode: true,
      });

      expect(result.ok).toBe(false);
      expect(result.stats.uncoveredBeats).toBe(1);
      expect(result.issues.some((i) => i.beatId === "beat-3")).toBe(true);
      expect(
        result.issues.some((i) => i.code === PIPELINE_ERROR_CODES.E_STORY_BEAT_NOT_COVERED),
      ).toBe(true);
    });

    it("warns instead of failing in non-strict mode", () => {
      const result = runBeatCoverageQaPass({
        expectedBeatIds: ["beat-1", "beat-2", "beat-3"],
        panels: partiallyMissingPanels,
        strictMode: false,
      });

      expect(result.ok).toBe(true);
      expect(result.warningCount).toBe(1);
      expect(result.errorCount).toBe(0);
    });

    it("tracks panels per beat", () => {
      const result = runBeatCoverageQaPass({
        expectedBeatIds: ["beat-1", "beat-2", "beat-3"],
        panels: fullyCoveredPanels,
      });

      expect(result.stats.panelsPerBeat["beat-1"]).toBe(2);
      expect(result.stats.panelsPerBeat["beat-2"]).toBe(1);
      expect(result.stats.panelsPerBeat["beat-3"]).toBe(1);
    });

    it("handles empty expected beats", () => {
      const result = runBeatCoverageQaPass({
        expectedBeatIds: [],
        panels: fullyCoveredPanels,
      });

      expect(result.ok).toBe(true);
      expect(result.stats.coveragePercent).toBe(100);
    });

    it("handles panels with beatId instead of sourceBeatId", () => {
      const panels = [
        { panelId: "p1", beatId: "beat-1" },
        { panelId: "p2", beatId: "beat-2" },
      ];
      const result = runBeatCoverageQaPass({
        expectedBeatIds: ["beat-1", "beat-2"],
        panels,
      });

      expect(result.ok).toBe(true);
      expect(result.stats.coveredBeats).toBe(2);
    });
  });

  describe("formatBeatCoverageQaLog", () => {
    it("formats OK result", () => {
      const result = runBeatCoverageQaPass({
        expectedBeatIds: ["beat-1", "beat-2"],
        panels: [
          { panelId: "p1", sourceBeatId: "beat-1" },
          { panelId: "p2", sourceBeatId: "beat-2" },
        ],
      });
      const log = formatBeatCoverageQaLog(result);

      expect(log).toContain("[beat-coverage-qa] ok");
      expect(log).toContain("coverage=100%");
    });

    it("formats error result with uncovered beats", () => {
      const result = runBeatCoverageQaPass({
        expectedBeatIds: ["beat-1", "beat-2", "beat-3"],
        panels: [{ panelId: "p1", sourceBeatId: "beat-1" }],
        strictMode: true,
      });
      const log = formatBeatCoverageQaLog(result);

      expect(log).toContain("[beat-coverage-qa]");
      expect(log).toContain("errors=2");
      expect(log).toContain("uncovered=2");
    });
  });
});
