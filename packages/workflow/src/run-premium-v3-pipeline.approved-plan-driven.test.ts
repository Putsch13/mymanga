import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createEmptyChapterVisualMemory } from "@manga-ai-studio/ai";
import type { PanelBlueprintPremium } from "@manga-ai-studio/core";
import { PREMIUM_PANEL_RANGE } from "@manga-ai-studio/core";
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

vi.mock("./persistence/storyboard-persistence", () => ({
  saveStoryboardPlan: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./persistence/chapter-visual-contract-persistence", () => ({
  loadChapterVisualContractUi: vi.fn().mockResolvedValue({ parasitePolicy: "auto_strip" }),
  saveChapterVisualContractSnapshot: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./passes/pre-render-premium-qa", () => ({
  runPreRenderPremiumQaOrThrow: vi.fn(),
}));

function productionOutlineForCanonicalRuntime() {
  return {
    source: "estimated" as const,
    chapterGoal: "Test arc for approved_plan_driven canonical runtime",
    cliffhanger: "",
    beats: Array.from({ length: 10 }, (_, i) => ({
      beatId: `beat-${i + 1}`,
      summary: `Beat ${i + 1} summary for canonical pipeline.`,
      narrativeFunction: "escalation",
      whyThisBeatExists: `Why ${i + 1}`,
      dramaticChange: "turn",
      involvedCharacters: ["hero-1"],
      activeCanonConstraints: [],
      environmentContext: ["dojo"],
      visualPriority: "high" as const,
      estimatedPanels: 4,
      criticality: "medium" as const,
      continuityDependencies: [],
      infoGained: null,
      emotionProduced: null,
      indispensabilityScore: 72,
      redundancyRisk: 18,
    })),
  };
}

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let buildApprovedPlanSpy: any;

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
        visualQaFailedCount: 0,
        manualReviewRequiredCount: 0,
        passedAfterRetryCount: 0,
        visualQaPassedCount: 0,
        v3RenderQualityStatus: "passed" as const,
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

  it(
    "n’appelle pas runStoryPass ni runStoryboardPass quand productionPlan.panelBlueprints est rempli",
    async () => {
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
          productionOutline: productionOutlineForCanonicalRuntime(),
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
      const callArg = buildApprovedPlanSpy.mock.calls[0]![0] as {
        chapterId: string;
        productionPlan: { panelBlueprints: PanelBlueprintPremium[] };
      };
      expect(callArg.chapterId).toBe("ch-1");
      expect(callArg.productionPlan.panelBlueprints.length).toBeGreaterThanOrEqual(PREMIUM_PANEL_RANGE.min);
      expect(callArg.productionPlan.panelBlueprints.length).toBeLessThanOrEqual(PREMIUM_PANEL_RANGE.max);
      expect(mocks.runRenderPass).toHaveBeenCalled();
      const renderArg = mocks.runRenderPass.mock.calls[0]![0] as { storyboardPlan: { pages: { panels: unknown[] }[] } };
      const allPanels = renderArg.storyboardPlan.pages.flatMap((p) => p.panels);
      expect(allPanels.length).toBeGreaterThanOrEqual(PREMIUM_PANEL_RANGE.min);
      expect(allPanels[0]).toMatchObject({
        sourceBeatId: expect.stringMatching(/^beat-/),
      });
    },
    20_000,
  );
});
