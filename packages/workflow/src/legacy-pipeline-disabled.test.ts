/**
 * P0.5 — Test que le legacy pipeline est désactivé par défaut.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { isLegacyPipelineEnabled } from "./pipeline-feature-flags";

describe("P0.5 — Legacy pipeline isolation", () => {
  const originalEnv = process.env.ENABLE_LEGACY_PIPELINE;

  beforeEach(() => {
    delete process.env.ENABLE_LEGACY_PIPELINE;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.ENABLE_LEGACY_PIPELINE = originalEnv;
    } else {
      delete process.env.ENABLE_LEGACY_PIPELINE;
    }
  });

  it("isLegacyPipelineEnabled retourne false par défaut", () => {
    expect(isLegacyPipelineEnabled()).toBe(false);
  });

  it("isLegacyPipelineEnabled retourne true si ENABLE_LEGACY_PIPELINE=true", () => {
    process.env.ENABLE_LEGACY_PIPELINE = "true";
    expect(isLegacyPipelineEnabled()).toBe(true);
  });

  it("isLegacyPipelineEnabled retourne false si ENABLE_LEGACY_PIPELINE=false", () => {
    process.env.ENABLE_LEGACY_PIPELINE = "false";
    expect(isLegacyPipelineEnabled()).toBe(false);
  });

  it("runLegacyCompatibleChapterPipeline throw LegacyPipelineDisabledError quand legacy désactivé", async () => {
    process.env.ENABLE_LEGACY_PIPELINE = "false";

    const { runLegacyCompatibleChapterPipeline, LegacyPipelineDisabledError } =
      await import("./legacy/run-legacy-compatible-chapter-pipeline");

    await expect(
      runLegacyCompatibleChapterPipeline({
        jobId: "job-1",
        chapterId: "ch-1",
        projectId: "proj-1",
        chapterNumber: 1,
        pipelineVersion: "v2",
        chapter: {},
        project: {},
        job: {},
        stylePacks: [],
        loraAttachments: [],
        rawCharacters: [],
        npcProfiles: [],
        propInventory: [],
        npcProfileByCharacterId: new Map(),
        intensityLayer: "TEEN",
        effectiveCreativeControls: {},
        enrichedIntent: "test",
        selectedPlotLabel: undefined,
        focusCharacterIds: [],
        jobInput: {},
      }),
    ).rejects.toThrow(LegacyPipelineDisabledError);
  }, 10000);
});
