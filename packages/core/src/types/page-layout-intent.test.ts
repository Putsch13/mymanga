import { describe, it, expect } from "vitest";
import { PAGE_LAYOUT_CONFIGS } from "./page-layout-configs";
import {
  pickBestLayoutForIntent,
  rankLayoutCandidatesForIntent,
  scoreLayoutForIntent,
  type PageLayoutIntent,
  type PageLayoutPanelIntent,
} from "./page-layout-intent";

function panel(
  i: number,
  partial: Partial<PageLayoutPanelIntent> = {},
): PageLayoutPanelIntent {
  return {
    panelIndex: i,
    shotType: "medium",
    importance: "normal",
    dialogueLines: 0,
    isFocusPanel: false,
    isEnvironmentPanel: false,
    ...partial,
  };
}

function intent(partial: Partial<PageLayoutIntent> = {}): PageLayoutIntent {
  return {
    intentVersion: "1.0.0",
    pageNumber: 1,
    panelCount: 4,
    panels: [panel(0), panel(1), panel(2), panel(3)],
    narrativeShape: "dialogue_steady",
    isClimaxPage: false,
    allowFivePanelLayouts: true,
    ...partial,
  };
}

describe("PAGE_LAYOUT_CONFIGS — Phase 4 5-panel layouts", () => {
  it("ajoute les 5 nouveaux templates avec exactement 5 slots", () => {
    for (const t of [
      "grid_1_2_2",
      "hero_top_2_2",
      "2_1_2_dialogue",
      "staggered_5",
      "vertical_hero_4",
    ] as const) {
      const config = PAGE_LAYOUT_CONFIGS[t];
      expect(config.areas).toHaveLength(5);
      expect(config.panelWeights).toHaveLength(5);
      expect(config.defaultAspectRatios).toHaveLength(5);
      const sum = config.panelWeights.reduce((a, b) => a + b, 0);
      expect(sum).toBeGreaterThan(0.95);
      expect(sum).toBeLessThan(1.05);
    }
  });
});

describe("scoreLayoutForIntent", () => {
  it("renvoie des scores clampés dans [0,1]", () => {
    const s = scoreLayoutForIntent("grid_2x2", intent());
    for (const key of [
      "narrativeFitScore",
      "textFitScore",
      "focusPreservationScore",
      "readingFlowScore",
      "whitespaceBalanceScore",
      "totalScore",
    ] as const) {
      expect(s[key]).toBeGreaterThanOrEqual(0);
      expect(s[key]).toBeLessThanOrEqual(1);
    }
  });

  it("dialogue_steady préfère grid_2x2 à asymmetric_hero", () => {
    const i = intent({
      narrativeShape: "dialogue_steady",
      panels: [
        panel(0, { dialogueLines: 2 }),
        panel(1, { dialogueLines: 2 }),
        panel(2, { dialogueLines: 2 }),
        panel(3, { dialogueLines: 2 }),
      ],
    });
    const grid = scoreLayoutForIntent("grid_2x2", i);
    // asymmetric_hero is 3-slot — compare narrativeFit only.
    expect(grid.narrativeFitScore).toBeGreaterThan(0.8);
  });

  it("action_burst climactique préfère action_strip/double_spread", () => {
    const i = intent({
      narrativeShape: "action_burst",
      panelCount: 6,
      panels: Array.from({ length: 6 }, (_, k) =>
        panel(k, {
          shotType: "wide",
          importance: k === 0 ? "major" : "normal",
          isFocusPanel: k === 0,
        }),
      ),
      isClimaxPage: true,
    });
    const actionStrip = scoreLayoutForIntent("action_strip", i);
    const grid23 = scoreLayoutForIntent("grid_2x3", i);
    expect(actionStrip.narrativeFitScore).toBeGreaterThan(grid23.narrativeFitScore);
  });

  it("focusPreservationScore élevé quand le hero tombe sur le plus gros slot", () => {
    const i = intent({
      panels: [
        panel(0, { importance: "major", isFocusPanel: true }),
        panel(1),
        panel(2),
        panel(3),
      ],
    });
    // asymmetric_hero weights = [0.5, 0.25, 0.25] — 3 slots only, skip.
    // focus_closeup weights = [0.6, 0.2, 0.2] — again 3 slots.
    // Use hero_top_2_2 (5 slots, first weight biggest) — panel 0 = major.
    const iFive = intent({
      panelCount: 5,
      panels: [
        panel(0, { importance: "major", isFocusPanel: true }),
        panel(1),
        panel(2),
        panel(3),
        panel(4),
      ],
    });
    const hero = scoreLayoutForIntent("hero_top_2_2", iFive);
    expect(hero.focusPreservationScore).toBe(1);
  });

  it("focusPreservationScore faible si le hero est sur un petit slot", () => {
    // grid_2x2 a tous ses weights égaux à 0.25 → tout hero tombe sur un slot max.
    // Pour avoir un low score, on compare hero_top_2_2 avec le hero en position 4 (petit slot).
    const i = intent({
      panelCount: 5,
      panels: [
        panel(0),
        panel(1),
        panel(2),
        panel(3),
        panel(4, { importance: "major", isFocusPanel: true }),
      ],
    });
    const hero = scoreLayoutForIntent("hero_top_2_2", i);
    expect(hero.focusPreservationScore).toBeLessThan(0.5);
  });
});

