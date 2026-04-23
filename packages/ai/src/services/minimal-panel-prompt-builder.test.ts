import { describe, expect, it } from "vitest";
import { buildMinimalPanelPrompt } from "./minimal-panel-prompt-builder";
import { createDefaultChapterStyleBible } from "../contracts/chapter-style-bible";
import type { PanelRenderSpec } from "../contracts/panel-render-spec";

function makeSpec(overrides: Partial<PanelRenderSpec> = {}): PanelRenderSpec {
  return {
    panelId: "p",
    pageNumber: 1,
    panelNumberInPage: 1,
    panelPurpose: "reaction_closeup",
    renderMode: "reaction_closeup",
    shotType: "closeup",
    cameraAngle: "eye_level",
    subjectFocus: "reaction",
    cutawayType: "reaction",
    locationName: "corridor",
    actionLine: "recoil",
    emotionLine: "shock",
    dialogueIntent: null,
    visibleCharacters: [
      { characterId: "c1", name: "Hero", role: "hero", poseIntent: null, expressionIntent: null },
    ],
    styleBible: createDefaultChapterStyleBible(),
    continuityLocks: { outfitLocks: [], bodyStateLocks: [], propLocks: [], environmentLocks: [] },
    imageReferences: { characterRefs: [], environmentRefs: [], panelRefs: [], styleRefs: [] },
    constraints: { mustShow: [], mustNotShow: [], forbiddenDrift: [], noTextInsideImage: true },
    ...overrides,
  };
}

describe("buildMinimalPanelPrompt", () => {
  it("reaction_closeup ne contient PAS 'wide establishing'", () => {
    const r = buildMinimalPanelPrompt(makeSpec());
    expect(r.positive.toLowerCase()).not.toContain("wide establishing");
  });

  it("insert_object ne contient PAS 'hero portrait' ni 'full character portrait'", () => {
    const r = buildMinimalPanelPrompt(
      makeSpec({
        renderMode: "insert_object",
        subjectFocus: "prop",
        shotType: "extreme_closeup",
        visibleCharacters: [],
      }),
    );
    expect(r.positive.toLowerCase()).not.toContain("hero portrait");
    expect(r.positive.toLowerCase()).not.toContain("full character portrait");
  });

  it("establishing_environment ne contient PAS 'tight face'", () => {
    const r = buildMinimalPanelPrompt(
      makeSpec({
        renderMode: "establishing_environment",
        subjectFocus: "environment",
        shotType: "wide",
        visibleCharacters: [],
      }),
    );
    expect(r.positive.toLowerCase()).not.toContain("tight face");
    expect(r.negative.toLowerCase()).toContain("tight face");
  });

  it("le prompt final tient entre 200 (plancher raisonnable) et 1200 chars max", () => {
    const r = buildMinimalPanelPrompt(makeSpec());
    expect(r.length).toBeLessThanOrEqual(1200);
    expect(r.length).toBeGreaterThan(200);
  });

  it("le negative contient toujours les interdits basiques (watermark, logo, 3d, photorealistic)", () => {
    const r = buildMinimalPanelPrompt(makeSpec());
    const neg = r.negative.toLowerCase();
    for (const tok of ["watermark", "logo", "3d render", "photorealistic"]) {
      expect(neg).toContain(tok);
    }
  });
});
