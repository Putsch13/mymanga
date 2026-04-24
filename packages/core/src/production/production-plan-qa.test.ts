import { describe, it, expect } from "vitest";
import { runProductionPlanQa, runProductionPlanQaOrThrow, ProductionPlanQaError } from "./production-plan-qa";
import { createEmptyProductionPlan, type CanonicalChapterProductionPlan, type CanonicalPanelPlan, type PanelTextPlan } from "./canonical-production-plan";
import { PRODUCTION_RULES } from "./production-rules";

function createMockPanel(overrides: Partial<CanonicalPanelPlan> = {}): CanonicalPanelPlan {
  const panelId = overrides.panelId ?? "panel_1";
  return {
    panelId,
    beatId: "beat_1",
    panelIndex: 0,
    pageNumber: 1,
    panelNumberInPage: 1,
    role: "hero",
    isCutaway: false,
    isActorDriven: true,
    purpose: "Test panel",
    shotType: "medium",
    cameraAngle: "eye_level",
    subjectFocus: "hero",
    requiredCharacterIds: ["hero_001"],
    mustShowCharacterIds: ["hero_001"],
    mayShowCharacterIds: [],
    requiredEntityIds: [],
    mustShowEnemy: false,
    requiredNpcCount: 0,
    requiredProps: [],
    requiredLocationSignals: [],
    textPlan: {
      panelId,
      mode: "dialogue",
      reserveTextArea: true,
    } as PanelTextPlan,
    criticality: "medium",
    notes: [],
    ...overrides,
  };
}

function createValidPlan(): CanonicalChapterProductionPlan {
  const plan = createEmptyProductionPlan("chapter_1", "project_1");

  const panels: CanonicalPanelPlan[] = [];
  let panelIndex = 0;

  for (let beatIndex = 0; beatIndex < 10; beatIndex++) {
    for (let i = 0; i < 5; i++) {
      panels.push(createMockPanel({
        panelId: `panel_${panelIndex}`,
        beatId: `beat_${beatIndex + 1}`,
        panelIndex: panelIndex,
        isCutaway: false,
        isActorDriven: true,
        textPlan: {
          panelId: `panel_${panelIndex}`,
          mode: i % 2 === 0 ? "dialogue" : "narration",
          anchor: { speakerId: "hero_001", reserveBubbleSpace: true },
          reserveTextArea: true,
        },
      }));
      panelIndex++;
    }
    for (let i = 0; i < 2; i++) {
      panels.push(createMockPanel({
        panelId: `cutaway_${beatIndex}_${i}`,
        beatId: `beat_${beatIndex + 1}`,
        panelIndex: panelIndex,
        role: "cutaway",
        isCutaway: true,
        isActorDriven: false,
        textPlan: {
          panelId: `cutaway_${beatIndex}_${i}`,
          mode: "silent",
          reserveTextArea: false,
        },
      }));
      panelIndex++;
    }
  }

  plan.panels = panels;
  plan.beats = Array.from({ length: 10 }, (_, i) => ({
    beatId: `beat_${i + 1}`,
    beatIndex: i,
    summary: `Beat ${i + 1}`,
    narrativeFunction: "progression",
    dramaticChange: "",
    involvedCharacters: ["hero_001"],
    environmentContext: [],
    targetPanelCount: 7,
    actualPanelCount: 7,
    panelIds: plan.panels.filter((p) => p.beatId === `beat_${i + 1}`).map((p) => p.panelId),
    hasDialogue: true,
    hasAction: false,
    hasEmotion: false,
    hasTension: false,
  }));

  const cutawayCount = plan.panels.filter((p) => p.isCutaway).length;
  const actorDrivenCount = plan.panels.filter((p) => p.isActorDriven).length;
  const dialogueAnchored = plan.panels.filter((p) => p.textPlan.mode === "dialogue" && p.textPlan.anchor?.speakerId).length;

  plan.metrics = {
    ...plan.metrics,
    totalPanels: plan.panels.length,
    totalBeats: plan.beats.length,
    cutawayCount,
    cutawayRatio: cutawayCount / plan.panels.length,
    actorDrivenCount,
    actorDrivenRatio: actorDrivenCount / plan.panels.length,
    dialogueAnchoredCount: dialogueAnchored,
    dialogueFloatingCount: 0,
    maxConsecutiveCutaways: 1,
  };

  return plan;
}

