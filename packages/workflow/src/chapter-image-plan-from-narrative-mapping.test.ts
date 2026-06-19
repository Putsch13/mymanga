import { describe, expect, it } from "vitest";
import { buildStablePlanItemMap } from "./chapter-image-plan-from-narrative";
import type { ChapterImagePlanItem } from "./chapter-image-plan-builder";

/**
 * P1.3 — tests du mapping stable `sceneImageId → planItem`.
 * On teste purement la fonction de jointure, sans passer par le builder
 * complet (qui depend du canonical-prompt-recipe-builder).
 */

function makePlanItem(
  overrides: Partial<ChapterImagePlanItem>,
): ChapterImagePlanItem {
  return {
    imageId: "img",
    projectId: "p",
    chapterId: "c",
    pageIndex: 0,
    panelIndex: 0,
    beatIndex: 0,
    beatType: "story",
    beatId: "beat1",
    storyFunction: "",
    imageIntentType: "hero_solo",
    dominantSubject: "hero",
    secondarySubjects: [],
    cutawayType: null,
    cameraIntent: "medium",
    framingIntent: "medium",
    environmentPriority: 1,
    characterPriority: 3,
    npcPriority: 1,
    propPriority: 1,
    groupPriority: 0,
    requiredCharacters: [],
    requiredNpcs: [],
    requiredProps: [],
    requiredLocationSignals: [],
    requiredDialogueLines: [],
    requiredNarrativeContext: [],
    continuityAnchors: [],
    forbiddenFocus: [],
    forbiddenFraming: [],
    forbiddenPromptClauses: [],
    targetLoras: [],
    targetCanonSources: [],
    promptLanguage: "en",
    contentRating: "all_ages",
    heroPresenceMode: "primary",
    ...overrides,
  } as ChapterImagePlanItem;
}

describe("buildStablePlanItemMap (P1.3)", () => {
  it("map 1:1 par cle composite pageIndex+panelIndex+beatId quand dispo", () => {
    const plan = [
      makePlanItem({ imageId: "a", pageIndex: 0, panelIndex: 0, beatId: "b1" }),
      makePlanItem({ imageId: "b", pageIndex: 0, panelIndex: 1, beatId: "b1" }),
      makePlanItem({ imageId: "c", pageIndex: 1, panelIndex: 0, beatId: "b2" }),
    ];
    const planned = [
      {
        sceneImageId: "sid_c",
        sceneIndex: 2,
        panel: { panelNumber: 0 },
        baseMetadata: { pageIndex: 1, panelIndex: 0, beatId: "b2" },
      },
      {
        sceneImageId: "sid_a",
        sceneIndex: 0,
        panel: { panelNumber: 0 },
        baseMetadata: { pageIndex: 0, panelIndex: 0, beatId: "b1" },
      },
      {
        sceneImageId: "sid_b",
        sceneIndex: 1,
        panel: { panelNumber: 1 },
        baseMetadata: { pageIndex: 0, panelIndex: 1, beatId: "b1" },
      },
    ];

    const map = buildStablePlanItemMap(planned, plan);
    expect(map.get("sid_a")?.imageId).toBe("a");
    expect(map.get("sid_b")?.imageId).toBe("b");
    expect(map.get("sid_c")?.imageId).toBe("c");
  });

  it("fallback ordre quand la cle composite n'est pas dans baseMetadata", () => {
    const plan = [
      makePlanItem({ imageId: "a", pageIndex: 0, panelIndex: 0 }),
      makePlanItem({ imageId: "b", pageIndex: 0, panelIndex: 1 }),
    ];
    const planned = [
      {
        sceneImageId: "sid1",
        sceneIndex: 0,
        panel: { panelNumber: 0 },
        baseMetadata: {},
      },
      {
        sceneImageId: "sid2",
        sceneIndex: 1,
        panel: { panelNumber: 1 },
        baseMetadata: {},
      },
    ];
    const map = buildStablePlanItemMap(planned, plan);
    expect(map.get("sid1")?.imageId).toBe("a");
    expect(map.get("sid2")?.imageId).toBe("b");
  });

  it("throw si cardinalite plan != plannedImages", () => {
    const plan = [makePlanItem({ imageId: "a" })];
    const planned = [
      { sceneImageId: "sid1", sceneIndex: 0, panel: { panelNumber: 0 }, baseMetadata: {} },
      { sceneImageId: "sid2", sceneIndex: 1, panel: { panelNumber: 1 }, baseMetadata: {} },
    ];
    expect(() => buildStablePlanItemMap(planned, plan)).toThrow(/cardinality_mismatch/);
  });

  it("resiste a un plan reordonne par le builder", () => {
    // Le builder a decide de reordonner : planned[0] a b2, planned[1] a b1.
    const plan = [
      makePlanItem({ imageId: "x", pageIndex: 0, panelIndex: 0, beatId: "b2" }),
      makePlanItem({ imageId: "y", pageIndex: 0, panelIndex: 0, beatId: "b1" }),
    ];
    const planned = [
      {
        sceneImageId: "sid_b1",
        sceneIndex: 0,
        panel: { panelNumber: 0 },
        baseMetadata: { pageIndex: 0, panelIndex: 0, beatId: "b1" },
      },
      {
        sceneImageId: "sid_b2",
        sceneIndex: 1,
        panel: { panelNumber: 0 },
        baseMetadata: { pageIndex: 0, panelIndex: 0, beatId: "b2" },
      },
    ];
    const map = buildStablePlanItemMap(planned, plan);
    // Le mapping stable doit matcher sur la cle composite, pas sur l'ordre.
    expect(map.get("sid_b1")?.imageId).toBe("y");
    expect(map.get("sid_b2")?.imageId).toBe("x");
  });
});
