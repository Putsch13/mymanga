import { describe, it, expect } from "vitest";
import {
  buildChapterImagePlanFromNarrative,
  deriveContentRatingFromProject,
  deriveMangaStyleProfileFromStylePack,
  type NarrativePlannedImageLike,
} from "./chapter-image-plan-from-narrative";

const rawCharacters = [
  { id: "char_hero", name: "Lyra", roleType: "main_hero" },
  { id: "char_ally", name: "Ren", roleType: "important_supporting_character" },
];

function makePlanned(
  sceneIndex: number,
  panelNumber: number,
  overrides: Partial<NarrativePlannedImageLike["baseMetadata"]> = {},
  panel: Partial<NarrativePlannedImageLike["panel"]> = {},
): NarrativePlannedImageLike {
  return {
    sceneImageId: `img_${sceneIndex}_${panelNumber}`,
    sceneIndex,
    panel: {
      panelNumber,
      characters: ["Lyra"],
      mood: "tense",
      camera: "medium",
      caption: "Lyra observe la scène",
      ...panel,
    },
    baseMetadata: {
      sceneId: `scene_${sceneIndex}`,
      pageNumber: sceneIndex,
      beatId: `beat_${sceneIndex}`,
      beatType: "scene",
      panelContract: {
        subjectFocus: "hero",
        cutawayType: "none",
        shotType: "medium",
      },
      ...overrides,
    },
  };
}

describe("buildChapterImagePlanFromNarrative", () => {
  it("produit un plan avec un item par planned image, tri par scène", () => {
    const plannedImages: NarrativePlannedImageLike[] = [
      makePlanned(0, 1),
      makePlanned(0, 2),
      makePlanned(1, 1),
      makePlanned(1, 2),
    ];
    const result = buildChapterImagePlanFromNarrative({
      projectId: "p1",
      chapterId: "c1",
      mangaStyleProfile: "shonen_classic",
      contentRating: "teen",
      plannedImages,
      rawCharacters,
    });
    expect(result.plan).toHaveLength(4);
    expect(result.planItemBySceneImageId.get("img_0_1")).toBeDefined();
    expect(result.planItemBySceneImageId.get("img_1_2")).toBeDefined();
  });

  it("mappe subjectFocus=environment -> environment_establishing", () => {
    const planned = makePlanned(
      0,
      1,
      {
        panelContract: {
          subjectFocus: "environment",
          cutawayType: "location_reveal",
          shotType: "wide",
        },
      },
      { characters: [] },
    );
    const result = buildChapterImagePlanFromNarrative({
      projectId: "p",
      chapterId: "c",
      mangaStyleProfile: "shonen_classic",
      contentRating: "teen",
      plannedImages: [planned],
      rawCharacters,
    });
    const item = result.plan[0];
    expect([
      "environment_establishing",
      "location_reveal",
      "atmospheric_wide",
    ]).toContain(item.imageIntentType);
    expect(item.heroPresenceMode).toBe("absent");
  });

  it("remonte la validation du plan (issues/warnings)", () => {
    const plannedImages = Array.from({ length: 3 }, (_, i) => makePlanned(0, i + 1));
    const result = buildChapterImagePlanFromNarrative({
      projectId: "p",
      chapterId: "c",
      mangaStyleProfile: "shonen_classic",
      contentRating: "teen",
      plannedImages,
      rawCharacters,
    });
    expect(result.validation).toBeDefined();
    expect(typeof result.validation.valid).toBe("boolean");
  });
});

describe("deriveContentRatingFromProject", () => {
  it("détecte explicit_adult / mature / teen / all_ages", () => {
    expect(deriveContentRatingFromProject({ intensityLayer: "EXPLICIT_ADULT" })).toBe(
      "explicit_adult",
    );
    expect(deriveContentRatingFromProject({ intensityLayer: "MATURE" })).toBe("mature");
    expect(deriveContentRatingFromProject({ intensityLayer: "TEEN" })).toBe("teen");
    expect(deriveContentRatingFromProject({ intensityLayer: "ALL_AGES" })).toBe("all_ages");
    expect(deriveContentRatingFromProject({ intensityLayer: null })).toBe("teen");
  });
});

describe("deriveMangaStyleProfileFromStylePack", () => {
  it("renvoie le nom du premier pack ou un défaut", () => {
    expect(deriveMangaStyleProfileFromStylePack([{ name: "Shonen Dynamic" }])).toBe(
      "Shonen Dynamic",
    );
    expect(deriveMangaStyleProfileFromStylePack([])).toBe("shonen_classic");
  });
});
