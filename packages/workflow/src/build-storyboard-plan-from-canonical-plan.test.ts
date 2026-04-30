import { describe, expect, it } from "vitest";
import { buildCanonicalChapterProductionPlan } from "@manga-ai-studio/core";
import { buildStoryboardPlanFromCanonicalPlan } from "./build-storyboard-plan-from-canonical-plan";

const rawOutlineManga = {
  source: "test",
  chapterGoal: "Chapter goal text for normalization minimum length",
  cliffhanger: "Cliffhanger text here for the chapter end",
  beats: Array.from({ length: 10 }, (_, i) => ({
    beatId: `beat_${i + 1}`,
    summary: `Beat ${i + 1} narrative summary content here`,
    narrativeFunction: "progression",
    involvedCharacters: ["hero-1"],
    estimatedPanels: 8,
    criticality: "medium",
  })),
};

describe("buildStoryboardPlanFromCanonicalPlan", () => {
  it("dérive le storyboard depuis le plan canonique (nombre de panels = canonique)", () => {
    const canonical = buildCanonicalChapterProductionPlan({
      chapterId: "ch1",
      projectId: "proj1",
      chapterNumber: 1,
      chapterTitle: "Titre",
      format: "manga",
      rawOutline: rawOutlineManga,
    });
    const plan = buildStoryboardPlanFromCanonicalPlan({
      chapterId: "ch1",
      projectId: "proj1",
      chapterNumber: 1,
      projectFormat: "manga",
      canonicalPlan: canonical,
      productionPlanShell: { pageCount: 99 },
      chapterLocationName: "Rue",
    });
    const panelCount = plan.pages.reduce((n, p) => n + p.panels.length, 0);
    expect(panelCount).toBe(canonical.panels.length);
    expect(plan.totalTargetPanels).toBe(panelCount);
  });
});