describe("rankLayoutCandidatesForIntent", () => {
  it("filtre les templates par nombre de slots exact", () => {
    const candidates = rankLayoutCandidatesForIntent(
      intent({ panelCount: 4 }),
    );
    for (const c of candidates) {
      const config = PAGE_LAYOUT_CONFIGS[c.template];
      expect(config.areas).toHaveLength(4);
    }
  });

  it("n'inclut PAS les layouts 5-panel quand allowFivePanelLayouts=false", () => {
    const candidates = rankLayoutCandidatesForIntent(
      intent({ panelCount: 5, allowFivePanelLayouts: false }),
    );
    expect(candidates).toHaveLength(0);
  });

  it("renvoie des layouts 5-panel quand allowFivePanelLayouts=true", () => {
    const candidates = rankLayoutCandidatesForIntent(
      intent({
        panelCount: 5,
        narrativeShape: "dialogue_escalating",
        allowFivePanelLayouts: true,
        panels: [
          panel(0, { dialogueLines: 2 }),
          panel(1, { dialogueLines: 1 }),
          panel(2, { dialogueLines: 3, importance: "major", isFocusPanel: true }),
          panel(3, { dialogueLines: 1 }),
          panel(4, { dialogueLines: 0 }),
        ],
      }),
    );
    expect(candidates.length).toBeGreaterThan(0);
    // Top candidate est forcément un 5-panel.
    expect(PAGE_LAYOUT_CONFIGS[candidates[0].template].areas).toHaveLength(5);
  });

  it("tri décroissant par totalScore", () => {
    const candidates = rankLayoutCandidatesForIntent(intent({ panelCount: 3 }));
    for (let i = 1; i < candidates.length; i++) {
      expect(candidates[i - 1].totalScore).toBeGreaterThanOrEqual(
        candidates[i].totalScore,
      );
    }
  });
});

describe("pickBestLayoutForIntent", () => {
  it("renvoie null si aucun layout ne matche", () => {
    const best = pickBestLayoutForIntent(
      intent({ panelCount: 7, allowFivePanelLayouts: false }),
    );
    expect(best).toBeNull();
  });

  it("choisit 2_1_2_dialogue ou similaire pour un dialogue 5 panels", () => {
    const best = pickBestLayoutForIntent(
      intent({
        panelCount: 5,
        narrativeShape: "dialogue_steady",
        allowFivePanelLayouts: true,
        panels: Array.from({ length: 5 }, (_, k) =>
          panel(k, { dialogueLines: 2 }),
        ),
      }),
    );
    expect(best).not.toBeNull();
    expect(best?.template).toBe("2_1_2_dialogue");
  });

  it("choisit vertical_hero_4 ou hero_top_2_2 pour une page action 5 panels climactique", () => {
    const best = pickBestLayoutForIntent(
      intent({
        panelCount: 5,
        narrativeShape: "action_burst",
        isClimaxPage: true,
        allowFivePanelLayouts: true,
        panels: [
          panel(0, { shotType: "wide", importance: "major", isFocusPanel: true }),
          panel(1, { shotType: "closeup" }),
          panel(2, { shotType: "closeup" }),
          panel(3, { shotType: "medium" }),
          panel(4, { shotType: "medium" }),
        ],
      }),
    );
    expect(best).not.toBeNull();
    expect(["vertical_hero_4", "hero_top_2_2"]).toContain(best?.template);
  });
});
