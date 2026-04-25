import type { RequiredVisualCoverage } from "@manga-ai-studio/ai";
import type { StoryboardPlan } from "@manga-ai-studio/ai/contracts";
import { validateVisualCoverage } from "@manga-ai-studio/ai";
import { describe, expect, it } from "vitest";
import { repairStoryboardVisualCoverage } from "./repair-storyboard-visual-coverage";

function minimalPlan(): StoryboardPlan {
  return {
    chapterId: "ch1",
    totalTargetPanels: 1,
    pages: [
      {
        pageNumber: 1,
        layoutTemplate: "grid_2x2",
        dramaticRole: "test",
        beatIds: ["beat_a"],
        panels: [
          {
            panelId: "p1",
            pageNumber: 1,
            panelNumberInPage: 1,
            globalPanelIndex: 0,
            sourceBeatId: "beat_a",
            panelPurpose: "transition",
            renderMode: "silent_transition",
            shotType: "wide",
            cameraAngle: "eye_level",
            subjectFocus: "environment",
            cutawayType: "environment",
            characters: [],
            locationId: null,
            locationName: "",
            actionLine: "Plan large.",
            emotionLine: "",
            dialogue: [],
            mustShow: [],
            mustNotShow: [],
            continuityNotes: [],
            visualAnchors: { characterIds: [] },
          },
        ],
      },
    ],
    editorialDiagnostics: {
      varietyScore: 0,
      heroFocusRatio: 0,
      environmentRatio: 0,
      insertRatio: 0,
      reactionRatio: 0,
      warnings: [],
      blockers: [],
    },
  };
}

function propRequirement(entity: string): RequiredVisualCoverage {
  return {
    entity,
    entityType: "prop",
    sourceBeatId: "beat_a",
    requiresDedicatedPanel: false,
    acceptedRenderModes: ["insert_object", "surveillance_reveal"],
    acceptedSubjectFocuses: ["prop"],
    tokensHint: [entity],
    fulfilledByPanelIds: [],
  };
}

describe("repairStoryboardVisualCoverage", () => {
  it("répare un gap prop sur le beat ciblé", () => {
    const plan = minimalPlan();
    const req = [propRequirement("filet")];
    const before = validateVisualCoverage(req, plan);
    expect(before.ok).toBe(false);

    const gap = before.gaps[0]!;
    const repaired = repairStoryboardVisualCoverage({
      storyboardPlan: plan,
      gaps: [gap],
    });
    const after = validateVisualCoverage(req, repaired);
    expect(after.ok).toBe(true);
  });

  it("peut fusionner deux props compatibles sur un seul panel", () => {
    const plan = minimalPlan();
    const req = [propRequirement("souris"), propRequirement("clavier")];
    const before = validateVisualCoverage(req, plan);
    expect(before.gaps.length).toBeGreaterThanOrEqual(1);

    const repaired = repairStoryboardVisualCoverage({
      storyboardPlan: plan,
      gaps: before.gaps,
    });
    const p = repaired.pages[0]!.panels[0]!;
    expect(p.mustShow.join(" ")).toContain("souris");
    expect(p.mustShow.join(" ")).toContain("clavier");
  });
});
