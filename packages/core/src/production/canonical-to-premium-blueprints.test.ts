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

  it("attache un textContract par panel aligné sur les champs texte (PR9)", () => {
    const plan = buildCanonicalChapterProductionPlan({
      chapterId: "ch1",
      projectId: "p1",
      chapterNumber: 1,
      chapterTitle: "T",
      format: "manga",
      rawOutline: rawOutlineManga,
    });
    const bps = canonicalPlanToPanelBlueprints(plan);
    expect(bps.length).toBeGreaterThan(0);
    for (const b of bps) {
      expect(b.textContract).toBeDefined();
      expect(b.textContract!.panelId).toBe(b.panelId);
    }
    const withLines = bps.find((b) => (b.dialogueLines?.length ?? 0) > 0);
    const withNarration = bps.find((b) => Boolean(b.narrationText?.trim()));
    const withSfx = bps.find((b) => (b.sfxCues?.length ?? 0) > 0);
    const sample = withLines ?? withNarration ?? withSfx;
    if (sample) {
      expect(sample.textContract!.hasText).toBe(true);
    }
  });
});
