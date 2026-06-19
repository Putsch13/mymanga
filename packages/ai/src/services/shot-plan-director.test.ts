import { describe, it, expect } from "vitest";
import {
  directShotPlan,
  resolveBeatIntent,
  getPatternForIntent,
  getTemplateForIntent,
} from "./shot-plan-director";

const COMBAT_BEATS = [
  { id: "b1", pageRole: "establishing", characters: ["Kaito", "Yuki"], location: "forest" },
  { id: "b2", pageRole: "confrontation", characters: ["Kaito", "Raijin", "Soldier"], location: "battlefield" },
  { id: "b3", pageRole: "action", characters: ["Kaito", "Raijin"], location: "battlefield" },
  { id: "b4", pageRole: "revelation", characters: ["Kaito"], location: "battlefield" },
  { id: "b5", pageRole: "cliffhanger", characters: ["Kaito", "Raijin"], location: "battlefield" },
];

const CHARS = [
  { characterId: "c1", name: "Kaito", role: "hero" as const },
  { characterId: "c2", name: "Raijin", role: "antagonist" as const },
  { characterId: "c3", name: "Yuki", role: "important_npc" as const, firstAppearanceSceneIndex: 0 },
];

describe("directShotPlan", () => {
  it("génère un plan pour chaque beat", () => {
    const plan = directShotPlan({
      beats: COMBAT_BEATS,
      genreMode: "shonen",
      importantCharacters: CHARS,
    });
    expect(plan.pages).toHaveLength(5);
    expect(plan.rhythm).toBe("kinetic");
  });

  it("scène de combat → emphasis contient ≥ 1 extreme_closeup", () => {
    const plan = directShotPlan({
      beats: COMBAT_BEATS,
      genreMode: "shonen",
      importantCharacters: CHARS,
    });
    const hasExtremeCloseup = plan.emphasis.some((e) => e.device === "extreme_closeup");
    expect(hasExtremeCloseup).toBe(true);
  });

  it("introduction PNJ → ≥ 1 closeup sur ce PNJ", () => {
    const plan = directShotPlan({
      beats: COMBAT_BEATS,
      genreMode: "shonen",
      importantCharacters: CHARS,
    });
    const firstPage = plan.pages[0];
    const hasNpcCloseup = firstPage.panels.some(
      (p) => p.subjectFocus === "important_npc" && p.shotType === "closeup",
    );
    expect(hasNpcCloseup).toBe(true);
  });

  it("aspect_to_aspect transitions ≥ 1 par scène (respiration)", () => {
    const plan = directShotPlan({
      beats: COMBAT_BEATS,
      genreMode: "shonen",
      importantCharacters: CHARS,
    });
    const allTransitions = plan.pages.flatMap((p) => p.panels.map((panel) => panel.transitionFromPrevious));
    const aspectToAspect = allTransitions.filter((t) => t === "aspect_to_aspect");
    expect(aspectToAspect.length).toBeGreaterThanOrEqual(1);
  });

  it("diversityTargets respectés (genre shonen)", () => {
    const plan = directShotPlan({
      beats: COMBAT_BEATS,
      genreMode: "shonen",
      importantCharacters: CHARS,
    });
    expect(plan.diversityTargets.wide).toBeCloseTo(0.20, 1);
    expect(plan.diversityTargets.medium).toBeCloseTo(0.35, 1);
    expect(plan.diversityTargets.closeup).toBeCloseTo(0.30, 1);
  });

  it("revelation → page template splash", () => {
    const plan = directShotPlan({
      beats: COMBAT_BEATS,
      genreMode: "shonen",
      importantCharacters: CHARS,
    });
    const revelationPage = plan.pages[3];
    expect(revelationPage.template).toBe("splash");
  });

  it("antagoniste présent → angle contre-plongée (low)", () => {
    const plan = directShotPlan({
      beats: COMBAT_BEATS,
      genreMode: "shonen",
      importantCharacters: CHARS,
    });
    const confrontationPage = plan.pages[1];
    const antagPanel = confrontationPage.panels.find((p) => p.subjectFocus === "antagonist");
    expect(antagPanel?.cameraAngle).toBe("low");
  });

  it("BUG-17 : templates alignés sur le vocabulaire reader (PAGE_LAYOUT_CONFIGS)", () => {
    const plan = directShotPlan({
      beats: COMBAT_BEATS,
      genreMode: "shonen",
      importantCharacters: CHARS,
    });
    const READER_TEMPLATES = new Set([
      "splash",
      "double_spread",
      "grid_2x2",
      "grid_2x3",
      "action_strip",
      "asymmetric_hero",
      "cinematic_bar",
      "focus_closeup",
      "montage_rapid",
      "vertical_strip",
    ]);
    for (const page of plan.pages) {
      expect(READER_TEMPLATES.has(page.template)).toBe(true);
    }
  });

  it("BUG-17 : cliffhanger → double_spread (template désormais effectivement émis)", () => {
    const plan = directShotPlan({
      beats: COMBAT_BEATS,
      genreMode: "shonen",
      importantCharacters: CHARS,
    });
    const cliffhangerPage = plan.pages[4];
    expect(cliffhangerPage.template).toBe("double_spread");
  });

  it("genre romance → rhythm contemplative", () => {
    const plan = directShotPlan({
      beats: [
        { id: "b1", pageRole: "dialogue", characters: ["Hana", "Ren"], location: "café" },
        { id: "b2", pageRole: "escalation", characters: ["Hana", "Ren"], location: "park" },
      ],
      genreMode: "romance",
      importantCharacters: [],
    });
    expect(plan.rhythm).toBe("contemplative");
  });
});

