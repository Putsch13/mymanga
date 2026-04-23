import { describe, expect, it } from "vitest";
import { validateRenderSpec, assertValidRenderSpec, RenderSpecValidationError } from "./render-spec-validator";
import { createDefaultChapterStyleBible } from "../contracts/chapter-style-bible";
import type { PanelRenderSpec } from "../contracts/panel-render-spec";

function makeSpec(overrides: Partial<PanelRenderSpec> = {}): PanelRenderSpec {
  return {
    panelId: "p1",
    pageNumber: 1,
    panelNumberInPage: 1,
    // COMMIT C — panelPurpose est maintenant requis sur le spec.
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

describe("validateRenderSpec", () => {
  it("refuse la contradiction establishing_environment + subjectFocus=hero", () => {
    const r = validateRenderSpec(
      makeSpec({ renderMode: "establishing_environment", subjectFocus: "hero", shotType: "wide" }),
    );
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.includes("establishing_environment+hero"))).toBe(true);
  });

  it("refuse la contradiction insert_object + hero", () => {
    const r = validateRenderSpec(
      makeSpec({ renderMode: "insert_object", subjectFocus: "hero", shotType: "extreme_closeup" }),
    );
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.includes("insert_object+hero"))).toBe(true);
  });

  it("refuse closeup + shotType=wide", () => {
    const r = validateRenderSpec(makeSpec({ shotType: "wide" }));
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.includes("closeup+wide"))).toBe(true);
  });

  it("refuse hero présent sans characterRefs", () => {
    const r = validateRenderSpec(
      makeSpec({
        imageReferences: { characterRefs: [], environmentRefs: [], panelRefs: [], styleRefs: [] },
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.includes("missing_character_refs_for_hero_or_support"))).toBe(true);
  });

  it("assertValidRenderSpec lève une RenderSpecValidationError si invalide", () => {
    expect(() => assertValidRenderSpec(makeSpec({ shotType: "wide" }))).toThrow(
      RenderSpecValidationError,
    );
  });

  it("accepte un spec minimal valide", () => {
    expect(validateRenderSpec(makeSpec()).ok).toBe(true);
  });

  it("refuse un reaction_closeup sans personnage visible", () => {
    const r = validateRenderSpec(makeSpec({ visibleCharacters: [] }));
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.includes("missing_visible_characters_for_renderMode=reaction_closeup"))).toBe(true);
  });

  it("refuse un dialogue_two_shot avec moins de deux personnages visibles", () => {
    const r = validateRenderSpec(
      makeSpec({
        renderMode: "dialogue_two_shot",
        panelPurpose: "dialogue_anchor",
        shotType: "medium",
        subjectFocus: "group",
        visibleCharacters: [{ characterId: "c1", name: "Miya", role: "hero", poseIntent: null, expressionIntent: null }],
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.includes("insufficient_visible_characters_for_renderMode=dialogue_two_shot"))).toBe(true);
  });

  // COMMIT G — tests bloquants (mission de refonte P11 §4).
  // Ces tests refusent les sentinelles legacy qui ont causé les logs
  // `panel=unknown subjectFocus=none → CHARACTER_IN_SCENE` en prod.

  it.each(["unknown", "none", "undefined", "null", "n/a", "tbd", "todo", ""])(
    "COMMIT G — refuse panelPurpose=%s (sentinelle legacy interdite)",
    (sentinel) => {
      const r = validateRenderSpec(makeSpec({ panelPurpose: sentinel as never }));
      expect(r.ok).toBe(false);
      expect(r.issues.some((i) => i.includes("panelPurpose_missing_or_sentinel"))).toBe(
        true,
      );
    },
  );

  it.each(["unknown", "none", "undefined", "null", "n/a", "tbd", "todo"])(
    "COMMIT G — refuse subjectFocus=%s (sentinelle legacy interdite)",
    (sentinel) => {
      const r = validateRenderSpec(makeSpec({ subjectFocus: sentinel as never }));
      expect(r.ok).toBe(false);
      expect(r.issues.some((i) => i.includes("subjectFocus_missing_or_sentinel"))).toBe(
        true,
      );
    },
  );

  it.each(["unknown", "none"])(
    "COMMIT G — refuse renderMode=%s (plus de fallback CHARACTER_IN_SCENE)",
    (sentinel) => {
      const r = validateRenderSpec(makeSpec({ renderMode: sentinel as never }));
      expect(r.ok).toBe(false);
      expect(r.issues.some((i) => i.includes("renderMode_missing_or_sentinel"))).toBe(
        true,
      );
    },
  );

  it.each(["unknown", "none"])(
    "COMMIT G — refuse shotType=%s (storyboard doit décider)",
    (sentinel) => {
      const r = validateRenderSpec(makeSpec({ shotType: sentinel as never }));
      expect(r.ok).toBe(false);
      expect(r.issues.some((i) => i.includes("shotType_missing_or_sentinel"))).toBe(
        true,
      );
    },
  );
});