describe("production-plan-qa", () => {
  describe("runProductionPlanQa", () => {
    it("should pass a valid plan", () => {
      const plan = createValidPlan();
      const result = runProductionPlanQa(plan);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should fail when panel count is below minimum", () => {
      const plan = createValidPlan();
      plan.panels = plan.panels.slice(0, 50);
      plan.metrics.totalPanels = 50;

      const result = runProductionPlanQa(plan);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("below minimum"))).toBe(true);
    });

    it("should fail when panel count exceeds maximum", () => {
      const plan = createValidPlan();
      const extraPanels = Array.from({ length: 10 }, (_, i) =>
        createMockPanel({ panelId: `extra_${i}` })
      );
      plan.panels = [...plan.panels, ...extraPanels];
      plan.metrics.totalPanels = plan.panels.length;

      const result = runProductionPlanQa(plan);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("exceeds maximum"))).toBe(true);
    });

    it("should fail when cutaway ratio exceeds max", () => {
      const plan = createValidPlan();
      plan.metrics.cutawayRatio = 0.50;

      const result = runProductionPlanQa(plan);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Cutaway ratio"))).toBe(true);
    });

    it("should fail when actor-driven ratio is below min", () => {
      const plan = createValidPlan();
      plan.metrics.actorDrivenRatio = 0.50;

      const result = runProductionPlanQa(plan);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Actor-driven ratio"))).toBe(true);
    });

    it("should fail when consecutive cutaways exceed limit", () => {
      const plan = createValidPlan();
      plan.panels = plan.panels.map((p, i) => ({
        ...p,
        isCutaway: i >= 0 && i <= 3,
      }));
      plan.metrics.maxConsecutiveCutaways = 4;

      const result = runProductionPlanQa(plan);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("consecutive cutaways"))).toBe(true);
    });

    it("should fail when beats are not covered", () => {
      const plan = createValidPlan();
      plan.beats.push({
        beatId: "uncovered_beat",
        beatIndex: 10,
        summary: "Uncovered",
        narrativeFunction: "progression",
        dramaticChange: "",
        involvedCharacters: [],
        environmentContext: [],
        targetPanelCount: 5,
        actualPanelCount: 0,
        panelIds: [],
        hasDialogue: false,
        hasAction: false,
        hasEmotion: false,
        hasTension: false,
      });

      const result = runProductionPlanQa(plan);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("beats have no panels"))).toBe(true);
    });

    it("should return detailed results for each check", () => {
      const plan = createValidPlan();
      const result = runProductionPlanQa(plan);

      expect(result.details).toHaveProperty("cutawayRatioOk");
      expect(result.details).toHaveProperty("actorDrivenRatioOk");
      expect(result.details).toHaveProperty("beatCoverageOk");
      expect(result.details).toHaveProperty("panelCountOk");
    });
  });

  describe("runProductionPlanQaOrThrow", () => {
    it("should return result for valid plan", () => {
      const plan = createValidPlan();
      const result = runProductionPlanQaOrThrow(plan);

      expect(result.valid).toBe(true);
    });

    it("should throw ProductionPlanQaError for invalid plan", () => {
      const plan = createValidPlan();
      plan.panels = plan.panels.slice(0, 50);
      plan.metrics.totalPanels = 50;

      expect(() => runProductionPlanQaOrThrow(plan)).toThrow(ProductionPlanQaError);
    });

    it("should include QA result in thrown error", () => {
      const plan = createValidPlan();
      plan.panels = plan.panels.slice(0, 50);
      plan.metrics.totalPanels = 50;

      try {
        runProductionPlanQaOrThrow(plan);
      } catch (error) {
        expect(error).toBeInstanceOf(ProductionPlanQaError);
        expect((error as ProductionPlanQaError).qaResult.errors.length).toBeGreaterThan(0);
      }
    });
  });
});
