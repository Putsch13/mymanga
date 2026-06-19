import { describe, expect, it } from "vitest";
import { buildStyleBibleFromUserProject } from "./chapter-style-bible-resolver";

describe("buildStyleBibleFromUserProject", () => {
  it("respecte un style projet pastel/aquarelle au lieu de forcer le noir et blanc", () => {
    const styleBible = buildStyleBibleFromUserProject({
      project: {
        visualStyle: "aquarelle douce, shōjo",
        tone: "mélancolique",
        primaryGenre: "romance",
      },
      stylePacks: [
        {
          renderFamily: "manga",
          shadingMode: "watercolor",
          lineWeight: "thin",
          backgroundDensity: "medium",
          negativeConstraints: [],
        },
      ],
    });

    expect(styleBible.palette).toBe("color_limited_palette");
    expect(styleBible.artStyle).not.toContain("black and white manga with screentones");
    expect(styleBible.forbiddenStyleKeywords).not.toContain("watercolor");
    expect(styleBible.screentoneIntensity).toBe("none");
  });
});
