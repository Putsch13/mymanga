import { describe, expect, it } from "vitest";
import type {
  FalRenderRoute,
  PanelRenderSpec,
} from "./panel-render-spec";
import { createDefaultChapterStyleBible } from "./chapter-style-bible";

describe("PanelRenderSpec contract", () => {
  it("accepte un spec minimal", () => {
    const spec: PanelRenderSpec = {
      panelId: "p-1",
      pageNumber: 1,
      panelNumberInPage: 1,
      renderMode: "reaction_closeup",
      shotType: "closeup",
      cameraAngle: "eye_level",
      subjectFocus: "reaction",
      cutawayType: "reaction",
      locationName: "salle",
      actionLine: "Le héros recule d'un pas.",
      emotionLine: "choc",
      dialogueIntent: null,
      visibleCharacters: [
        {
          characterId: "c1",
          name: "Hero",
          role: "hero",
          poseIntent: null,
          expressionIntent: "choc",
        },
      ],
      styleBible: createDefaultChapterStyleBible(),
      continuityLocks: {
        outfitLocks: [],
        bodyStateLocks: [],
        propLocks: [],
        environmentLocks: [],
      },
      imageReferences: {
        characterRefs: [{ characterId: "c1", url: "https://x/face.png", weight: 1 }],
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
    };
    expect(spec.panelId).toBe("p-1");
  });

  it("FalRenderRoute accepte toutes les referencePolicy valides", () => {
    const routes: FalRenderRoute[] = (["STRONG", "LIGHT", "NONE"] as const).map((p) => ({
      modelId: "m",
      referencePolicy: p,
      panelCategory: "cat",
      sizePreset: "portrait",
      retryPolicy: "standard",
    }));
    expect(routes.length).toBe(3);
  });
});
