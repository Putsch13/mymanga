/**
 * Test P0.4 — runPremiumV3Pipeline throw si pageQa.failCount > 0
 * avec PREMIUM_V3_ONLY=true
 *
 * Note: Avec le pipeline strict (StoryContractCompletenessQa, CanonicalPlanQa),
 * le pipeline peut échouer AVANT d'atteindre la PageQA si les données sont
 * insuffisantes. Ces tests vérifient le comportement en mode non-strict.
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

vi.mock("./passes/assert-premium-ai-engines-ready", () => ({
  assertPremiumAiEnginesReady: vi.fn(),
  assertDialogueResultNotFallback: vi.fn(),
  assertStoryArchitectResultNotFallback: vi.fn(),
  assertMangaEditorResultNotFallback: vi.fn(),
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

vi.mock("./persistence/chapter-visual-contract-persistence", () => ({
  loadChapterVisualContractUi: vi.fn().mockResolvedValue({ parasitePolicy: "auto_strip" }),
  saveChapterVisualContractSnapshot: vi.fn().mockResolvedValue(undefined),
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

  it(
    "throw en mode strict si validation échoue",
    async () => {
    const { runPremiumV3Pipeline } = await import("./run-premium-v3-pipeline");

    await expect(
      runPremiumV3Pipeline({
        chapterId: "ch-1",
        projectId: "proj-1",
        chapterNumber: 1,
        chapterTitle: "T",
        chapterSummary: "Hero arrives at the old dojo for training.",
        chapterUserIntent: null,
        project: { format: "manga" },
        stylePacks: [],
        rawCharacters: [
          {
            id: "hero-1",
            name: "Hero",
            roleType: "main",
            faceRefUrl: "https://cdn.test/face.png",
            loraUrl: "https://cdn.test/lora.safetensors",
          },
        ],
        approvedOutline: null,
        productionPlan: {
          panelBlueprints: [minimalBlueprint()],
          pages: [{ pageNumber: 1, panelCount: 1, beatIds: ["beat-1"] }],
          productionOutline: {
            chapterGoal: "Test chapter",
            cliffhanger: "None",
            beats: [{
              beatId: "beat-1",
              summary: "Hero enters dojo",
              whyThisBeatExists: "Setup",
              narrativeFunction: "introduction",
              dramaticChange: "Hero arrives",
            }],
          },
        },
        heroCharacterId: "hero-1",
        focusCharacterIds: ["hero-1"],
        locations: [{ id: "loc-1", name: "Old Dojo", visualDNA: { description: "Traditional Japanese dojo with wooden floors and sliding doors" } }],
        pipelineV3Enabled: true,
        premiumV3OnlyEnabled: true,
        chapterLocationName: "Old Dojo",
      }),
    ).rejects.toThrow(/premium_v3_only_failed/);

    expect(mocks.runRenderPass).not.toHaveBeenCalled();
    },
    20_000,
  );

  it(
    "continue si pageQa.failCount > 0 mais premiumV3OnlyEnabled=false",
    async () => {
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
      pageQa: { okCount: 0, failCount: 1, results: [] },
    });

    const { runPremiumV3Pipeline } = await import("./run-premium-v3-pipeline");

    await expect(
      runPremiumV3Pipeline({
        chapterId: "ch-1",
        projectId: "proj-1",
        chapterNumber: 1,
        chapterTitle: "T",
        chapterSummary: "Hero arrives at the old dojo for training.",
        chapterUserIntent: null,
        project: { format: "manga" },
        stylePacks: [],
        rawCharacters: [
          {
            id: "hero-1",
            name: "Hero",
            roleType: "main",
            faceRefUrl: "https://cdn.test/face.png",
            loraUrl: "https://cdn.test/lora.safetensors",
          },
        ],
        approvedOutline: null,
        productionPlan: {
          panelBlueprints: [minimalBlueprint()],
          pages: [{ pageNumber: 1, panelCount: 1, beatIds: ["beat-1"] }],
          productionOutline: {
            chapterGoal: "Test chapter",
            cliffhanger: "None",
            beats: [{
              beatId: "beat-1",
              summary: "Hero enters dojo",
              whyThisBeatExists: "Setup",
              narrativeFunction: "introduction",
              dramaticChange: "Hero arrives",
            }],
          },
        },
        heroCharacterId: "hero-1",
        focusCharacterIds: ["hero-1"],
        locations: [{ id: "loc-1", name: "Old Dojo", visualDNA: { description: "Traditional Japanese dojo with wooden floors and sliding doors" } }],
        pipelineV3Enabled: true,
        premiumV3OnlyEnabled: false,
        chapterLocationName: "Old Dojo",
      }),
    ).resolves.toBeDefined();

    expect(mocks.runRenderPass).toHaveBeenCalled();
    },
    20_000,
  );
});
