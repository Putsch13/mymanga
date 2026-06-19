import { describe, expect, it } from "vitest";
import type { StoryboardPanel, StoryboardPlan } from "@manga-ai-studio/ai/contracts";
import { getPanelPromptFingerprint } from "./panel-prompt-fingerprint";
import { repairStoryboardPlanRepeatedPromptFingerprints } from "./repair-repeated-prompt-fingerprints";

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
    actionLine: overrides.actionLine ?? "same generic manga panel prompt",
    emotionLine: "y",
    dialogue: [{ speaker: "x", text: "ok" }],
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

describe("repairStoryboardPlanRepeatedPromptFingerprints", () => {
  it("dédoublonne les empreintes actionLine/purpose pour de nombreux panels identiques", () => {
    const panels = Array.from({ length: 24 }, (_, i) =>
      makePanel({
        panelId: `panel_${i + 1}`,
        globalPanelIndex: i,
        actionLine: "same generic manga panel prompt",
      }),
    );
    const plan = makePlan(panels);
    const before = new Set(
      plan.pages.flatMap((p) => p.panels).map((panel) => getPanelPromptFingerprint(panel as unknown as Record<string, unknown>)),
    );
    expect(before.size).toBe(1);

    repairStoryboardPlanRepeatedPromptFingerprints(plan);

    const after = plan.pages.flatMap((p) => p.panels).map((panel) => getPanelPromptFingerprint(panel as unknown as Record<string, unknown>));
    expect(new Set(after).size).toBeGreaterThan(10);
  });
});
