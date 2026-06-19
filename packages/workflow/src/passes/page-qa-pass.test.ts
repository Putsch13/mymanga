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

  it("échoue si grid_2x3 reçoit 7+ panels (capacité dépassée)", async () => {
    const panels = Array.from({ length: 7 }, (_, i) =>
      makePanel({ panelId: `p-${i + 1}`, panelNumberInPage: i + 1 }),
    );
    const page: StoryboardPage = {
      pageNumber: 1,
      layoutTemplate: "grid_2x3",
      dramaticRole: "setup",
      beatIds: [],
      panels,
    };
    const plan = makePlan([page]);
    const r = await runPageQaPass(plan);
    expect(r.failCount).toBe(1);
    expect(r.results[0]!.ok).toBe(false);
    expect(
      r.results[0]!.issues.some((i) => i.includes("page_panel_count_exceeds_layout_capacity")),
    ).toBe(true);
    expect(r.results[0]!.issues[0]).toMatch(/7\/6/);
  });

  it("échoue si layout template inconnu", async () => {
    const page: StoryboardPage = {
      pageNumber: 1,
      layoutTemplate: "unknown_layout_xyz" as typeof page.layoutTemplate,
      dramaticRole: "setup",
      beatIds: [],
      panels: [makePanel()],
    };
    const plan = makePlan([page]);
    const r = await runPageQaPass(plan);
    expect(r.failCount).toBe(1);
    expect(r.results[0]!.issues.some((i) => i.includes("unknown_layout_template"))).toBe(true);
  });
});
