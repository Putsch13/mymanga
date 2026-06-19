import { describe, expect, it } from "vitest";
import { validateStoryboardPlan } from "./storyboard-validator";
import type { StoryArc } from "../contracts/story-arc";
import type { StoryboardPanel, StoryboardPlan } from "../contracts/storyboard-plan";
import { createEmptyContinuityState } from "../contracts/continuity-state";

function makePanel(overrides: Partial<StoryboardPanel> = {}): StoryboardPanel {
  return {
    panelId: "p1",
    pageNumber: 1,
    panelNumberInPage: 1,
    globalPanelIndex: 0,
    sourceBeatId: "b1",
    panelPurpose: "dialogue_anchor",
    renderMode: "dialogue_two_shot",
    shotType: "medium",
    cameraAngle: "eye_level",
    subjectFocus: "group",
    cutawayType: "none",
    characters: [],
    locationId: null,
    locationName: "lab",
    actionLine: "x",
    emotionLine: "y",
    dialogue: [],
    narration: null,
    sfx: [],
    mustShow: [],
    mustNotShow: [],
    continuityNotes: [],
    visualAnchors: { characterIds: [], environmentAnchorId: null, previousPanelAnchorId: null },
    ...overrides,
  };
}

function makePlan(panels: StoryboardPanel[]): StoryboardPlan {
  return {
    chapterId: "c1",
    totalTargetPanels: panels.length,
    pages: [
      {
        pageNumber: 1,
        layoutTemplate: "grid_2x2",
        dramaticRole: "setup",
        beatIds: panels.map((p) => p.sourceBeatId),
        panels,
      },
    ],
    editorialDiagnostics: {
      varietyScore: 1,
      heroFocusRatio: 0,
      environmentRatio: 0,
      insertRatio: 0,
      reactionRatio: 0,
      warnings: [],
      blockers: [],
    },
  };
}

