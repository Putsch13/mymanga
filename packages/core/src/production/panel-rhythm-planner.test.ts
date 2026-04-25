import { describe, it, expect } from "vitest";
import { planRhythm, determinePanelRole, determinePanelTextPlan } from "./panel-rhythm-planner";
import { PRODUCTION_RULES } from "./production-rules";
import type { NormalizedBeat, NormalizedOutline } from "./normalize-outline";

function createMockBeat(overrides: Partial<NormalizedBeat> = {}): NormalizedBeat {
  return {
    beatId: "beat_1",
    beatIndex: 0,
    summary: "Test beat summary",
    narrativeFunction: "progression",
    whyThisBeatExists: "Test reason",
    dramaticChange: "Test change",
    involvedCharacters: ["hero_001"],
    entities: [],
    props: [],
    locations: ["Tokyo"],
    environmentContext: ["urban"],
    dialogueIntent: null,
    hasDialogue: false,
    hasAction: false,
    hasCombat: false,
    hasEmotion: false,
    hasTension: false,
    estimatedPanels: 4,
    criticality: "medium",
    sceneContext: null,
    opponent: null,
    ...overrides,
  };
}

function createMockOutline(beats?: NormalizedBeat[]): NormalizedOutline {
  const resolvedBeats = beats !== undefined
    ? beats
    : Array.from({ length: 10 }, (_, i) =>
        createMockBeat({ beatId: `beat_${i + 1}`, beatIndex: i })
      );
  return {
    source: "test",
    chapterGoal: "Test chapter",
    cliffhanger: "",
    beats: resolvedBeats,
    totalEstimatedPanels: resolvedBeats.reduce((sum, b) => sum + b.estimatedPanels, 0),
  };
}

describe("panel-rhythm-planner", () => {
  describe("planRhythm", () => {
    it("should produce approximately targetPanelCount panels", () => {
      const outline = createMockOutline();
      const result = planRhythm(outline, { targetPanelCount: 72 });

      expect(result.totalPanels).toBeGreaterThanOrEqual(PRODUCTION_RULES.panelCount.minimum);
      expect(result.totalPanels).toBeLessThanOrEqual(PRODUCTION_RULES.panelCount.maximum);
    });

    it("should respect cutaway max ratio", () => {
      const outline = createMockOutline();
      const result = planRhythm(outline);

      expect(result.cutawayRatio).toBeLessThanOrEqual(PRODUCTION_RULES.cutaway.maxRatio);
    });

    it("should respect actor-driven min ratio", () => {
      const outline = createMockOutline();
      const result = planRhythm(outline);

      expect(result.actorDrivenRatio).toBeGreaterThanOrEqual(PRODUCTION_RULES.actorDriven.minRatio);
    });

    it("should cover all beats", () => {
      const outline = createMockOutline();
      const result = planRhythm(outline);

      expect(result.beatDistributions.length).toBe(outline.beats.length);
      result.beatDistributions.forEach((d) => {
        expect(d.adjustedPanelCount).toBeGreaterThanOrEqual(3);
      });
    });

    it("should give more panels to important beats", () => {
      const beats = [
        createMockBeat({ beatId: "beat_1", hasCombat: true, criticality: "critical" }),
        createMockBeat({ beatId: "beat_2", criticality: "low" }),
      ];
      const outline = createMockOutline(beats);

      const result = planRhythm(outline, { targetPanelCount: 20 });

      const beat1Panels = result.beatDistributions.find((d) => d.beatId === "beat_1")?.adjustedPanelCount ?? 0;
      const beat2Panels = result.beatDistributions.find((d) => d.beatId === "beat_2")?.adjustedPanelCount ?? 0;

      expect(beat1Panels).toBeGreaterThan(beat2Panels);
    });

    it("should return invalid result for empty outline", () => {
      const outline = createMockOutline([]);
      const result = planRhythm(outline);

      expect(result.valid).toBe(false);
      expect(result.warnings).toContain("No beats in outline");
    });

    it("should flag when cutaway ratio is too high", () => {
      const outline = createMockOutline();
      const result = planRhythm(outline, { cutawayMaxRatio: 0.01 });

      if (result.cutawayRatio > 0.01) {
        expect(result.warnings.some((w) => w.includes("Cutaway ratio"))).toBe(true);
      }
    });
  });

  describe("determinePanelRole", () => {
    it("should return cutaway for cutaway panels", () => {
      const beat = createMockBeat();
      const role = determinePanelRole(beat, 0, 5, true);
      expect(["cutaway", "environment", "prop", "aftermath"]).toContain(role);
    });

    it("should return action/reaction for combat beats", () => {
      const beat = createMockBeat({ hasCombat: true });
      const role = determinePanelRole(beat, 0, 4, false);
      expect(["action", "reaction", "enemy"]).toContain(role);
    });

    it("should return speaker/listener for dialogue beats", () => {
      const beat = createMockBeat({ hasDialogue: true });
      const role = determinePanelRole(beat, 0, 4, false);
      expect(["speaker", "listener"]).toContain(role);
    });

    it("should return hero for single character beats", () => {
      const beat = createMockBeat({ involvedCharacters: ["hero_001"] });
      const role = determinePanelRole(beat, 0, 4, false);
      expect(role).toBe("hero");
    });

    it("should return duo for two character beats", () => {
      const beat = createMockBeat({ involvedCharacters: ["hero_001", "sidekick_001"] });
      const role = determinePanelRole(beat, 0, 4, false);
      expect(role).toBe("duo");
    });

    it("should return group when more than three characters (non combat/dialogue path)", () => {
      const beat = createMockBeat({
        involvedCharacters: ["a", "b", "c", "d"],
        hasCombat: false,
        hasDialogue: false,
        hasEmotion: false,
      });
      const role = determinePanelRole(beat, 0, 4, false);
      expect(role).toBe("group");
    });
  });

  describe("determinePanelTextPlan", () => {
    it("should return silent for cutaway panels", () => {
      const beat = createMockBeat();
      const textPlan = determinePanelTextPlan(beat, "cutaway", true);

      expect(textPlan.mode).toBe("silent");
      expect(textPlan.reserveTextArea).toBe(false);
    });

    it("should return dialogue for speaker in dialogue beat", () => {
      const beat = createMockBeat({ hasDialogue: true });
      const textPlan = determinePanelTextPlan(beat, "speaker", false);

      expect(textPlan.mode).toBe("dialogue");
      expect(textPlan.reserveTextArea).toBe(true);
    });

    it("should return sfx for action in combat beat", () => {
      const beat = createMockBeat({ hasCombat: true });
      const textPlan = determinePanelTextPlan(beat, "action", false);

      expect(textPlan.mode).toBe("sfx");
      expect(textPlan.reserveTextArea).toBe(true);
    });

    it("should return thought for reaction in emotion beat", () => {
      const beat = createMockBeat({ hasEmotion: true });
      const textPlan = determinePanelTextPlan(beat, "reaction", false);

      expect(textPlan.mode).toBe("thought");
      expect(textPlan.reserveTextArea).toBe(true);
    });
  });
});
