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
    panelPurpose: "test",
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
});
