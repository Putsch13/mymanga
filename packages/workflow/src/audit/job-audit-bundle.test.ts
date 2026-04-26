import { describe, expect, it } from "vitest";
import {
  createAuditBundle,
  addQaResultToBundle,
  addErrorToBundle,
  serializeAuditBundle,
  formatAuditBundleSummary,
  computeBundleStats,
  type JobAuditMeta,
} from "./job-audit-bundle";

describe("job-audit-bundle", () => {
  const baseMeta: JobAuditMeta = {
    jobId: "job-123",
    chapterId: "ch-01",
    projectId: "proj-01",
    startedAt: "2026-04-25T12:00:00Z",
    pipelineVersion: "3.0.0",
    premiumMode: true,
  };

  describe("createAuditBundle", () => {
    it("creates bundle with meta and empty collections", () => {
      const bundle = createAuditBundle(baseMeta);

      expect(bundle.meta.jobId).toBe("job-123");
      expect(bundle.qaResults).toEqual([]);
      expect(bundle.errorLog).toEqual([]);
      expect(bundle.timings).toEqual({});
    });
  });

  describe("addQaResultToBundle", () => {
    it("adds QA result to bundle", () => {
      const bundle = createAuditBundle(baseMeta);
      addQaResultToBundle(bundle, {
        passName: "beat-coverage",
        ok: true,
        errorCount: 0,
        warningCount: 2,
        issues: [],
      });

      expect(bundle.qaResults).toHaveLength(1);
      expect(bundle.qaResults![0].passName).toBe("beat-coverage");
    });
  });

  describe("addErrorToBundle", () => {
    it("adds error to log with timestamp", () => {
      const bundle = createAuditBundle(baseMeta);
      addErrorToBundle(bundle, {
        code: "E_TEST_ERROR",
        message: "Test error message",
        context: { panelId: "p1" },
      });

      expect(bundle.errorLog).toHaveLength(1);
      expect(bundle.errorLog![0].code).toBe("E_TEST_ERROR");
      expect(bundle.errorLog![0].timestamp).toBeDefined();
    });
  });

  describe("serializeAuditBundle", () => {
    it("serializes bundle to map of JSON files", () => {
      const bundle = createAuditBundle(baseMeta);
      bundle.castContract = {
        chapterId: "ch-01",
        heroCharacterId: "marius",
        activeCharacterIds: ["marius"],
        supportCharacterIds: [],
        antagonistCharacterIds: [],
        npcGroups: [],
        members: [],
      };
      bundle.timings = { storyboard_ms: 1000, render_ms: 5000 };

      const files = serializeAuditBundle(bundle);

      // P9.24 — Nouveaux noms de fichiers numérotés
      expect(files.has("01_job_meta.json")).toBe(true);
      expect(files.has("05_cast_contract.json")).toBe(true);
      expect(files.has("timings.json")).toBe(true);
      expect(files.size).toBeGreaterThanOrEqual(3);
    });

    it("excludes null/empty sections", () => {
      const bundle = createAuditBundle(baseMeta);
      const files = serializeAuditBundle(bundle);

      // P9.24 — Nouveaux noms de fichiers numérotés
      expect(files.has("01_job_meta.json")).toBe(true);
      expect(files.has("05_cast_contract.json")).toBe(false);
      expect(files.has("12_storyboard_plan.json")).toBe(false);
    });
  });

  describe("formatAuditBundleSummary", () => {
    it("formats summary for logging", () => {
      const bundle = createAuditBundle(baseMeta);
      addQaResultToBundle(bundle, {
        passName: "test",
        ok: true,
        errorCount: 0,
        warningCount: 0,
        issues: [],
      });

      const summary = formatAuditBundleSummary(bundle);

      expect(summary).toContain("[audit-bundle]");
      expect(summary).toContain("job=job-123");
      expect(summary).toContain("qa_ok=true");
    });
  });

  describe("computeBundleStats", () => {
    it("computes statistics from bundle", () => {
      const bundle = createAuditBundle(baseMeta);
      addQaResultToBundle(bundle, {
        passName: "pass1",
        ok: true,
        errorCount: 0,
        warningCount: 2,
        issues: [],
      });
      addQaResultToBundle(bundle, {
        passName: "pass2",
        ok: false,
        errorCount: 3,
        warningCount: 1,
        issues: [],
      });
      bundle.timings = { phase1: 100, phase2: 200 };

      const stats = computeBundleStats(bundle);

      expect(stats.totalQaPasses).toBe(2);
      expect(stats.passedQaPasses).toBe(1);
      expect(stats.failedQaPasses).toBe(1);
      expect(stats.totalErrors).toBe(3);
      expect(stats.totalWarnings).toBe(3);
      expect(stats.totalTimeMs).toBe(300);
    });
  });
});
