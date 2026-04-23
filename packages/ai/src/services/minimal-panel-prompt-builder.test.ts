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

  it("injecte le sous-texte de dialogue sans demander du texte dans l'image", () => {
    const r = buildMinimalPanelPrompt(
      makeSpec({
        renderMode: "dialogue_two_shot",
        panelPurpose: "dialogue_anchor",
        shotType: "medium",
        subjectFocus: "group",
        dialogueIntent: "Miya accuses Nelo of hiding the truth",
        visibleCharacters: [
          { characterId: "c1", name: "Miya", role: "hero", poseIntent: null, expressionIntent: null },
          { characterId: "c2", name: "Nelo", role: "support", poseIntent: null, expressionIntent: null },
        ],
      }),
    );
    expect(r.positive).toContain("Dialogue subtext: Miya accuses Nelo of hiding the truth.");
    expect(r.positive).toContain("no speech bubbles or text in image");
  });

  it("un dialogue_two_shot ne présente plus un primary subject unique", () => {
    const r = buildMinimalPanelPrompt(
      makeSpec({
        renderMode: "dialogue_two_shot",
        panelPurpose: "dialogue_anchor",
        shotType: "medium",
        subjectFocus: "group",
        visibleCharacters: [
          { characterId: "c1", name: "Miya", role: "hero", poseIntent: null, expressionIntent: null },
          { characterId: "c2", name: "Nelo", role: "support", poseIntent: null, expressionIntent: null },
        ],
      }),
    );
    expect(r.positive.toLowerCase()).not.toContain("as primary subject");
    expect(r.positive).toContain("balanced framing");
  });

  it("injecte hairColor + eyeColor du personnage dans le prompt", () => {
    const r = buildMinimalPanelPrompt(
      makeSpec({
        visibleCharacters: [
          {
            characterId: "c1",
            name: "Miya",
            role: "hero",
            poseIntent: null,
            expressionIntent: null,
            hairColor: "black",
            eyeColor: "blue",
            canonSignatureText: "short bob haircut",
            forbiddenDrift: ["red eyes", "long silver hair"],
          },
        ],
        constraints: {
          mustShow: [],
          mustNotShow: [],
          forbiddenDrift: ["red eyes", "long silver hair"],
          noTextInsideImage: true,
        },
      }),
    );
    expect(r.positive.toLowerCase()).toContain("black hair");
    expect(r.positive.toLowerCase()).toContain("blue eyes");
    expect(r.negative.toLowerCase()).toContain("red eyes");
  });
});
