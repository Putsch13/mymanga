import { describe, expect, it } from "vitest";
import { PREMIUM_PANEL_RANGE } from "../premium-panel-range";
import { PRODUCTION_RULES } from "./production-rules";
import { buildProductionPlanFromOutline } from "../types/chapter-studio-helpers";

describe("premium panel count semantics", () => {
  it("PRODUCTION_RULES définit 70 / 72 / 75", () => {
    expect(PRODUCTION_RULES.panelCount.minimum).toBe(70);
    expect(PRODUCTION_RULES.panelCount.target).toBe(72);
    expect(PRODUCTION_RULES.panelCount.maximum).toBe(75);
  });

  it("PREMIUM_PANEL_RANGE aligné sur PRODUCTION_RULES", () => {
    expect(PREMIUM_PANEL_RANGE.min).toBe(PRODUCTION_RULES.panelCount.minimum);
    expect(PREMIUM_PANEL_RANGE.target).toBe(PRODUCTION_RULES.panelCount.target);
    expect(PREMIUM_PANEL_RANGE.max).toBe(PRODUCTION_RULES.panelCount.maximum);
  });

  it("buildProductionPlanFromOutline utilise minimumImages pour minimumImages (pas la cible)", () => {
    const outline = {
      source: "estimated" as const,
      chapterGoal: "g",
      cliffhanger: "",
      beats: [
        {
          beatId: "b1",
          summary: "s",
          narrativeFunction: "escalation",
          whyThisBeatExists: "w",
          dramaticChange: "d",
          involvedCharacters: [],
          activeCanonConstraints: [],
          environmentContext: [],
          visualPriority: "high" as const,
          estimatedPanels: 4,
          criticality: "medium" as const,
          continuityDependencies: [],
          infoGained: null,
          emotionProduced: null,
          indispensabilityScore: 60,
          redundancyRisk: 20,
        },
      ],
    };
    const plan = buildProductionPlanFromOutline(outline, { minimumImages: PREMIUM_PANEL_RANGE.min });
    expect(plan.minimumImages).toBe(70);
    expect(plan.estimatedImages).toBe(4);
  });

  it("buildProductionPlanFromOutline sans minimum explicite utilise 70 par défaut", () => {
    const outline = {
      source: "estimated" as const,
      chapterGoal: "g",
      cliffhanger: "",
      beats: [
        {
          beatId: "b1",
          summary: "s",
          narrativeFunction: "escalation",
          whyThisBeatExists: "w",
          dramaticChange: "d",
          involvedCharacters: [],
          activeCanonConstraints: [],
          environmentContext: [],
          visualPriority: "high" as const,
          estimatedPanels: 2,
          criticality: "medium" as const,
          continuityDependencies: [],
          infoGained: null,
          emotionProduced: null,
          indispensabilityScore: 60,
          redundancyRisk: 20,
        },
      ],
    };
    const plan = buildProductionPlanFromOutline(outline);
    expect(plan.minimumImages).toBe(70);
  });
});
