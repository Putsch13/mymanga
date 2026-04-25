import { describe, expect, it, vi, afterEach } from "vitest";
import type { StoryboardPanel, StoryboardPage, StoryboardPlan } from "@manga-ai-studio/ai/contracts";
import type { VisualQaResult } from "@manga-ai-studio/ai";
import * as Ai from "@manga-ai-studio/ai";
import {
  addCharacterEntry,
  addEnvironmentEntry,
  createDefaultChapterStyleBible,
  createEmptyChapterVisualMemory,
  type ChapterVisualMemory,
} from "@manga-ai-studio/ai";
import { PRODUCTION_RULES } from "@manga-ai-studio/core";
import { runRenderPass } from "./render-pass";

vi.mock("../persistence/render-persistence", () => ({
  saveRenderPassResult: vi.fn().mockResolvedValue(undefined),
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

function makeMemoryWithHero(): ChapterVisualMemory {
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
  addEnvironmentEntry(memory, {
    anchorId: "env-street",
    locationId: null,
    locationName: "Street",
    refUrl: "https://ref/street.png",
    defaultWeight: 0.7,
  });
  return memory;
}

function baseQaFail(attemptNumber: number): VisualQaResult {
  const maxAttempts = PRODUCTION_RULES.visualQa.maxAttemptsPerPanel;
  return {
    passed: false,
    score: 0.2,
    reasons: ["mock_visual_qa_fail"],
    failures: [],
    retryRecommended: attemptNumber < maxAttempts,
    retryStrategy: "stronger_character_lock",
    attemptNumber,
    maxAttempts,
    shouldMarkManualReview: attemptNumber >= maxAttempts,
  };
}

describe("runRenderPass — contrat QA visuelle (phase 8)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("8.1 — QA failed après retries → manual_review_required, quality needs_review, pas succès complet", async () => {
    vi.stubEnv("RENDER_PASS_VISUAL_QA_RETRY", "true");
    vi.spyOn(Ai, "runVisualPanelQaWithOptionalVision").mockImplementation(async (input) =>
      Promise.resolve(baseQaFail(input.attemptNumber)),
    );

    const plan = makePlan([makePanel({ panelId: "p-qa-fail" })]);
    const gen = vi.fn().mockResolvedValue({ ok: true, imageUrl: "https://example.com/panel.png" });
    const res = await runRenderPass({
      chapterId: "ch-1",
      storyboardPlan: plan,
      styleBible: createDefaultChapterStyleBible(),
      visualMemory: makeMemoryWithHero(),
      characters: [{ id: "hero-1", name: "Hero", roleType: "main" }],
      mainCharacterIds: ["hero-1"],
      generatePanelImage: gen,
    });

    const desc = res.rendered.find((r) => r.spec.panelId === "p-qa-fail");
    expect(desc?.finalStatus).toBe("manual_review_required");
    expect(res.summary.visualQaFailedCount).toBe(1);
    expect(res.summary.manualReviewRequiredCount).toBe(1);
    expect(res.summary.v3RenderQualityStatus).toBe("needs_review");
    expect(res.summary.renderedCount).toBe(0);
    expect(desc?.visualQa?.passed).toBe(false);
    expect((desc?.renderAttempts?.length ?? 0)).toBe(PRODUCTION_RULES.visualQa.maxAttemptsPerPanel);
  });

  it("8.2 — QA failed puis passed → passed_after_retry", async () => {
    vi.stubEnv("RENDER_PASS_VISUAL_QA_RETRY", "true");
    vi.spyOn(Ai, "runVisualPanelQaWithOptionalVision").mockImplementation(async (input) => {
      const maxAttempts = PRODUCTION_RULES.visualQa.maxAttemptsPerPanel;
      if (input.attemptNumber === 1) {
        return {
          passed: false,
          score: 0.4,
          reasons: ["first"],
          failures: [],
          retryRecommended: true,
          retryStrategy: "refined_prompt",
          attemptNumber: 1,
          maxAttempts,
          shouldMarkManualReview: false,
        };
      }
      return {
        passed: true,
        score: 0.92,
        reasons: [],
        failures: [],
        retryRecommended: false,
        attemptNumber: input.attemptNumber,
        maxAttempts,
        shouldMarkManualReview: false,
      };
    });

    const plan = makePlan([makePanel({ panelId: "p-retry-ok" })]);
    const gen = vi.fn().mockResolvedValue({ ok: true, imageUrl: "https://example.com/panel.png" });
    const res = await runRenderPass({
      chapterId: "ch-1",
      storyboardPlan: plan,
      styleBible: createDefaultChapterStyleBible(),
      visualMemory: makeMemoryWithHero(),
      characters: [{ id: "hero-1", name: "Hero", roleType: "main" }],
      mainCharacterIds: ["hero-1"],
      generatePanelImage: gen,
    });

    const desc = res.rendered.find((r) => r.spec.panelId === "p-retry-ok");
    expect(desc?.finalStatus).toBe("passed_after_retry");
    expect(res.summary.passedAfterRetryCount).toBe(1);
    expect(res.summary.visualQaPassedCount).toBe(1);
    expect(res.summary.visualQaFailedCount).toBe(0);
    expect(desc?.renderAttempts?.length).toBe(2);
  });

  it("8.3 — retry strategy officielle transmise à buildRetryPrompt", async () => {
    vi.stubEnv("RENDER_PASS_VISUAL_QA_RETRY", "true");
    const buildSpy = vi.spyOn(Ai, "buildRetryPrompt").mockReturnValue({
      prompt: "retry-prompt",
      strengthenedRefs: false,
      simplifiedScene: false,
    });

    vi.spyOn(Ai, "runVisualPanelQaWithOptionalVision").mockImplementation(async (input) => {
      const maxAttempts = PRODUCTION_RULES.visualQa.maxAttemptsPerPanel;
      if (input.attemptNumber === 1) {
        return {
          passed: false,
          score: 0.4,
          reasons: ["composition"],
          failures: [],
          retryRecommended: true,
          retryStrategy: "composition_fix",
          attemptNumber: 1,
          maxAttempts,
          shouldMarkManualReview: false,
        };
      }
      return {
        passed: true,
        score: 0.9,
        reasons: [],
        failures: [],
        retryRecommended: false,
        attemptNumber: input.attemptNumber,
        maxAttempts,
        shouldMarkManualReview: false,
      };
    });

    const plan = makePlan([makePanel({ panelId: "p-strategy" })]);
    const gen = vi.fn().mockResolvedValue({ ok: true, imageUrl: "https://example.com/panel.png" });
    await runRenderPass({
      chapterId: "ch-1",
      storyboardPlan: plan,
      styleBible: createDefaultChapterStyleBible(),
      visualMemory: makeMemoryWithHero(),
      characters: [{ id: "hero-1", name: "Hero", roleType: "main" }],
      mainCharacterIds: ["hero-1"],
      generatePanelImage: gen,
    });

    expect(buildSpy).toHaveBeenCalled();
    const call = buildSpy.mock.calls.find((c) => (c[0] as { currentStrategy?: string }).currentStrategy === "composition_fix");
    expect(call).toBeDefined();
    const ctx = call![0] as { currentStrategy: string; previousResults: VisualQaResult[] };
    expect(ctx.currentStrategy).toBe("composition_fix");
    expect(ctx.previousResults.length).toBeGreaterThanOrEqual(1);
  });
});
