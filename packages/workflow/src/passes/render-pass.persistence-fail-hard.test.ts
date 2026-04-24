/**
 * P0.2 — Test que la persistance V3 est fail-hard.
 * Un job ne peut être completed que si toutes les images attendues
 * sont persistées durablement en DB.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  createDefaultChapterStyleBible,
  createEmptyChapterVisualMemory,
  addCharacterEntry,
} from "@manga-ai-studio/ai";
import type {
  StoryboardPanel,
  StoryboardPage,
  StoryboardPlan,
} from "@manga-ai-studio/ai/contracts";
import { runRenderPass, V3ImagePersistenceError } from "./render-pass";

const mocks = vi.hoisted(() => ({
  saveRenderPassResult: vi.fn().mockResolvedValue(undefined),
  persistV3RenderedPanels: vi.fn(),
  startChapterImageGenerationRun: vi.fn().mockResolvedValue({ runId: "test-run-id", deletedCount: 0 }),
}));

vi.mock("../persistence/render-persistence", () => ({
  saveRenderPassResult: mocks.saveRenderPassResult,
}));

vi.mock("../persistence/v3-scene-image-persistence", () => ({
  persistV3RenderedPanels: mocks.persistV3RenderedPanels,
}));

vi.mock("../persistence/chapter-generation-run", () => ({
  startChapterImageGenerationRun: mocks.startChapterImageGenerationRun,
}));

function makePanel(overrides: Partial<StoryboardPanel> = {}): StoryboardPanel {
  return {
    panelId: overrides.panelId ?? "p1",
    pageNumber: 1,
    panelNumberInPage: 1,
    globalPanelIndex: 0,
    sourceBeatId: "b1",
    panelPurpose: "hero_focus",
    renderMode: "hero_closeup",
    shotType: "closeup",
    cameraAngle: "eye_level",
    subjectFocus: "hero",
    cutawayType: "none",
    characters: ["hero-1"],
    locationId: null,
    locationName: "Street",
    actionLine: "Hero stares forward",
    emotionLine: "determined",
    dialogue: [],
    narration: null,
    sfx: [],
    mustShow: [],
    mustNotShow: [],
    continuityNotes: [],
    visualAnchors: { characterIds: ["hero-1"], environmentAnchorId: null, previousPanelAnchorId: null },
    ...overrides,
  };
}

function makePlan(panels: StoryboardPanel[]): StoryboardPlan {
  const page: StoryboardPage = {
    pageNumber: 1,
    layoutTemplate: "grid_2x2",
    dramaticRole: "setup",
    beatIds: ["b1"],
    panels,
  };
  return {
    chapterId: "ch-1",
    totalTargetPanels: panels.length,
    pages: [page],
    editorialDiagnostics: {
      varietyScore: 1,
      heroFocusRatio: 1,
      environmentRatio: 0,
      insertRatio: 0,
      reactionRatio: 0,
      warnings: [],
      blockers: [],
    },
  };
}

function makeMemoryWithHero() {
  const memory = createEmptyChapterVisualMemory("ch-1");
  addCharacterEntry(memory, {
    characterId: "hero-1",
    name: "Hero",
    role: "hero",
    faceRefUrl: "https://ref/hero-face.png",
    silhouetteRefUrl: "https://ref/hero-body.png",
    outfitRefUrl: "https://ref/hero-outfit.png",
    defaultWeight: 1,
  });
  return memory;
}

describe("render-pass.persistence-fail-hard (P0.2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("échoue (V3ImagePersistenceError) quand persistV3RenderedPanels throw", async () => {
    const plan = makePlan([makePanel({ panelId: "p1" })]);

    mocks.persistV3RenderedPanels.mockRejectedValueOnce(
      new Error("Database connection failed"),
    );

    await expect(
      runRenderPass({
        chapterId: "ch-1",
        storyboardPlan: plan,
        styleBible: createDefaultChapterStyleBible(),
        visualMemory: makeMemoryWithHero(),
        characters: [{ id: "hero-1", name: "Hero", roleType: "main" }],
        mainCharacterIds: ["hero-1"],
        persistToDb: true,
      }),
    ).rejects.toThrow(V3ImagePersistenceError);
  });

  it("échoue quand certains panels ne sont pas persistés (imagesSkipped > 0)", async () => {
    const plan = makePlan([
      makePanel({ panelId: "p1" }),
      makePanel({ panelId: "p2", panelNumberInPage: 2 }),
    ]);

    mocks.persistV3RenderedPanels.mockResolvedValueOnce({
      scenesCreated: 1,
      scenesReused: 0,
      imagesUpserted: 1,
      imagesSkipped: 1,
      warnings: ["panel_not_rendered panelId=p2 page=1"],
    });

    await expect(
      runRenderPass({
        chapterId: "ch-1",
        storyboardPlan: plan,
        styleBible: createDefaultChapterStyleBible(),
        visualMemory: makeMemoryWithHero(),
        characters: [{ id: "hero-1", name: "Hero", roleType: "main" }],
        mainCharacterIds: ["hero-1"],
        persistToDb: true,
      }),
    ).rejects.toThrow(V3ImagePersistenceError);
  });

  it("réussit quand tous les panels sont persistés", async () => {
    const plan = makePlan([makePanel({ panelId: "p1" })]);

    mocks.persistV3RenderedPanels.mockResolvedValueOnce({
      scenesCreated: 1,
      scenesReused: 0,
      imagesUpserted: 1,
      imagesSkipped: 0,
      warnings: [],
    });

    const result = await runRenderPass({
      chapterId: "ch-1",
      storyboardPlan: plan,
      styleBible: createDefaultChapterStyleBible(),
      visualMemory: makeMemoryWithHero(),
      characters: [{ id: "hero-1", name: "Hero", roleType: "main" }],
      mainCharacterIds: ["hero-1"],
      persistToDb: true,
    });

    expect(result.summary.failedCount).toBe(0);
    expect(mocks.persistV3RenderedPanels).toHaveBeenCalledOnce();
    expect(mocks.startChapterImageGenerationRun).toHaveBeenCalledWith("ch-1");
    expect(mocks.persistV3RenderedPanels).toHaveBeenCalledWith(
      expect.objectContaining({ chapterId: "ch-1", generationRunId: "test-run-id" }),
    );
  });

  it("n’appelle pas startChapter si generationRunId est fourni explicitement", async () => {
    const plan = makePlan([makePanel({ panelId: "p1" })]);

    mocks.persistV3RenderedPanels.mockResolvedValueOnce({
      scenesCreated: 1,
      scenesReused: 0,
      imagesUpserted: 1,
      imagesSkipped: 0,
      warnings: [],
    });

    await runRenderPass({
      chapterId: "ch-1",
      storyboardPlan: plan,
      styleBible: createDefaultChapterStyleBible(),
      visualMemory: makeMemoryWithHero(),
      characters: [{ id: "hero-1", name: "Hero", roleType: "main" }],
      mainCharacterIds: ["hero-1"],
      persistToDb: true,
      generationRunId: "preset-run-id",
    });

    expect(mocks.startChapterImageGenerationRun).not.toHaveBeenCalled();
    expect(mocks.persistV3RenderedPanels).toHaveBeenCalledWith(
      expect.objectContaining({ generationRunId: "preset-run-id" }),
    );
  });

  it("ne persiste pas quand persistToDb=false (tests unitaires)", async () => {
    const plan = makePlan([makePanel({ panelId: "p1" })]);

    const result = await runRenderPass({
      chapterId: "ch-1",
      storyboardPlan: plan,
      styleBible: createDefaultChapterStyleBible(),
      visualMemory: makeMemoryWithHero(),
      characters: [{ id: "hero-1", name: "Hero", roleType: "main" }],
      mainCharacterIds: ["hero-1"],
      persistToDb: false,
    });

    expect(result.summary.failedCount).toBe(0);
    expect(mocks.persistV3RenderedPanels).not.toHaveBeenCalled();
  });

  it("échoue quand imagesStorageFailed > 0 (upload Supabase échoué)", async () => {
    const plan = makePlan([
      makePanel({ panelId: "p1" }),
      makePanel({ panelId: "p2", panelNumberInPage: 2 }),
    ]);

    mocks.persistV3RenderedPanels.mockResolvedValueOnce({
      scenesCreated: 1,
      scenesReused: 0,
      imagesUpserted: 1,
      imagesSkipped: 0,
      imagesStorageFailed: 1,
      warnings: ["storage_failed panelId=p2 bucket=panel-images"],
    });

    await expect(
      runRenderPass({
        chapterId: "ch-1",
        storyboardPlan: plan,
        styleBible: createDefaultChapterStyleBible(),
        visualMemory: makeMemoryWithHero(),
        characters: [{ id: "hero-1", name: "Hero", roleType: "main" }],
        mainCharacterIds: ["hero-1"],
        persistToDb: true,
      }),
    ).rejects.toThrow(V3ImagePersistenceError);
  });
});
