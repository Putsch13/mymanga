import { describe, expect, it } from "vitest";
import { runPageQaPass } from "./page-qa-pass";
import type { StoryboardPlan } from "@manga-ai-studio/ai";
import type { StoryboardPage, StoryboardPanel } from "@manga-ai-studio/ai/contracts";

function makePanel(overrides: Partial<StoryboardPanel> = {}): StoryboardPanel {
  return {
    panelId: "p",
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
    actionLine: "",
    emotionLine: "",
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

function makePage(pageNumber: number, panels: StoryboardPanel[], dramaticRole = "setup"): StoryboardPage {
  return {
    pageNumber,
    layoutTemplate: "grid_2x2",
    dramaticRole,
    beatIds: [],
    panels,
  };
}

function makePlan(pages: StoryboardPage[]): StoryboardPlan {
  return {
    chapterId: "c",
    totalTargetPanels: pages.reduce((n, p) => n + p.panels.length, 0),
    pages,
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

describe("runPageQaPass", () => {
  it("détecte 3 pages consécutives full hero closeup", async () => {
    const heroPage = (n: number) =>
      makePage(n, [
        makePanel({ renderMode: "hero_closeup", subjectFocus: "hero" }),
        makePanel({ renderMode: "hero_closeup", subjectFocus: "hero" }),
      ]);
    const plan = makePlan([heroPage(1), heroPage(2), heroPage(3)]);
    const r = await runPageQaPass(plan);
    expect(r.results[2]!.warnings).toContain("three_consecutive_hero_closeup_pages");
  });

  it("détecte un saut de pageNumber", async () => {
    const plan = makePlan([
      makePage(1, [makePanel()]),
      makePage(3, [makePanel()]),
    ]);
    const r = await runPageQaPass(plan);
    expect(r.results[1]!.issues.some((i) => i.includes("page_number_jump"))).toBe(true);
    expect(r.failCount).toBe(1);
  });

  it("warning sur dialogue_tension page sans dialogue panel", async () => {
    const plan = makePlan([
      makePage(
        1,
        [makePanel({ renderMode: "establishing_environment" })],
        "dialogue_tension",
      ),
    ]);
    const r = await runPageQaPass(plan);
    expect(r.results[0]!.warnings).toContain("dialogue_tension_page_without_dialogue_panel");
  });
});
