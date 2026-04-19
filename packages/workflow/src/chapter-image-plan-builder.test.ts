import { describe, it, expect } from "vitest";
import {
  buildChapterImagePlan,
  resolveImageIntent,
  resolveDominantSubjectForIntent,
  validateChapterImagePlan,
  type ChapterBeatPlanInput,
  type ChapterPanelPlanInput,
  type ChapterImagePlanBuilderInput,
} from "./chapter-image-plan-builder";

function makePanel(overrides: Partial<ChapterPanelPlanInput> & { pageIndex: number; panelIndex: number }): ChapterPanelPlanInput {
  return {
    subjectFocus: null,
    cutawayType: null,
    shotType: "medium",
    cameraAngle: null,
    mood: null,
    panelCharacterRoles: [],
    panelCharacterNames: [],
    npcPresence: [],
    npcGroupPresence: [],
    requiredProps: [],
    mustShowLocationSignals: [],
    dialogueLines: [],
    narrativeContext: [],
    beatType: null,
    ...overrides,
  };
}

function makeBeat(overrides: Partial<ChapterBeatPlanInput> & { beatId: string; beatIndex: number }): ChapterBeatPlanInput {
  return {
    beatType: "action",
    beatTitle: "Beat",
    storyFunction: "rising_action",
    allocatedImages: 7,
    panels: [],
    ...overrides,
  };
}

describe("resolveImageIntent", () => {
  it("routes cutawayType=environment to environment_establishing", () => {
    const panel = makePanel({ pageIndex: 0, panelIndex: 0, cutawayType: "environment" });
    const beat = makeBeat({ beatId: "b1", beatIndex: 0 });
    expect(resolveImageIntent(panel, beat)).toBe("environment_establishing");
  });

  it("routes cutawayType=prop_insert to prop_insert (never hero)", () => {
    const panel = makePanel({
      pageIndex: 0,
      panelIndex: 0,
      cutawayType: "prop_insert",
      panelCharacterRoles: ["hero"],
    });
    const beat = makeBeat({ beatId: "b1", beatIndex: 0 });
    expect(resolveImageIntent(panel, beat)).toBe("prop_insert");
  });

  it("routes cutawayType=npc_group to guard_group_focus", () => {
    const panel = makePanel({
      pageIndex: 0,
      panelIndex: 0,
      cutawayType: "npc_group",
      panelCharacterRoles: ["hero"],
    });
    const beat = makeBeat({ beatId: "b1", beatIndex: 0 });
    expect(resolveImageIntent(panel, beat)).toBe("guard_group_focus");
  });

  it("routes cutawayType=crowd to crowd_presence", () => {
    const panel = makePanel({ pageIndex: 0, panelIndex: 0, cutawayType: "crowd" });
    const beat = makeBeat({ beatId: "b1", beatIndex: 0 });
    expect(resolveImageIntent(panel, beat)).toBe("crowd_presence");
  });

  it("routes enemy reveal beat to enemy_reveal", () => {
    const panel = makePanel({
      pageIndex: 0,
      panelIndex: 0,
      subjectFocus: "enemy",
      panelCharacterRoles: ["enemy"],
      beatType: "villain_introduction",
    });
    const beat = makeBeat({ beatId: "b1", beatIndex: 0, beatType: "reveal" });
    expect(resolveImageIntent(panel, beat)).toBe("enemy_reveal");
  });

  it("routes hero + other with dialogue beat to dialogue_two_shot", () => {
    const panel = makePanel({
      pageIndex: 0,
      panelIndex: 0,
      panelCharacterRoles: ["hero", "ally"],
      beatType: "dialogue_scene",
    });
    const beat = makeBeat({ beatId: "b1", beatIndex: 0 });
    expect(resolveImageIntent(panel, beat)).toBe("dialogue_two_shot");
  });

  it("routes hero-only closeup emotion beat to hero_emotion", () => {
    const panel = makePanel({
      pageIndex: 0,
      panelIndex: 0,
      panelCharacterRoles: ["hero"],
      shotType: "closeup",
      beatType: "emotion",
    });
    const beat = makeBeat({ beatId: "b1", beatIndex: 0 });
    expect(resolveImageIntent(panel, beat)).toBe("hero_emotion");
  });

  it("routes guards subjectFocus to guard_group_focus", () => {
    const panel = makePanel({
      pageIndex: 0,
      panelIndex: 0,
      subjectFocus: "guards",
    });
    const beat = makeBeat({ beatId: "b1", beatIndex: 0 });
    expect(resolveImageIntent(panel, beat)).toBe("guard_group_focus");
  });

  it("falls back to environment_establishing when nothing is known", () => {
    const panel = makePanel({ pageIndex: 0, panelIndex: 0 });
    const beat = makeBeat({ beatId: "b1", beatIndex: 0 });
    expect(resolveImageIntent(panel, beat)).toBe("environment_establishing");
  });
});

