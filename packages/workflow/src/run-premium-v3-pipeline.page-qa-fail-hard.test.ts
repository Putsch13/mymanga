/**
 * Test P0.4 — runPremiumV3Pipeline throw si pageQa.failCount > 0
 * avec PREMIUM_V3_ONLY=true
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { createEmptyChapterVisualMemory } from "@manga-ai-studio/ai";
import type { PanelBlueprintPremium } from "@manga-ai-studio/core";

const mocks = vi.hoisted(() => ({
  runStoryPass: vi.fn(),
  runStoryboardPass: vi.fn(),
  loadChapterVisualMemory: vi.fn(),
  runRenderPass: vi.fn(),
  runPageQaPass: vi.fn(),
  saveStoryboardPlan: vi.fn(),
}));

vi.mock("./passes/story-pass", () => ({
  runStoryPass: mocks.runStoryPass,
}));

vi.mock("./passes/storyboard-pass", () => ({
  runStoryboardPass: mocks.runStoryboardPass,
}));

vi.mock("./passes/load-chapter-visual-memory", () => ({
  loadChapterVisualMemory: mocks.loadChapterVisualMemory,
}));

vi.mock("./passes/render-pass", () => ({
  runRenderPass: mocks.runRenderPass,
}));

vi.mock("./passes/page-qa-pass", () => ({
  runPageQaPass: mocks.runPageQaPass,
}));

vi.mock("./persistence/storyboard-persistence", () => ({
  saveStoryboardPlan: mocks.saveStoryboardPlan,
}));

vi.mock("./pipeline-feature-flags", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./pipeline-feature-flags")>();
  return {
    ...actual,
    isPipelineV3RenderFalEnabled: () => true,
  };
});

function minimalBlueprint(overrides: Record<string, unknown> = {}): PanelBlueprintPremium & Record<string, unknown> {
  return {
    panelId: "panel-1",
    beatId: "beat-1",
    panelNumber: 1,
    pageNumber: 1,
    purpose: "Beat",
    shotType: "medium",
    cameraAngle: "eye_level",
    subjectFocus: "hero",
    cutawayType: "none",
    requiredProps: [],
    requiredLocationSignals: [],
    mustShowEnemy: false,
    requiredNpcCount: 0,
    heroCenterAllowed: true,
    criticality: "medium",
    ...overrides,
  } as unknown as PanelBlueprintPremium & Record<string, unknown>;
}

describe("runPremiumV3Pipeline — page QA fail-hard (P0.4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.loadChapterVisualMemory.mockImplementation(async ({ chapterId }: { chapterId: string }) => ({
      memory: createEmptyChapterVisualMemory(chapterId),
      warnings: [],
      stats: {
        charactersLoaded: 0,
        charactersMissingFaceRef: 0,
        environmentsLoaded: 0,
        styleRefsLoaded: 0,
      },
    }));

    mocks.saveStoryboardPlan.mockResolvedValue(undefined);
  });

  it("throw si pageQa.failCount > 0 et premiumV3OnlyEnabled=true", async () => {
    mocks.runPageQaPass.mockResolvedValue({
      results: [
        { pageNumber: 1, ok: true, issues: [], warnings: [] },
        { pageNumber: 2, ok: false, issues: ["page_panel_count_exceeds_layout_capacity=17/6:grid_2x3"], warnings: [] },
      ],
      okCount: 1,
      failCount: 1,
    });

    const { runPremiumV3Pipeline } = await import("./run-premium-v3-pipeline");

    await expect(
      runPremiumV3Pipeline({
        chapterId: "ch-1",
        projectId: "proj-1",
        chapterNumber: 1,
        chapterTitle: "T",
        chapterSummary: "S",
        chapterUserIntent: null,
        project: { format: "manga" },
        stylePacks: [],
        rawCharacters: [{ id: "hero-1", name: "Hero", roleType: "main" }],
        approvedOutline: null,
        productionPlan: {
          panelBlueprints: [minimalBlueprint()],
          pages: [{ pageNumber: 1, panelCount: 1, beatIds: ["beat-1"] }],
        },
        heroCharacterId: "hero-1",
        focusCharacterIds: ["hero-1"],
        pipelineV3Enabled: true,
        premiumV3OnlyEnabled: true,
        chapterLocationName: "Dojo",
      }),
    ).rejects.toThrow(/premium_v3_only_page_qa_failed/);

    expect(mocks.runRenderPass).not.toHaveBeenCalled();
  });

  it("continue si pageQa.failCount > 0 mais premiumV3OnlyEnabled=false", async () => {
    mocks.runPageQaPass.mockResolvedValue({
      results: [
        { pageNumber: 1, ok: false, issues: ["page_has_no_panels"], warnings: [] },
      ],
      okCount: 0,
      failCount: 1,
    });

    mocks.runRenderPass.mockResolvedValue({
      summary: {
        chapterId: "ch-1",
        totalPanels: 1,
        renderedCount: 0,
        failedCount: 0,
        skippedCount: 1,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        warnings: [],
        errors: [],
      },
      specs: [],
      rendered: [],
      panelQa: { okCount: 1, failCount: 0, results: [] },
      pageQa: { okCount: 0, failCount: 1, results: [] },
    });

    const { runPremiumV3Pipeline } = await import("./run-premium-v3-pipeline");

    await expect(
      runPremiumV3Pipeline({
        chapterId: "ch-1",
        projectId: "proj-1",
        chapterNumber: 1,
        chapterTitle: "T",
        chapterSummary: "S",
        chapterUserIntent: null,
        project: { format: "manga" },
        stylePacks: [],
        rawCharacters: [{ id: "hero-1", name: "Hero", roleType: "main" }],
        approvedOutline: null,
        productionPlan: {
          panelBlueprints: [minimalBlueprint()],
          pages: [{ pageNumber: 1, panelCount: 1, beatIds: ["beat-1"] }],
        },
        heroCharacterId: "hero-1",
        focusCharacterIds: ["hero-1"],
        pipelineV3Enabled: true,
        premiumV3OnlyEnabled: false,
        chapterLocationName: "Dojo",
      }),
    ).resolves.toBeDefined();

    expect(mocks.runRenderPass).toHaveBeenCalled();
  });
});
