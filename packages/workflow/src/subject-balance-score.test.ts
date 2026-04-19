import { describe, expect, it } from "vitest";
import {
  calculateTargetBalanceScore,
  calculateTargetProminencePerSubject,
  calculateObservedBalanceScore,
  determineBalanceRecommendation,
  computeSubjectBalanceScore,
  isBalanceRerollNeeded,
  getBalanceScoreLabel,
  calculateChapterBalanceMetrics,
} from "./subject-balance-score";
import type { PanelGenerationIntent } from "./generation-intent-planner";

function makeIntent(overrides: Partial<PanelGenerationIntent> = {}): PanelGenerationIntent {
  return {
    panelId: "panel-1",
    panelNumber: 1,
    pageNumber: 1,
    beatId: "beat-1",
    intentType: "hero_portrait",
    beatType: "dialogue",
    panelFunction: "hero_portrait",
    dominantSubject: "hero",
    secondarySubjects: [],
    cutawayType: null,
    cameraIntent: "closeup",
    compositionIntent: "closeup shot focused on hero",
    shotType: "closeup",
    cameraAngle: null,
    environmentPriority: 25,
    characterPriority: 90,
    propPriority: 30,
    crowdPriority: 15,
    requiredVisibleEntities: [],
    requiredVisibleProps: [],
    requiredLocationSignals: [],
    suppressedEntities: [],
    suppressedPromptClauses: [],
    allowedReferencePolicy: "STRONG",
    requiredReferenceSet: {
      characterRefs: true,
      sceneRefs: false,
      styleRefs: true,
      environmentRefs: false,
    },
    forbiddenFraming: [],
    forbiddenPromptTokens: [],
    visualHierarchy: {
      foreground: [],
      midground: [],
      background: [],
    },
    reason: "test",
    ...overrides,
  };
}

