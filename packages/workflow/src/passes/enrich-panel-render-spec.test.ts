import { describe, expect, it } from "vitest";
import type { StoryboardPanel } from "@manga-ai-studio/ai/contracts";
import { buildPanelRenderTextPayloadFromStoryboardPanel, type StoryboardPanelWithOptionalTextBundle } from "./enrich-panel-render-spec";

function basePanel(overrides: Partial<StoryboardPanel> = {}): StoryboardPanel {
  return {
    panelId: "p1",
    pageNumber: 1,
    panelNumberInPage: 1,
    globalPanelIndex: 0,
    sourceBeatId: "b1",
    panelPurpose: "dialogue_anchor",
    renderMode: "dialogue_two_shot",
    shotType: "medium",
    cameraAngle: "eye_level",
    subjectFocus: "hero",
    cutawayType: "none",
    characters: ["hero-1"],
    locationId: null,
    locationName: "Rue",
    actionLine: "Parler",
    emotionLine: "tension",
    dialogue: [],
    narration: null,
    sfx: [],
    mustShow: [],
    mustNotShow: [],
    continuityNotes: [],
    visualAnchors: { characterIds: ["hero-1"], environmentAnchorId: null, previousPanelAnchorId: null },
    ...overrides,
  };
}

describe("buildPanelRenderTextPayloadFromStoryboardPanel", () => {
  it("reproduit le storyboard dialogue + narration + sfx", () => {
    const panel = basePanel({
      dialogue: [{ speaker: "Maya", text: "Viens." }],
      narration: "Vent.",
      sfx: ["whoosh"],
    });
    const { panelTextPayload, textContract } = buildPanelRenderTextPayloadFromStoryboardPanel(panel);
    expect(panelTextPayload.dialogue?.[0]).toEqual({ speaker: "Maya", text: "Viens." });
    expect(panelTextPayload.narration).toBe("Vent.");
    expect(panelTextPayload.sfx).toEqual(["whoosh"]);
    expect(textContract.panelId).toBe("p1");
  });

  it("fusionne panelTextBundle quand dialogue[] est vide", () => {
    const panel: StoryboardPanelWithOptionalTextBundle = {
      ...basePanel({ dialogue: [] }),
      panelTextBundle: {
        dialogues: [{ speaker: "Off", text: "Écoute." }],
        narration: "Suite bundle.",
        sfx: ["creak"],
      },
    };
    const { panelTextPayload, dialogueForSpeakers } = buildPanelRenderTextPayloadFromStoryboardPanel(panel);
    expect(dialogueForSpeakers[0]?.text).toBe("Écoute.");
    expect(panelTextPayload.narration).toContain("Suite bundle.");
    expect(panelTextPayload.sfx).toContain("creak");
  });
});
