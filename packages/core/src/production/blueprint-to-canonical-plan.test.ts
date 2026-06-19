import { describe, it, expect } from "vitest";
import { buildCanonicalProductionPlanFromPremiumBlueprints } from "./blueprint-to-canonical-plan";
import { PRODUCTION_RULES } from "./production-rules";
import type { PanelBlueprintPremium } from "../types/narrative-facts";

function bp(beatId: string, i: number, cutaway: boolean): PanelBlueprintPremium {
  return {
    panelId: `${beatId}_p${i}`,
    beatId,
    panelNumber: i + 1,
    panelIndex: i,
    purpose: "test",
    shotType: "medium",
    cameraAngle: "eye_level",
    subjectFocus: cutaway ? "environment" : "hero",
    mustShowEnemy: false,
    requiredNpcCount: 0,
    requiredProps: [],
    requiredLocationSignals: [],
    cutawayType: cutaway ? "environment" : "none",
    heroCenterAllowed: true,
    criticality: "medium",
    mustShowCharacterIds: cutaway ? [] : ["c1"],
    requiredCharacterIds: cutaway ? [] : ["c1"],
  };
}

describe("blueprint-to-canonical-plan", () => {
  it("produit un plan avec QA pour des blueprints alignés sur la range premium", () => {
    const beats = [{ beatId: "b1", summary: "x".repeat(12), involvedCharacters: ["c1"] }];
    const panels: PanelBlueprintPremium[] = [];
    for (let i = 0; i < PRODUCTION_RULES.panelCount.minimum; i++) {
      panels.push(bp("b1", i, i % 5 === 0));
    }
    const plan = buildCanonicalProductionPlanFromPremiumBlueprints({
      chapterId: "ch1",
      projectId: "p1",
      chapterNumber: 1,
      chapterTitle: "T",
      format: "manga",
      productionOutline: { chapterGoal: "g".repeat(10), cliffhanger: "c".repeat(4), beats },
      blueprints: panels,
    });
    expect(plan.metrics.totalPanels).toBe(PRODUCTION_RULES.panelCount.minimum);
    expect(plan.qa.errors.length).toBe(0);
    expect(plan.qa.valid).toBe(true);
  });
});
