import { describe, expect, it } from "vitest";
import type { StoryboardPlan } from "@manga-ai-studio/ai/contracts";
import { assertLlmDidNotChangeStructuralFields } from "./approved-plan-structural-guard";

function minimalPlan(overrides?: Partial<{ panelId: string; actionLine: string }>): StoryboardPlan {
  const panelId = overrides?.panelId ?? "p1";
  return {
    chapterId: "c1",
    totalTargetPanels: 1,
    pages: [
      {
        pageNumber: 1,
        layoutTemplate: "vertical_strip",
        dramaticRole: "setup",
        beatIds: ["b1"],
        panels: [
          {
            panelId,
            pageNumber: 1,
            panelNumberInPage: 1,
            globalPanelIndex: 0,
            sourceBeatId: "b1",
            panelPurpose: "hero_focus",
            renderMode: "hero_closeup",
            shotType: "medium",
            cameraAngle: "eye_level",
            subjectFocus: "hero",
            cutawayType: "none",
            characters: ["h1"],
            locationId: null,
            locationName: "",
            actionLine: overrides?.actionLine ?? "looks ahead",
            emotionLine: "",
            dialogue: [],
            mustShow: [],
            mustNotShow: [],
            continuityNotes: [],
            visualAnchors: { characterIds: ["h1"] },
          },
        ],
      },
    ],
    editorialDiagnostics: {
      varietyScore: 0.5,
      heroFocusRatio: 1,
      environmentRatio: 0,
      insertRatio: 0,
      reactionRatio: 0,
      warnings: [],
      blockers: [],
    },
  };
}

describe("approved-plan-structural-guard", () => {
  it("accepte un enrichissement non structurel (actionLine)", () => {
    const before = minimalPlan();
    const after = minimalPlan({ actionLine: "enriched micro-action" });
    expect(() => assertLlmDidNotChangeStructuralFields(before, after)).not.toThrow();
  });

  it("rejette une mutation de panelId", () => {
    const before = minimalPlan();
    const after = minimalPlan({ panelId: "p999" });
    expect(() => assertLlmDidNotChangeStructuralFields(before, after)).toThrow(/approved_plan_structural_mutation/);
  });
});
