import { describe, expect, it } from "vitest";
import {
  FAL_RENDER_ROUTE_MODEL_IDS,
  getFalRenderRouteTable,
  resolveFalRenderRoute,
} from "./fal-render-route-v3";
import { createDefaultChapterStyleBible } from "../contracts/chapter-style-bible";
import type { PanelRenderSpec } from "../contracts/panel-render-spec";
import type { StoryboardRenderMode } from "../contracts/storyboard-plan";
import { STORYBOARD_RENDER_MODES } from "../contracts/storyboard-plan";

function makeSpec(
  renderMode: StoryboardRenderMode,
  overrides: Partial<PanelRenderSpec> = {},
): PanelRenderSpec {
  return {
    panelId: "p",
    pageNumber: 1,
    panelNumberInPage: 1,
    renderMode,
    shotType: "medium",
    cameraAngle: "eye_level",
    subjectFocus: "group",
    cutawayType: "none",
    locationName: "loc",
    actionLine: "",
    emotionLine: "",
    dialogueIntent: null,
    visibleCharacters: [],
    styleBible: createDefaultChapterStyleBible(),
    continuityLocks: {
      outfitLocks: [],
      bodyStateLocks: [],
      propLocks: [],
      environmentLocks: [],
    },
    imageReferences: {
      characterRefs: [],
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

describe("resolveFalRenderRoute", () => {
  it("hero_closeup → référencePolicy STRONG et portrait", () => {
    const r = resolveFalRenderRoute(
      makeSpec("hero_closeup", {
        visibleCharacters: [
          { characterId: "c1", name: "Hero", role: "hero", poseIntent: null, expressionIntent: null },
        ],
      }),
    );
    expect(r.referencePolicy).toBe("STRONG");
    expect(r.sizePreset).toBe("portrait");
    expect(r.modelId).toBe(FAL_RENDER_ROUTE_MODEL_IDS.characterFocused);
    expect(r.retryPolicy).toBe("strict_character");
  });

  it("establishing_environment → route décor, landscape, pas hero-focused", () => {
    const r = resolveFalRenderRoute(makeSpec("establishing_environment"));
    expect(r.modelId).toBe(FAL_RENDER_ROUTE_MODEL_IDS.environmentFocused);
    expect(r.sizePreset).toBe("landscape");
    expect(r.retryPolicy).toBe("strict_environment");
    expect(r.panelCategory).toBe("ESTABLISHING_ENVIRONMENT");
  });

  it("insert_object → route insert, pas de panelCategory héros", () => {
    const r = resolveFalRenderRoute(
      makeSpec("insert_object", { subjectFocus: "prop", shotType: "extreme_closeup" }),
    );
    expect(r.modelId).toBe(FAL_RENDER_ROUTE_MODEL_IDS.insertFocused);
    expect(r.panelCategory).toBe("INSERT_OBJECT");
    expect(r.panelCategory.includes("HERO")).toBe(false);
  });

  it("combat_exchange → route combat, STRONG si hero présent", () => {
    const r = resolveFalRenderRoute(
      makeSpec("combat_exchange", {
        visibleCharacters: [
          { characterId: "c1", name: "Hero", role: "hero", poseIntent: null, expressionIntent: null },
        ],
      }),
    );
    expect(r.modelId).toBe(FAL_RENDER_ROUTE_MODEL_IDS.combatFocused);
    expect(r.referencePolicy).toBe("STRONG");
  });

  it("route déterministe : même spec → même route", () => {
    const spec = makeSpec("dialogue_two_shot");
    const a = resolveFalRenderRoute(spec);
    const b = resolveFalRenderRoute(spec);
    expect(a).toEqual(b);
  });

  it("la table couvre TOUS les renderModes (jamais de fallback implicite)", () => {
    const table = getFalRenderRouteTable();
    for (const mode of STORYBOARD_RENDER_MODES) {
      expect(table[mode]).toBeDefined();
      expect(typeof table[mode].modelId).toBe("string");
    }
  });

  it("hero présent sans refs ne descend jamais en NONE (policy never-NONE-for-hero)", () => {
    // Ce cas n'arrive normalement pas (validateRenderSpec refuse d'abord),
    // mais la route ne doit pas descendre en NONE même en présence d'un héros.
    // On prend un mode dont la base est LIGHT pour vérifier le floor.
    const r = resolveFalRenderRoute(
      makeSpec("insert_object", {
        visibleCharacters: [
          { characterId: "c1", name: "Hero", role: "hero", poseIntent: null, expressionIntent: null },
        ],
      }),
    );
    expect(r.referencePolicy).not.toBe("NONE");
  });
});