describe("resolveDominantSubjectForIntent", () => {
  it("maps every intent to a dominant subject", () => {
    const tests: Array<[ReturnType<typeof resolveImageIntent>, string]> = [
      ["hero_focus", "hero"],
      ["hero_duo", "duo"],
      ["enemy_focus", "enemy"],
      ["guard_group_focus", "guard_group"],
      ["crowd_presence", "crowd"],
      ["environment_establishing", "environment"],
      ["prop_insert", "prop"],
      ["reaction_cutaway", "reaction"],
      ["aftermath", "aftermath"],
      ["combat_exchange", "duo"],
    ];
    for (const [intent, expected] of tests) {
      expect(resolveDominantSubjectForIntent(intent)).toBe(expected);
    }
  });
});

describe("buildChapterImagePlan", () => {
  function makeChapterInput(panelCount = 72): ChapterImagePlanBuilderInput {
    const beats: ChapterBeatPlanInput[] = [];
    let pageIndex = 0;
    let panelIndex = 0;
    const panelsPerBeat = Math.ceil(panelCount / 10);
    for (let b = 0; b < 10; b++) {
      const panels: ChapterPanelPlanInput[] = [];
      for (let p = 0; p < panelsPerBeat && beats.flatMap((x) => x.panels).length + panels.length < panelCount; p++) {
        panels.push(
          makePanel({
            pageIndex,
            panelIndex,
            panelCharacterRoles: ["hero"],
            panelCharacterNames: ["Lyra"],
          }),
        );
        panelIndex++;
        if (panelIndex % 4 === 0) pageIndex++;
      }
      beats.push(makeBeat({ beatId: `b${b}`, beatIndex: b, panels }));
    }
    return {
      projectId: "proj1",
      chapterId: "ch1",
      mangaStyleProfile: "shonen_classic",
      contentRating: "teen",
      totalImageTarget: panelCount,
      beats,
    };
  }

  it("produces one item per panel with stable imageId", () => {
    const plan = buildChapterImagePlan(makeChapterInput(72));
    expect(plan).toHaveLength(72);
    expect(new Set(plan.map((p) => p.imageId)).size).toBe(72);
    expect(plan[0].imageId).toMatch(/^ch1__p\d+__pnl\d+$/);
  });

  it("always sets promptLanguage=en", () => {
    const plan = buildChapterImagePlan(makeChapterInput(72));
    for (const item of plan) {
      expect(item.promptLanguage).toBe("en");
    }
  });

  it("sets heroPresenceMode=silhouette for environment_establishing with hero in scene", () => {
    const input: ChapterImagePlanBuilderInput = {
      projectId: "p1",
      chapterId: "c1",
      mangaStyleProfile: "shonen",
      contentRating: "teen",
      totalImageTarget: 1,
      beats: [
        makeBeat({
          beatId: "b1",
          beatIndex: 0,
          panels: [
            makePanel({
              pageIndex: 0,
              panelIndex: 0,
              cutawayType: "environment_establishing",
              panelCharacterRoles: ["hero"],
            }),
          ],
        }),
      ],
    };
    const plan = buildChapterImagePlan(input);
    expect(plan[0].imageIntentType).toBe("environment_establishing");
    expect(plan[0].heroPresenceMode).toBe("silhouette");
    expect(plan[0].heroVisualWeight).toBeLessThan(0.3);
  });

  it("forbids hero_lock on prop_insert even if hero in panel", () => {
    const input: ChapterImagePlanBuilderInput = {
      projectId: "p1",
      chapterId: "c1",
      mangaStyleProfile: "shonen",
      contentRating: "teen",
      totalImageTarget: 1,
      beats: [
        makeBeat({
          beatId: "b1",
          beatIndex: 0,
          panels: [
            makePanel({
              pageIndex: 0,
              panelIndex: 0,
              cutawayType: "prop_insert",
              panelCharacterRoles: ["hero"],
            }),
          ],
        }),
      ],
    };
    const plan = buildChapterImagePlan(input);
    expect(plan[0].forbiddenFocus).toContain("hero_lock");
    expect(plan[0].forbiddenFocus).toContain("hero_portrait");
    expect(plan[0].propPriority).toBeGreaterThan(plan[0].characterPriority);
  });

  it("assigns higher groupPriority than characterPriority on guard_group_focus", () => {
    const input: ChapterImagePlanBuilderInput = {
      projectId: "p1",
      chapterId: "c1",
      mangaStyleProfile: "shonen",
      contentRating: "teen",
      totalImageTarget: 1,
      beats: [
        makeBeat({
          beatId: "b1",
          beatIndex: 0,
          panels: [
            makePanel({
              pageIndex: 0,
              panelIndex: 0,
              cutawayType: "npc_group",
              panelCharacterRoles: ["hero"],
            }),
          ],
        }),
      ],
    };
    const plan = buildChapterImagePlan(input);
    expect(plan[0].imageIntentType).toBe("guard_group_focus");
    expect(plan[0].groupPriority).toBeGreaterThan(plan[0].characterPriority);
  });

  it("produces environment-dominant plan when all panels are wide establishers", () => {
    const input: ChapterImagePlanBuilderInput = {
      projectId: "p1",
      chapterId: "c1",
      mangaStyleProfile: "shonen",
      contentRating: "teen",
      totalImageTarget: 3,
      beats: [
        makeBeat({
          beatId: "b1",
          beatIndex: 0,
          panels: [
            makePanel({ pageIndex: 0, panelIndex: 0, cutawayType: "environment" }),
            makePanel({ pageIndex: 0, panelIndex: 1, cutawayType: "environment" }),
            makePanel({ pageIndex: 0, panelIndex: 2, cutawayType: "environment" }),
          ],
        }),
      ],
    };
    const plan = buildChapterImagePlan(input);
    for (const item of plan) {
      expect(item.dominantSubject).toBe("environment");
      expect(item.environmentPriority).toBeGreaterThan(60);
    }
  });
});

