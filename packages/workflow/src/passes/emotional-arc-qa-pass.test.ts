import { describe, expect, it } from "vitest";
import { runEmotionalArcQaPass, formatEmotionalArcQaLog } from "./emotional-arc-qa-pass";

describe("emotional-arc-qa-pass", () => {
  const expectedArc = [
    { stepId: "arrival", label: "arrivée", intensity: 30, beatIds: ["beat-1"] },
    { stepId: "nostalgia", label: "nostalgie", intensity: 50, beatIds: ["beat-2"] },
    { stepId: "reunion", label: "retrouvailles", intensity: 80, beatIds: ["beat-3"] },
  ];

  describe("runEmotionalArcQaPass", () => {
    it("passes when all steps are covered with smooth transitions", () => {
      const panels = [
        { panelId: "p1", beatId: "beat-1", intensity: 30 },
        { panelId: "p2", beatId: "beat-1", intensity: 35 },
        { panelId: "p3", beatId: "beat-2", intensity: 50 },
        { panelId: "p4", beatId: "beat-3", intensity: 75 },
      ];

      const result = runEmotionalArcQaPass({
        expectedArc,
        panels,
      });

      expect(result.ok).toBe(true);
      expect(result.stats.coveredSteps).toBe(3);
      expect(result.stats.intensityJumps).toBe(0);
    });

    it("warns on intensity jumps exceeding threshold", () => {
      const panels = [
        { panelId: "p1", beatId: "beat-1", intensity: 20 },
        { panelId: "p2", beatId: "beat-2", intensity: 80 },
      ];

      const result = runEmotionalArcQaPass({
        expectedArc,
        panels,
        maxIntensityJump: 40,
      });

      expect(result.stats.intensityJumps).toBe(1);
      expect(result.warningCount).toBeGreaterThan(0);
    });

    it("errors in strict mode on intensity jumps", () => {
      const panels = [
        { panelId: "p1", beatId: "beat-1", intensity: 20 },
        { panelId: "p2", beatId: "beat-2", intensity: 90 },
      ];

      const result = runEmotionalArcQaPass({
        expectedArc,
        panels,
        maxIntensityJump: 40,
        strictMode: true,
      });

      expect(result.ok).toBe(false);
      expect(result.errorCount).toBeGreaterThan(0);
    });

    it("warns on uncovered emotional steps", () => {
      const panels = [
        { panelId: "p1", beatId: "beat-1", intensity: 30 },
      ];

      const result = runEmotionalArcQaPass({
        expectedArc,
        panels,
      });

      expect(result.stats.uncoveredSteps).toBe(2);
      expect(result.warningCount).toBeGreaterThan(0);
    });

    it("detects intensity from emotion text", () => {
      const panels = [
        { panelId: "p1", beatId: "beat-1", emotionLine: "calm peaceful moment" },
        { panelId: "p2", beatId: "beat-2", emotionLine: "tension builds" },
        { panelId: "p3", beatId: "beat-3", emotionLine: "rage and fury explode" },
      ];

      const result = runEmotionalArcQaPass({
        expectedArc,
        panels,
      });

      expect(result.stats.avgIntensity).toBeGreaterThan(40);
    });

    it("handles empty arc gracefully", () => {
      const result = runEmotionalArcQaPass({
        expectedArc: [],
        panels: [{ panelId: "p1", intensity: 50 }],
      });

      expect(result.ok).toBe(true);
      expect(result.stats.expectedSteps).toBe(0);
    });
  });

  describe("formatEmotionalArcQaLog", () => {
    it("formats OK result", () => {
      const result = runEmotionalArcQaPass({
        expectedArc,
        panels: [
          { panelId: "p1", beatId: "beat-1", intensity: 30 },
          { panelId: "p2", beatId: "beat-2", intensity: 50 },
          { panelId: "p3", beatId: "beat-3", intensity: 80 },
        ],
      });
      const log = formatEmotionalArcQaLog(result);

      expect(log).toContain("[emotional-arc-qa] ok");
      expect(log).toContain("steps=3/3");
    });

    it("formats warning result", () => {
      const result = runEmotionalArcQaPass({
        expectedArc,
        panels: [{ panelId: "p1", beatId: "beat-1", intensity: 30 }],
      });
      const log = formatEmotionalArcQaLog(result);

      expect(log).toContain("[emotional-arc-qa]");
      expect(log).toContain("uncovered=2");
    });
  });
});
