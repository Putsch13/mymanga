import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createEmptyChapterVisualMemory } from "@manga-ai-studio/ai";
import type { PanelBlueprintPremium } from "@manga-ai-studio/core";
import * as approvedProductionPlan from "./build-storyboard-plan-from-approved-production-plan";

const mocks = vi.hoisted(() => ({
  runStoryPass: vi.fn(),
  runStoryboardPass: vi.fn(),
  loadChapterVisualMemory: vi.fn(),
  runRenderPass: vi.fn(),
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

vi.mock("./pipeline-feature-flags", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./pipeline-feature-flags")>();
  return {
    ...actual,
    isPipelineV3RenderFalEnabled: () => false,
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

describe("runPremiumV3Pipeline — approved_plan_driven", () => {
  let buildApprovedPlanSpy: ReturnType<
    typeof vi.spyOn<typeof approvedProductionPlan, "buildStoryboardPlanFromApprovedProductionPlan">
  >;

  beforeEach(() => {
    vi.clearAllMocks();
    buildApprovedPlanSpy = vi.spyOn(
      approvedProductionPlan,
      "buildStoryboardPlanFromApprovedProductionPlan",
    );
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
      pageQa: { okCount: 1, failCount: 0, results: [] },
    });
  });

  afterEach(() => {
    buildApprovedPlanSpy.mockRestore();
  });

  it("n’appelle pas runStoryPass ni runStoryboardPass quand productionPlan.panelBlueprints est rempli", async () => {
    const { runPremiumV3Pipeline } = await import("./run-premium-v3-pipeline");

    await runPremiumV3Pipeline({
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
    });

    expect(mocks.runStoryPass).not.toHaveBeenCalled();
    expect(mocks.runStoryboardPass).not.toHaveBeenCalled();
    expect(buildApprovedPlanSpy).toHaveBeenCalledTimes(1);
    expect(buildApprovedPlanSpy.mock.calls[0]![0]).toMatchObject({
      chapterId: "ch-1",
      productionPlan: { panelBlueprints: [expect.objectContaining({ panelId: "panel-1" })] },
    });
    expect(mocks.runRenderPass).toHaveBeenCalled();
    const renderArg = mocks.runRenderPass.mock.calls[0]![0] as { storyboardPlan: { pages: { panels: unknown[] }[] } };
    expect(renderArg.storyboardPlan.pages[0]?.panels).toHaveLength(1);
    expect(renderArg.storyboardPlan.pages[0]?.panels[0]).toMatchObject({
      panelId: "panel-1",
      sourceBeatId: "beat-1",
    });
  });
});
