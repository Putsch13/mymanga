import { describe, it, expect } from "vitest";
import { buildCanonicalChapterProductionPlan } from "./build-canonical-production-plan";
import { buildCanonicalProductionPlanFromPremiumBlueprints } from "./blueprint-to-canonical-plan";
import { canonicalPlanToPanelBlueprints } from "./canonical-to-premium-blueprints";
import { PRODUCTION_RULES } from "./production-rules";

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

describe("canonicalPlanToPanelBlueprints", () => {
  it("produit un blueprint par panel canonique", () => {
    const plan = buildCanonicalChapterProductionPlan({
      chapterId: "ch1",
      projectId: "p1",
      chapterNumber: 1,
      chapterTitle: "T",
      format: "manga",
      rawOutline: rawOutlineManga,
    });
    const bps = canonicalPlanToPanelBlueprints(plan);
    expect(bps.length).toBe(plan.panels.length);
    expect(bps.every((b, i) => b.panelId === plan.panels[i]!.panelId)).toBe(true);
    expect(bps.length).toBeGreaterThanOrEqual(PRODUCTION_RULES.panelCount.minimum);
    expect(bps.length).toBeLessThanOrEqual(PRODUCTION_RULES.panelCount.maximum);
  });

  it("roundtrip canonique → blueprints → canonique préserve le nombre de panels", () => {
    const plan1 = buildCanonicalChapterProductionPlan({
      chapterId: "ch1",
      projectId: "p1",
      chapterNumber: 1,
      chapterTitle: "T",
      format: "manga",
      rawOutline: rawOutlineManga,
    });
    const bps = canonicalPlanToPanelBlueprints(plan1);
    const plan2 = buildCanonicalProductionPlanFromPremiumBlueprints({
      chapterId: "ch1",
      projectId: "p1",
      chapterNumber: 1,
      chapterTitle: "T",
      format: "manga",
      productionOutline: rawOutlineManga,
      blueprints: bps,
    });
    expect(plan2.metrics.totalPanels).toBe(plan1.metrics.totalPanels);
  });
});
