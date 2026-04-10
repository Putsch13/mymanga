import { describe, expect, it } from "vitest";
import {
  buildPersistedChapterRuntimeState,
  buildRuntimeDebugSummary,
  buildGenerationRunSummary,
  computeChapterQualityReport,
  resolvePersistedChapterStatus,
} from "./chapter-runtime-helpers";

describe("workflow chapter runtime helpers", () => {
  it("bloque le release si un panel critique n'a pas de QA visuelle", () => {
    const report = computeChapterQualityReport(
      [
        {
          consistencyScore: 0.91,
          metadata: {
            validationDetails: {
              panelCriticality: { level: "CRITICAL", reasons: ["hero_closeup"] },
              qaWasRequired: true,
              qaWasExecuted: false,
              qaFailureReason: "visual_analyzer_unavailable_for_critical_panel",
              qualityScores: { releaseScore: 0.91 },
              issues: [],
            },
          },
        },
        ...Array.from({ length: 54 }, () => ({
          consistencyScore: 0.92,
          metadata: {
            validationDetails: {
              panelCriticality: { level: "NON_CRITICAL", reasons: [] },
              qaWasRequired: false,
              qaWasExecuted: false,
              qualityScores: { releaseScore: 0.92 },
              issues: [],
            },
          },
        })),
      ],
      { minimumAcceptedImages: 55, releaseThreshold: 0.72 },
    );

    expect(report.criticalPanelsBlocked).toBe(1);
    expect(report.premiumReleaseAccepted).toBe(false);
    expect(resolvePersistedChapterStatus({ generatedCount: 55, qualityReport: report })).toBe("review_required");
  });

  it("trace les compteurs critiques dans le generationRunSummary", () => {
    const report = computeChapterQualityReport(
      Array.from({ length: 55 }, () => ({
        consistencyScore: 0.9,
        metadata: {
          validationDetails: {
            panelCriticality: { level: "CRITICAL", reasons: ["major_reveal"] },
            qaWasRequired: true,
            qaWasExecuted: true,
            qualityScores: { releaseScore: 0.9 },
            issues: [],
          },
        },
      })),
      { minimumAcceptedImages: 55, releaseThreshold: 0.72 },
    );

    const summary = buildGenerationRunSummary({
      chapterId: "ch-1",
      chapterNumber: 12,
      jobId: "job-1",
      totalPlannedImages: 55,
      generatedCount: 55,
      failedCount: 0,
      qualityReport: report,
    });

    expect(summary.criticalPanelsCount).toBe(55);
    expect(summary.criticalPanelsWithVisualQA).toBe(55);
    expect(summary.imageStats.minimumAcceptedImages).toBe(55);
  });

  it("prépare un état runtime structuré persistant pour le pipeline", () => {
    const report = computeChapterQualityReport(
      Array.from({ length: 55 }, () => ({
        consistencyScore: 0.88,
        metadata: {
          validationDetails: {
            panelCriticality: { level: "CRITICAL", reasons: ["hero_closeup"] },
            qaWasRequired: true,
            qaWasExecuted: true,
            qualityScores: { releaseScore: 0.88 },
            issues: [],
          },
        },
      })),
      { minimumAcceptedImages: 55, releaseThreshold: 0.72 },
    );

    const state = buildPersistedChapterRuntimeState({
      studioSnapshot: {
        status: "GENERATING",
        currentStep: "production_plan",
        updatedAt: "2026-04-10T10:00:00.000Z",
        autosaveVersion: 3,
        data: {},
        history: [],
      },
      chapterId: "ch-1",
      chapterNumber: 12,
      jobId: "job-1",
      totalPlannedImages: 55,
      generatedCount: 55,
      failedCount: 0,
      qualityReport: report,
    });

    expect(state.persistedChapterStatus).toBe("published");
    expect(state.structuredRuntimeFields?.acceptedImages).toBe(55);
    expect(state.structuredRuntimeFields?.missingImages).toBe(0);
    expect(state.structuredRuntimeFields?.criticalPanelsBlocked).toBe(0);
  });

  it("assemble un debug summary uniforme avec source runtime", () => {
    const report = computeChapterQualityReport([], { minimumAcceptedImages: 55, releaseThreshold: 0.72 });
    const summary = buildGenerationRunSummary({
      chapterId: "ch-1",
      chapterNumber: 12,
      jobId: "job-1",
      totalPlannedImages: 0,
      generatedCount: 0,
      failedCount: 0,
      qualityReport: report,
    });
    const debugSummary = buildRuntimeDebugSummary({
      generationRunSummary: summary,
      productionSource: {
        source: "studio",
        fallbackUsed: false,
        legacyBridgeUsed: false,
      },
    });

    expect(debugSummary.outlineSource).toBe("studio");
    expect(debugSummary.fallbackUsed).toBe(false);
    expect(debugSummary.legacyBridgeUsed).toBe(false);
  });
});

