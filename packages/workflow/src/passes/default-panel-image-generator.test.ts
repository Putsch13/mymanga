import { describe, expect, it } from "vitest";
import { createDefaultChapterStyleBible } from "@manga-ai-studio/ai";
import type { PanelRenderSpec } from "@manga-ai-studio/ai/contracts";
import { createDefaultPanelImageGenerator } from "./default-panel-image-generator";

function makeSpec(): PanelRenderSpec {
  return {
    panelId: "p1",
    pageNumber: 1,
    panelNumberInPage: 1,
    panelPurpose: "hero_focus",
    renderMode: "hero_closeup",
    shotType: "closeup",
    cameraAngle: "eye_level",
    subjectFocus: "hero",
    cutawayType: "none",
    locationName: "street",
    actionLine: "hero stares",
    emotionLine: "determined",
    dialogueIntent: null,
    visibleCharacters: [
      { characterId: "h1", name: "Hero", role: "hero", poseIntent: null, expressionIntent: null },
    ],
    styleBible: createDefaultChapterStyleBible(),
    continuityLocks: { outfitLocks: [], bodyStateLocks: [], propLocks: [], environmentLocks: [] },
    imageReferences: {
      characterRefs: [{ characterId: "h1", url: "https://cdn.example/hero.png", weight: 1 }],
      environmentRefs: [{ anchorId: "env-street", url: "https://cdn.example/street.png", weight: 0.7 }],
      panelRefs: [],
      styleRefs: [{ url: "https://cdn.example/style.png", weight: 0.5 }],
    },
    constraints: { mustShow: [], mustNotShow: [], forbiddenDrift: [], noTextInsideImage: true },
  };
}

describe("createDefaultPanelImageGenerator", () => {
  it("sans FAL_KEY, utilise le mock adapter et retourne ok=true avec une URL mock", async () => {
    const gen = createDefaultPanelImageGenerator({ apiKey: undefined });
    const res = await gen({
      spec: makeSpec(),
      prompt: "hero closeup, street",
      negative: "text inside image",
      route: {
        modelId: "fal-panel-character-v3",
        panelCategory: "HERO_CLOSEUP",
        referencePolicy: "STRONG",
        sizePreset: "portrait",
        retryPolicy: "strict_character",
      },
    });
    expect(res.ok).toBe(true);
    expect(res.imageUrl).toMatch(/^https?:\/\//);
    expect(res.provider).toBeDefined();
  });

  it("passe les providerParams v3 (renderMode, subjectFocus, referencePolicy)", async () => {
    const gen = createDefaultPanelImageGenerator({ apiKey: undefined });
    const res = await gen({
      spec: makeSpec(),
      prompt: "p",
      negative: "n",
      route: {
        modelId: "fal-panel-character-v3",
        panelCategory: "HERO_CLOSEUP",
        referencePolicy: "STRONG",
        sizePreset: "portrait",
        retryPolicy: "strict_character",
      },
    });
    expect(res.ok).toBe(true);
  });
});