describe("P2.2 — subject-balance-score", () => {
  describe("calculateTargetBalanceScore", () => {
    it("returns 85 for hero dominant", () => {
      const intent = makeIntent({ dominantSubject: "hero" });
      expect(calculateTargetBalanceScore(intent)).toBe(85);
    });

    it("returns 50 for duo", () => {
      const intent = makeIntent({ dominantSubject: "duo" });
      expect(calculateTargetBalanceScore(intent)).toBe(50);
    });

    it("returns 25 for enemy", () => {
      const intent = makeIntent({ dominantSubject: "enemy" });
      expect(calculateTargetBalanceScore(intent)).toBe(25);
    });

    it("returns 10 for environment", () => {
      const intent = makeIntent({ dominantSubject: "environment" });
      expect(calculateTargetBalanceScore(intent)).toBe(10);
    });

    it("returns 20 for guard_group", () => {
      const intent = makeIntent({ dominantSubject: "guard_group" });
      expect(calculateTargetBalanceScore(intent)).toBe(20);
    });
  });

  describe("calculateTargetProminencePerSubject", () => {
    it("returns high hero prominence for hero panel", () => {
      const intent = makeIntent({ dominantSubject: "hero" });
      const prominence = calculateTargetProminencePerSubject(intent);
      expect(prominence.hero).toBe(90);
      expect(prominence.other).toBe(20);
    });

    it("returns balanced prominence for duo", () => {
      const intent = makeIntent({ dominantSubject: "duo" });
      const prominence = calculateTargetProminencePerSubject(intent);
      expect(prominence.hero).toBe(60);
      expect(prominence.other).toBe(60);
    });

    it("returns high environment for environment panel", () => {
      const intent = makeIntent({ dominantSubject: "environment" });
      const prominence = calculateTargetProminencePerSubject(intent);
      expect(prominence.environment).toBe(90);
      expect(prominence.hero).toBe(10);
    });

    it("returns high crowd for guard_group", () => {
      const intent = makeIntent({ dominantSubject: "guard_group" });
      const prominence = calculateTargetProminencePerSubject(intent);
      expect(prominence.crowd).toBe(85);
      expect(prominence.hero).toBe(15);
    });
  });

  describe("calculateObservedBalanceScore", () => {
    it("returns 50 when both are equal", () => {
      expect(calculateObservedBalanceScore(50, 50)).toBe(50);
    });

    it("returns 100 when hero is 100% prominent", () => {
      expect(calculateObservedBalanceScore(100, 0)).toBe(100);
    });

    it("returns 0 when other is 100% prominent", () => {
      expect(calculateObservedBalanceScore(0, 100)).toBe(0);
    });

    it("returns 75 when hero is 3x more prominent", () => {
      expect(calculateObservedBalanceScore(75, 25)).toBe(75);
    });

    it("returns 50 when both are 0", () => {
      expect(calculateObservedBalanceScore(0, 0)).toBe(50);
    });
  });

  describe("determineBalanceRecommendation", () => {
    it("returns KEEP when within acceptable deviation", () => {
      const rec = determineBalanceRecommendation(50, 55, "duo");
      expect(rec).toBe("KEEP");
    });

    it("returns CANNOT_EVALUATE when observedScore is null", () => {
      const rec = determineBalanceRecommendation(50, null, "duo");
      expect(rec).toBe("CANNOT_EVALUATE");
    });

    it("returns REROLL_HERO_NOT_VISIBLE_ENOUGH for hero panel with low hero", () => {
      const rec = determineBalanceRecommendation(85, 50, "hero");
      expect(rec).toBe("REROLL_HERO_NOT_VISIBLE_ENOUGH");
    });

    it("returns REROLL_HERO_TOO_DOMINANT for duo with hero too visible", () => {
      const rec = determineBalanceRecommendation(50, 85, "duo");
      expect(rec).toBe("REROLL_HERO_TOO_DOMINANT");
    });

    it("returns REROLL_OTHER_TOO_DOMINANT for duo with other too visible", () => {
      const rec = determineBalanceRecommendation(50, 15, "duo");
      expect(rec).toBe("REROLL_OTHER_TOO_DOMINANT");
    });

    it("returns REROLL_HERO_TOO_DOMINANT for enemy panel with hero dominant", () => {
      const rec = determineBalanceRecommendation(25, 80, "enemy");
      expect(rec).toBe("REROLL_HERO_TOO_DOMINANT");
    });

    it("returns REROLL_HERO_TOO_DOMINANT for guard_group with hero visible", () => {
      const rec = determineBalanceRecommendation(20, 60, "guard_group");
      expect(rec).toBe("REROLL_HERO_TOO_DOMINANT");
    });
  });

  describe("computeSubjectBalanceScore", () => {
    it("computes complete score with vision results", () => {
      const intent = makeIntent({ dominantSubject: "duo" });
      const score = computeSubjectBalanceScore({
        intent,
        heroCharacterId: "hero-1",
        observedHeroProminence: 55,
        observedOtherProminence: 45,
        hasVisionApiResult: true,
      });

      expect(score.targetScore).toBe(50);
      expect(score.observedScore).toBe(55);
      expect(score.deviation).toBe(5);
      expect(score.isAcceptable).toBe(true);
      expect(score.recommendation).toBe("KEEP");
    });

    it("handles missing vision results", () => {
      const intent = makeIntent({ dominantSubject: "hero" });
      const score = computeSubjectBalanceScore({
        intent,
        heroCharacterId: "hero-1",
        hasVisionApiResult: false,
      });

      expect(score.targetScore).toBe(85);
      expect(score.observedScore).toBeNull();
      expect(score.deviation).toBeNull();
      expect(score.isAcceptable).toBe(false);
      expect(score.recommendation).toBe("CANNOT_EVALUATE");
    });

    it("detects unacceptable deviation", () => {
      const intent = makeIntent({ dominantSubject: "hero" });
      const score = computeSubjectBalanceScore({
        intent,
        heroCharacterId: "hero-1",
        observedHeroProminence: 30,
        observedOtherProminence: 70,
        hasVisionApiResult: true,
      });

      expect(score.isAcceptable).toBe(false);
      expect(score.recommendation).toBe("REROLL_HERO_NOT_VISIBLE_ENOUGH");
    });
  });

  describe("isBalanceRerollNeeded", () => {
    it("returns false for KEEP", () => {
      const score = computeSubjectBalanceScore({
        intent: makeIntent({ dominantSubject: "duo" }),
        heroCharacterId: "hero-1",
        observedHeroProminence: 50,
        observedOtherProminence: 50,
        hasVisionApiResult: true,
      });
      expect(isBalanceRerollNeeded(score)).toBe(false);
    });

    it("returns false for CANNOT_EVALUATE", () => {
      const score = computeSubjectBalanceScore({
        intent: makeIntent({ dominantSubject: "duo" }),
        heroCharacterId: "hero-1",
        hasVisionApiResult: false,
      });
      expect(isBalanceRerollNeeded(score)).toBe(false);
    });

    it("returns true for REROLL recommendations", () => {
      const score = computeSubjectBalanceScore({
        intent: makeIntent({ dominantSubject: "hero" }),
        heroCharacterId: "hero-1",
        observedHeroProminence: 20,
        observedOtherProminence: 80,
        hasVisionApiResult: true,
      });
      expect(isBalanceRerollNeeded(score)).toBe(true);
    });
  });

  describe("getBalanceScoreLabel", () => {
    it("returns unknown when no observed score", () => {
      const score = computeSubjectBalanceScore({
        intent: makeIntent(),
        heroCharacterId: "hero-1",
        hasVisionApiResult: false,
      });
      expect(getBalanceScoreLabel(score)).toBe("unknown");
    });

    it("returns balanced when acceptable", () => {
      const score = computeSubjectBalanceScore({
        intent: makeIntent({ dominantSubject: "duo" }),
        heroCharacterId: "hero-1",
        observedHeroProminence: 50,
        observedOtherProminence: 50,
        hasVisionApiResult: true,
      });
      expect(getBalanceScoreLabel(score)).toBe("balanced");
    });

    it("returns hero_heavy when hero too dominant", () => {
      const score = computeSubjectBalanceScore({
        intent: makeIntent({ dominantSubject: "enemy" }),
        heroCharacterId: "hero-1",
        observedHeroProminence: 80,
        observedOtherProminence: 20,
        hasVisionApiResult: true,
      });
      expect(getBalanceScoreLabel(score)).toBe("hero_heavy");
    });

    it("returns other_heavy when other too dominant", () => {
      const score = computeSubjectBalanceScore({
        intent: makeIntent({ dominantSubject: "hero" }),
        heroCharacterId: "hero-1",
        observedHeroProminence: 20,
        observedOtherProminence: 80,
        hasVisionApiResult: true,
      });
      expect(getBalanceScoreLabel(score)).toBe("other_heavy");
    });
  });

  describe("calculateChapterBalanceMetrics", () => {
    it("calculates aggregate metrics for chapter", () => {
      const scores = [
        computeSubjectBalanceScore({
          intent: makeIntent({ dominantSubject: "hero" }),
          heroCharacterId: "hero-1",
          observedHeroProminence: 85,
          observedOtherProminence: 15,
          hasVisionApiResult: true,
        }),
        computeSubjectBalanceScore({
          intent: makeIntent({ dominantSubject: "duo" }),
          heroCharacterId: "hero-1",
          observedHeroProminence: 50,
          observedOtherProminence: 50,
          hasVisionApiResult: true,
        }),
        computeSubjectBalanceScore({
          intent: makeIntent({ dominantSubject: "environment" }),
          heroCharacterId: "hero-1",
          hasVisionApiResult: false,
        }),
      ];

      const metrics = calculateChapterBalanceMetrics(scores);

      expect(metrics.acceptableCount).toBe(2);
      expect(metrics.rerollNeededCount).toBe(0);
      expect(metrics.cannotEvaluateCount).toBe(1);
      expect(metrics.averageDeviation).toBe(0);
    });
  });
});