describe("validateChapterImagePlan", () => {
  it("flags too-short plans", () => {
    const result = validateChapterImagePlan([], 60, 80);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.includes("PLAN_TOO_SHORT"))).toBe(true);
  });

  it("warns when hero-dominant ratio > 55%", () => {
    const plan = buildChapterImagePlan({
      projectId: "p",
      chapterId: "c",
      mangaStyleProfile: "s",
      contentRating: "teen",
      totalImageTarget: 70,
      beats: Array.from({ length: 10 }).map((_, b) =>
        ({
          beatId: `b${b}`,
          beatIndex: b,
          beatType: "hero_moment",
          beatTitle: "",
          storyFunction: "arc",
          allocatedImages: 7,
          panels: Array.from({ length: 7 }).map((_, p) => ({
            pageIndex: b,
            panelIndex: p,
            subjectFocus: null,
            cutawayType: null,
            shotType: "medium",
            panelCharacterRoles: ["hero"],
            panelCharacterNames: ["Lyra"],
            npcPresence: [],
            npcGroupPresence: [],
            requiredProps: [],
            mustShowLocationSignals: [],
            dialogueLines: [],
            narrativeContext: [],
            beatType: "hero_action",
            cameraAngle: null,
            mood: null,
          })),
        }),
      ),
    });
    const result = validateChapterImagePlan(plan);
    expect(result.warnings.some((w) => w.includes("HERO_BIAS_SUSPICIOUS"))).toBe(true);
  });

  it("reports intent distribution", () => {
    const plan = buildChapterImagePlan({
      projectId: "p",
      chapterId: "c",
      mangaStyleProfile: "s",
      contentRating: "teen",
      totalImageTarget: 6,
      beats: [
        {
          beatId: "b",
          beatIndex: 0,
          beatType: "mixed",
          beatTitle: "",
          storyFunction: "arc",
          allocatedImages: 6,
          panels: [
            { pageIndex: 0, panelIndex: 0, cutawayType: "environment", panelCharacterRoles: [], panelCharacterNames: [], npcPresence: [], npcGroupPresence: [], requiredProps: [], mustShowLocationSignals: [], dialogueLines: [], narrativeContext: [], shotType: "wide", beatType: null, subjectFocus: null, cameraAngle: null, mood: null },
            { pageIndex: 0, panelIndex: 1, cutawayType: "prop_insert", panelCharacterRoles: [], panelCharacterNames: [], npcPresence: [], npcGroupPresence: [], requiredProps: [], mustShowLocationSignals: [], dialogueLines: [], narrativeContext: [], shotType: "medium", beatType: null, subjectFocus: null, cameraAngle: null, mood: null },
            { pageIndex: 0, panelIndex: 2, cutawayType: "crowd", panelCharacterRoles: [], panelCharacterNames: [], npcPresence: [], npcGroupPresence: [], requiredProps: [], mustShowLocationSignals: [], dialogueLines: [], narrativeContext: [], shotType: "medium", beatType: null, subjectFocus: null, cameraAngle: null, mood: null },
            { pageIndex: 0, panelIndex: 3, cutawayType: "npc_group", panelCharacterRoles: [], panelCharacterNames: [], npcPresence: [], npcGroupPresence: [], requiredProps: [], mustShowLocationSignals: [], dialogueLines: [], narrativeContext: [], shotType: "medium", beatType: null, subjectFocus: null, cameraAngle: null, mood: null },
            { pageIndex: 0, panelIndex: 4, cutawayType: null, panelCharacterRoles: ["hero"], panelCharacterNames: ["Lyra"], npcPresence: [], npcGroupPresence: [], requiredProps: [], mustShowLocationSignals: [], dialogueLines: [], narrativeContext: [], shotType: "medium", beatType: "action", subjectFocus: null, cameraAngle: null, mood: null },
            { pageIndex: 0, panelIndex: 5, cutawayType: "reaction", panelCharacterRoles: ["hero"], panelCharacterNames: ["Lyra"], npcPresence: [], npcGroupPresence: [], requiredProps: [], mustShowLocationSignals: [], dialogueLines: [], narrativeContext: [], shotType: "closeup", beatType: null, subjectFocus: null, cameraAngle: null, mood: null },
          ],
        },
      ],
    });
    const dist = validateChapterImagePlan(plan, 0, 100).intentDistribution;
    expect(dist["environment_establishing"]).toBe(1);
    expect(dist["prop_insert"]).toBe(1);
    expect(dist["crowd_presence"]).toBe(1);
    expect(dist["guard_group_focus"]).toBe(1);
    expect(dist["reaction_cutaway"]).toBe(1);
  });
});
