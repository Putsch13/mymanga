import { describe, expect, it } from "vitest";
import type { StoryboardPanel } from "@manga-ai-studio/ai/contracts";
import type { FalRenderRoute, PanelRenderSpec } from "@manga-ai-studio/ai";
import { createDefaultChapterStyleBible, createEmptyChapterVisualMemory } from "@manga-ai-studio/ai";
import {
  buildPanelRenderTextPayloadFromStoryboardPanel,
  enrichPanelRenderSpecForRenderPass,
  type StoryboardPanelWithOptionalTextBundle,
} from "./enrich-panel-render-spec";

function makeMinimalRenderSpec(overrides: Partial<PanelRenderSpec> = {}): PanelRenderSpec {
  return {
    panelId: "p1",
    pageNumber: 1,
    panelNumberInPage: 1,
    panelPurpose: "reaction_closeup",
    renderMode: "reaction_closeup",
    shotType: "closeup",
    cameraAngle: "eye_level",
    subjectFocus: "reaction",
    cutawayType: "reaction",
    locationName: "salle",
    actionLine: "a",
    emotionLine: "e",
    dialogueIntent: null,
    visibleCharacters: [
      { characterId: "c1", name: "Hero", role: "hero", poseIntent: null, expressionIntent: null },
    ],
    styleBible: createDefaultChapterStyleBible(),
    continuityLocks: {
      outfitLocks: [],
      bodyStateLocks: [],
      propLocks: [],
      environmentLocks: [],
    },
    imageReferences: {
      characterRefs: [{ characterId: "c1", url: "https://x/f.png", weight: 1 }],
      environmentRefs: [],
      panelRefs: [],
      styleRefs: [],
    },
    constraints: {
      mustShow: [],
      mustNotShow: [],
      forbiddenDrift: [],
      noTextInsideImage: true,
    },
    ...overrides,
  };
}

const testRoute: FalRenderRoute = {
  modelId: "m",
  referencePolicy: "LIGHT",
  panelCategory: "CHARACTER_IN_SCENE",
  sizePreset: "portrait",
  retryPolicy: "standard",
};

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

  it("priorise textContract embarqué sur dialogue[] du storyboard", () => {
    const textContract = {
      panelId: "p1",
      hasText: true,
      dialogues: [{ speakerName: "Canon", text: "Texte officiel" }],
      narration: null,
      sfx: [],
      placement: {
        reserveTextArea: true,
        preferredAnchorZones: [] as string[],
        avoidFaces: true,
        overflowStrategy: "bubble_stack" as const,
      },
      silenceReason: null,
    };
    const panel = basePanel({
      dialogue: [{ speaker: "Wrong", text: "Stale" }],
      textContract,
    });
    const { panelTextPayload } = buildPanelRenderTextPayloadFromStoryboardPanel(panel);
    expect(panelTextPayload.dialogue?.[0]?.text).toBe("Texte officiel");
    expect(panelTextPayload.dialogue?.[0]?.speaker).toBe("Canon");
  });
});

describe("enrichPanelRenderSpecForRenderPass — environmentDNA", () => {
  it("injecte environmentVisualDna du storyboard dans environmentDNA du spec", () => {
    const panel = basePanel({
      environmentVisualDna: {
        locationName: "Port industriel",
        anchorId: "loc-1",
        visualAnchors: ["quai humide", "nacelles"],
        architectureHints: ["grues rouillées", "hangars"],
        atmosphere: ["brume salée", "vent"],
        lightingHints: ["contre-jour froid"],
        propAnchors: ["conteneurs empilés"],
        forbiddenDrift: ["ciel dégagé"],
      },
    });
    const memory = createEmptyChapterVisualMemory("ch1");
    const out = enrichPanelRenderSpecForRenderPass({
      spec: makeMinimalRenderSpec(),
      panel,
      visualMemory: memory,
      mainCharacterIds: ["hero-1"],
      route: testRoute,
      previousPanel: null,
    });
    expect(out.environmentDNA).toMatchObject({
      description: "Port industriel",
      visualAnchors: ["quai humide", "nacelles"],
      architectureHints: ["grues rouillées", "hangars"],
      atmosphere: ["brume salée", "vent"],
      lightingHints: ["contre-jour froid"],
      propAnchors: ["conteneurs empilés"],
      forbiddenDrift: ["ciel dégagé"],
    });
  });
});
