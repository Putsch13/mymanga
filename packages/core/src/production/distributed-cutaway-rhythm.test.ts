import { describe, expect, it } from "vitest";
import { buildCanonicalChapterProductionPlan } from "./build-canonical-production-plan";
import { PRODUCTION_RULES } from "./production-rules";

function outlineWithBeats(count: number) {
  return {
    source: "estimated" as const,
    chapterGoal: "Arc test",
    cliffhanger: "",
    beats: Array.from({ length: count }, (_, i) => ({
      beatId: `beat_${i + 1}`,
      summary: `Beat ${i + 1}`,
      narrativeFunction: "escalation",
      whyThisBeatExists: "why",
      dramaticChange: "change",
      involvedCharacters: ["hero-1"],
      activeCanonConstraints: [],
      environmentContext: ["dojo"],
      visualPriority: "high" as const,
      estimatedPanels: 4,
      criticality: "medium" as const,
      continuityDependencies: [],
      infoGained: null,
      emotionProduced: null,
      indispensabilityScore: 60,
      redundancyRisk: 20,
    })),
  };
}

describe("applyDistributedCutawayRhythm (via buildCanonicalChapterProductionPlan)", () => {
  it("respecte le ratio cutaway max et le plafond de cutaways consécutifs", () => {
    const plan = buildCanonicalChapterProductionPlan({
      chapterId: "c1",
      projectId: "p1",
      chapterNumber: 1,
      chapterTitle: "T1",
      format: "manga",
      rawOutline: outlineWithBeats(10),
    });
    const total = plan.panels.length;
    const cuts = plan.panels.filter((p) => p.isCutaway).length;
    expect(cuts / total).toBeLessThanOrEqual(PRODUCTION_RULES.cutaway.maxRatio + 0.01);

    let run = 0;
    let maxRun = 0;
    for (const p of plan.panels) {
      if (p.isCutaway) {
        run++;
        maxRun = Math.max(maxRun, run);
      } else {
        run = 0;
      }
    }
    expect(maxRun).toBeLessThanOrEqual(PRODUCTION_RULES.cutaway.maxConsecutive);
  });

  it("produit des cutaways répartis (au moins un cutaway sur un plan riche)", () => {
    const plan = buildCanonicalChapterProductionPlan({
      chapterId: "c2",
      projectId: "p1",
      chapterNumber: 1,
      chapterTitle: "T2",
      format: "manga",
      rawOutline: outlineWithBeats(8),
    });
    expect(plan.panels.filter((p) => p.isCutaway).length).toBeGreaterThan(0);
  });
});