describe("validateStoryboardPlan", () => {
  it("refuse un panel sans renderMode", () => {
    const plan = makePlan([makePanel({ renderMode: "" as never })]);
    const r = validateStoryboardPlan(plan);
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.includes("renderMode_invalid"))).toBe(true);
  });

  it("refuse une page sans layoutTemplate valide", () => {
    const plan = makePlan([makePanel()]);
    plan.pages[0]!.layoutTemplate = "unknown_layout" as never;
    const r = validateStoryboardPlan(plan);
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.includes("layoutTemplate_invalid"))).toBe(true);
  });

  it("refuse un combat inventé sur un beat infiltration", () => {
    const arc: StoryArc = {
      chapterId: "c1",
      chapterNumber: 1,
      title: "t",
      summary: "",
      chapterGoal: "",
      cliffhanger: "",
      continuityBefore: createEmptyContinuityState(),
      continuityAfter: createEmptyContinuityState(),
      beats: [
        {
          beatId: "b1",
          order: 1,
          type: "infiltration",
          purpose: "p",
          storyEvent: "s",
          locationId: null,
          locationName: "zone",
          charactersPresent: [],
          emotionalTurn: "",
          dialogueIntent: null,
          mustReveal: [],
          mustPreserve: [],
          mustNotInvent: [],
          dangerLevel: "low",
          continuityEffects: { stateChanges: [], itemsIntroduced: [], informationLearned: [] },
        },
      ],
    };
    const plan = makePlan([makePanel({ renderMode: "combat_exchange", sourceBeatId: "b1" })]);
    const r = validateStoryboardPlan(plan, { storyArc: arc });
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.includes("combat_invented_on_infiltration_beat"))).toBe(true);
  });

  it("refuse subjectFocus=hero sur establishing_environment", () => {
    const plan = makePlan([
      makePanel({ renderMode: "establishing_environment", subjectFocus: "hero", shotType: "wide" }),
    ]);
    const r = validateStoryboardPlan(plan);
    expect(r.ok).toBe(false);
    expect(
      r.issues.some((i) => i.includes("establishing_environment_cannot_have_subjectFocus_hero")),
    ).toBe(true);
  });

  it("accepte un plan minimal valide", () => {
    const plan = makePlan([makePanel({ renderMode: "dialogue_two_shot", subjectFocus: "group" })]);
    const r = validateStoryboardPlan(plan);
    expect(r.ok).toBe(true);
  });

  describe("COMMIT D — budgets & grammaire", () => {
    function manyHeroCloseups(n: number) {
      return Array.from({ length: n }).map((_, i) =>
        makePanel({
          panelId: `hc${i}`,
          globalPanelIndex: i,
          panelNumberInPage: (i % 4) + 1,
          pageNumber: Math.floor(i / 4) + 1,
          renderMode: "hero_closeup",
          shotType: "closeup",
          subjectFocus: "hero",
          cameraAngle: "eye_level",
        }),
      );
    }

    it("strict: bloque plus de 2 hero_closeup consécutifs", () => {
      const panels = manyHeroCloseups(4);
      const plan = makePlan(panels);
      const r = validateStoryboardPlan(plan, { strict: true });
      expect(r.ok).toBe(false);
      expect(
        r.issues.some((i) => i.includes("hero_closeup_consecutive_run_too_long")),
      ).toBe(true);
    });

    it("strict: bloque un ratio hero_closeup trop élevé", () => {
      const panels = [
        ...manyHeroCloseups(5),
        makePanel({
          panelId: "env1",
          globalPanelIndex: 5,
          panelNumberInPage: 2,
          pageNumber: 2,
          renderMode: "establishing_environment",
          shotType: "wide",
          subjectFocus: "environment",
        }),
      ];
      const plan = makePlan(panels);
      const r = validateStoryboardPlan(plan, { strict: true });
      expect(r.ok).toBe(false);
      expect(r.issues.some((i) => i.includes("hero_closeup_ratio_too_high"))).toBe(true);
    });

    it("strict: bloque un ratio non-héros trop bas", () => {
      const panels = Array.from({ length: 8 }).map((_, i) =>
        makePanel({
          panelId: `h${i}`,
          globalPanelIndex: i,
          panelNumberInPage: (i % 4) + 1,
          pageNumber: Math.floor(i / 4) + 1,
          renderMode: i % 2 === 0 ? "dialogue_two_shot" : "reaction_closeup",
          shotType: i % 2 === 0 ? "medium" : "closeup",
          cameraAngle: i % 3 === 0 ? "low" : "eye_level",
          subjectFocus: "hero",
        }),
      );
      const plan = makePlan(panels);
      const r = validateStoryboardPlan(plan, { strict: true });
      expect(r.ok).toBe(false);
      expect(r.issues.some((i) => i.includes("non_hero_ratio_too_low"))).toBe(true);
    });

    it("strict: bloque un combat sans lecture spatiale (tout en closeup)", () => {
      const arc: StoryArc = {
        chapterId: "c1",
        chapterNumber: 1,
        title: "t",
        summary: "",
        chapterGoal: "",
        cliffhanger: "",
        continuityBefore: createEmptyContinuityState(),
        continuityAfter: createEmptyContinuityState(),
        beats: [
          {
            beatId: "bc",
            order: 1,
            type: "combat",
            purpose: "combat",
            storyEvent: "fight",
            locationId: null,
            locationName: "arena",
            charactersPresent: [],
            emotionalTurn: "",
            dialogueIntent: null,
            mustReveal: [],
            mustPreserve: [],
            mustNotInvent: [],
            dangerLevel: "critical",
            continuityEffects: { stateChanges: [], itemsIntroduced: [], informationLearned: [] },
          },
        ],
      };
      const panels = Array.from({ length: 4 }).map((_, i) =>
        makePanel({
          panelId: `cb${i}`,
          globalPanelIndex: i,
          pageNumber: 1,
          panelNumberInPage: i + 1,
          sourceBeatId: "bc",
          renderMode: "combat_exchange",
          shotType: "extreme_closeup",
          subjectFocus: "hero",
          cameraAngle: "eye_level",
        }),
      );
      const plan = makePlan(panels);
      const r = validateStoryboardPlan(plan, { storyArc: arc, strict: true });
      expect(r.ok).toBe(false);
      expect(
        r.issues.some(
          (i) =>
            i.includes("combat_beat_missing_spatial_read") ||
            i.includes("combat_beat_closeup_only"),
        ),
      ).toBe(true);
    });

    it("strict: bloque une répétition de signature >= 3 panels consécutifs", () => {
      const panels = Array.from({ length: 3 }).map((_, i) =>
        makePanel({
          panelId: `r${i}`,
          globalPanelIndex: i,
          pageNumber: 1,
          panelNumberInPage: i + 1,
          renderMode: "dialogue_two_shot",
          shotType: "medium",
          cameraAngle: "eye_level",
          subjectFocus: "group",
        }),
      );
      const plan = makePlan(panels);
      const r = validateStoryboardPlan(plan, { strict: true });
      expect(r.ok).toBe(false);
      expect(r.issues.some((i) => i.includes("repetitive_signature_run"))).toBe(true);
    });

    it("non-strict: les mêmes violations passent en warnings", () => {
      const panels = manyHeroCloseups(4);
      const plan = makePlan(panels);
      const r = validateStoryboardPlan(plan, { strict: false });
      expect(r.ok).toBe(true);
      expect(
        r.warnings.some((w) => w.includes("hero_closeup_consecutive_run_too_long")),
      ).toBe(true);
    });
  });
});