describe("shot-plan-director — Phase 1 intent-driven behavior", () => {
  it("resolveBeatIntent: confrontation legacy → dialogue_tension, pas combat", () => {
    const intent = resolveBeatIntent({ id: "b", pageRole: "confrontation" });
    expect(intent.storyFunction).toBe("dialogue_tension");
    expect(intent.actionEnvelope).toBe("none");
    expect(intent.explicitCombat).toBe(false);
  });

  it("resolveBeatIntent: pageRole=action → explicitCombat true", () => {
    const intent = resolveBeatIntent({ id: "b", pageRole: "action" });
    expect(intent.explicitCombat).toBe(true);
    expect(intent.actionEnvelope).toBe("combat_full");
  });

  it("resolveBeatIntent: storyFunction dialogue_tension override domine pageRole=action", () => {
    const intent = resolveBeatIntent({
      id: "b",
      pageRole: "action",
      storyFunction: "dialogue_tension",
    });
    expect(intent.storyFunction).toBe("dialogue_tension");
    expect(intent.explicitCombat).toBe(false);
    expect(intent.actionEnvelope).toBe("none");
  });

  it("resolveBeatIntent: storyFunction movement + envelope combat_full → explicitCombat", () => {
    const intent = resolveBeatIntent({
      id: "b",
      storyFunction: "movement",
      actionEnvelope: "combat_full",
    });
    expect(intent.explicitCombat).toBe(true);
  });

  it("getPatternForIntent: dialogue_tension + none → DIALOGUE_PATTERN, jamais ACTION_PATTERN", () => {
    const pattern = getPatternForIntent({
      storyFunction: "dialogue_tension",
      actionEnvelope: "none",
      legacyPageRole: "",
      explicitCombat: false,
    });
    expect(pattern).toEqual(["medium", "over_shoulder", "closeup", "medium"]);
  });

  it("getPatternForIntent: combat_full → ACTION_PATTERN", () => {
    const pattern = getPatternForIntent({
      storyFunction: "movement",
      actionEnvelope: "combat_full",
      legacyPageRole: "",
      explicitCombat: true,
    });
    expect(pattern).toEqual(["wide", "medium", "closeup", "medium"]);
  });

  it("getTemplateForIntent: combat envelope → asymmetric_hero", () => {
    const cfg = getTemplateForIntent({
      storyFunction: "movement",
      actionEnvelope: "combat_full",
      legacyPageRole: "",
      explicitCombat: true,
    });
    expect(cfg.pageTemplate).toBe("asymmetric_hero");
  });

  it("directShotPlan: confrontation sans explicit combat → aucun panel n'hérite d'angle low via explicitCombat", () => {
    // Avec la règle Phase 1, pageRole=confrontation n'active plus combat, donc
    // aucun forçage low-angle panel 0 via explicitCombat. Seul l'antag emphasis
    // peut encore placer un low.
    const plan = directShotPlan({
      beats: [
        {
          id: "b",
          pageRole: "confrontation",
          characters: ["Kaito", "Yuki"],
          location: "rooftop",
        },
      ],
      genreMode: "shonen",
      importantCharacters: [
        { characterId: "c1", name: "Kaito", role: "hero" as const },
      ],
    });
    const panel0 = plan.pages[0].panels[0];
    // Sans antag, pas de low angle forcé par explicitCombat — donc eye_level/high.
    expect(panel0.cameraAngle).not.toBe("low");
  });

  it("directShotPlan: storyFunction dialogue_tension → template non-asymmetric_hero", () => {
    const plan = directShotPlan({
      beats: [
        {
          id: "b",
          storyFunction: "dialogue_tension",
          actionEnvelope: "none",
          characters: ["A", "B"],
          location: "rooftop",
        },
      ],
      genreMode: "shonen",
      importantCharacters: [],
    });
    expect(plan.pages[0].template).not.toBe("asymmetric_hero");
  });

  it("directShotPlan: storyFunction movement + combat_full → template asymmetric_hero", () => {
    const plan = directShotPlan({
      beats: [
        {
          id: "b",
          storyFunction: "movement",
          actionEnvelope: "combat_full",
          characters: ["A", "B"],
          location: "arena",
        },
      ],
      genreMode: "shonen",
      importantCharacters: [],
    });
    expect(plan.pages[0].template).toBe("asymmetric_hero");
  });
});
