import { describe, it, expect } from "vitest";
import { buildCanonicalChapterProductionPlan } from "./build-canonical-production-plan";
import { canonicalPlanToPanelBlueprints } from "./canonical-to-premium-blueprints";
import { mergeRawBlueprintsWithCanonicalRhythm } from "./merge-raw-blueprints-with-canonical-rhythm";
import type { PanelBlueprintPremium } from "../types/narrative-facts";

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

describe("mergeRawBlueprintsWithCanonicalRhythm", () => {
  it("conserve le purpose des blueprints riches et aligne panelId/page sur le canonique", () => {
    const canonical = buildCanonicalChapterProductionPlan({
      chapterId: "ch1",
      projectId: "p1",
      chapterNumber: 1,
      chapterTitle: "T",
      format: "manga",
      rawOutline: rawOutlineManga,
    });
    const generic = canonicalPlanToPanelBlueprints(canonical);
    const rich: PanelBlueprintPremium[] = generic.map((bp, i) => ({
      ...bp,
      purpose: `RICH_PURPOSE_${i}`,
    }));
    const merged = mergeRawBlueprintsWithCanonicalRhythm(rich, canonical);
    expect(merged.length).toBe(canonical.panels.length);
    for (let i = 0; i < merged.length; i++) {
      expect(merged[i]!.panelId).toBe(canonical.panels[i]!.panelId);
      expect(merged[i]!.pageNumber).toBe(canonical.panels[i]!.pageNumber);
      expect(merged[i]!.purpose).toBe(`RICH_PURPOSE_${i}`);
    }
  });

  it("retombe sur la projection canonique si aucun blueprint brut", () => {
    const canonical = buildCanonicalChapterProductionPlan({
      chapterId: "ch1",
      projectId: "p1",
      chapterNumber: 1,
      chapterTitle: "T",
      format: "manga",
      rawOutline: rawOutlineManga,
    });
    const merged = mergeRawBlueprintsWithCanonicalRhythm([], canonical);
    const direct = canonicalPlanToPanelBlueprints(canonical);
    expect(merged.length).toBe(direct.length);
  });
});
