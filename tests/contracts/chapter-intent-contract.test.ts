import { describe, expect, it } from "vitest";
import { chapterIntentContractSchema } from "@manga-ai-studio/core";

describe("chapterIntentContractSchema", () => {
  it("parse un contrat minimal valide", () => {
    const c = chapterIntentContractSchema.parse({
      rawUserIntent: "Le héros explore une ville cyberpunk sous la pluie et affronte une créature mécanique.",
      understoodPitch: "Exploration urbaine cyberpunk et confrontation avec une créature mécanique.",
      mustInclude: ["ville sous la pluie", "créature mécanique"],
      mustAvoid: ["changer le masque du héros"],
      requiredCharacters: ["Kenji"],
      requiredLocations: ["ruelles"],
      requiredNpcs: [],
      requiredCreatures: ["loup mécanique"],
      requiredProps: ["katana"],
      emotionalGoal: "isolement puis adrénaline",
      plotGoal: "introduire la menace",
      characterArcGoal: "premier pas hors de la zone de confort",
      tone: "noir / néon",
      pacing: "fast",
      dialogueDensity: "low",
      expectedCliffhanger: true,
      ambiguityFlags: [],
      confidenceScore: 0.88,
    });
    expect(c.confidenceScore).toBeGreaterThanOrEqual(0.75);
    expect(c.pacing).toBe("fast");
  });

  it("rejette une confiance hors plage", () => {
    expect(() =>
      chapterIntentContractSchema.parse({
        rawUserIntent: "x",
        understoodPitch: "x",
        emotionalGoal: "",
        plotGoal: "",
        characterArcGoal: "",
        tone: "",
        pacing: "balanced",
        dialogueDensity: "medium",
        expectedCliffhanger: false,
        confidenceScore: 1.5,
      }),
    ).toThrow();
  });
});
