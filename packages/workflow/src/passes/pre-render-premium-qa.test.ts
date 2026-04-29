import { describe, expect, it } from "vitest";
import type { StoryboardPanel, StoryboardPlan } from "@manga-ai-studio/ai/contracts";
import { runPreRenderPremiumQa, runPreRenderPremiumQaOrThrow } from "./pre-render-premium-qa";

function makePanel(overrides: Partial<StoryboardPanel>): StoryboardPanel {
  return {
    panelId: overrides.panelId ?? "p0",
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
    actionLine: overrides.actionLine ?? "Calme slice-of-life beat.",
    emotionLine: "y",
    dialogue: [{ speaker: "a", text: "Salut." }],
    narration: undefined,
    sfx: [] as string[],
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
        beatIds: ["b1"],
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

describe("runPreRenderPremiumQa — texte panel (contrat unique)", () => {
  it("compte le dialogue présent uniquement dans panelTextBundle", () => {
    const plan = makePlan([
      {
        ...makePanel({
          dialogue: [],
          actionLine: "Le combat s'intensifie.",
        }),
        panelTextBundle: { dialogues: [{ speaker: "A", text: "Tiens ça !" }], narration: null, sfx: [] },
      } as StoryboardPanel,
    ]);
    const result = runPreRenderPremiumQa({
      storyboardPlan: plan,
      chapterSummary: "Combat et explosion sur le champ.",
      chapterUserIntent: null,
      chapterLocationName: null,
      mainCharacterNames: [],
    });
    expect(result.stats.hasDialogueOrSfx).toBe(true);
    expect(result.issues.find((i) => i.includes("action_chapter_without_dialogue"))).toBeUndefined();
  });
});

describe("runPreRenderPremiumQaOrThrow — repeated prompts repair", () => {
  it("répare les empreintes dupliquées au lieu d’échouer immédiatement", () => {
    const dup = "Identical action line for fingerprint collision test.";
    const panels = Array.from({ length: 12 }, (_, i) =>
      makePanel({
        panelId: `panel_${i + 1}`,
        globalPanelIndex: i,
        actionLine: dup,
      }),
    );
    const plan = makePlan(panels);

    expect(() =>
      runPreRenderPremiumQaOrThrow({
        storyboardPlan: plan,
        chapterSummary: "Promenade tranquille au parc.",
        chapterUserIntent: null,
        chapterLocationName: null,
        mainCharacterNames: [],
      }),
    ).not.toThrow();

    const varied = new Set(plan.pages.flatMap((p) => p.panels.map((x) => x.actionLine)));
    expect(varied.size).toBeGreaterThan(1);
  });
});
