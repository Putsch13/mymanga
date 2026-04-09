import { describe, expect, it } from "vitest";
import { buildPanelContract } from "./build-panel-contract";

describe("buildPanelContract", () => {
  it("construit un contrat décor riche pour un establishing shot", async () => {
    const contract = await buildPanelContract({
      panelId: "scene-1:1",
      pageNumber: 1,
      panelNumber: 1,
      panel: {
        panelNumber: 1,
        sceneId: "scene-1",
        beatId: "beat-1",
        caption: "Wide establishing shot sur une ruelle cyberpunk sous la pluie.",
        prompt: "neon street, crowd, surveillance camera, market stall, Luna avance parmi les flaques",
        negativePrompt: "plain backdrop",
        camera: "wide establishing shot",
        characters: ["Luna"],
        mood: "tension",
      },
      sceneContext: {
        location: "Ruelle cyberpunk",
        timeOfDay: "night",
        atmosphere: "tension sous la pluie",
        presentCharacters: ["Luna", "Suko"],
      },
      previousPanelId: undefined,
      visualAnchorIds: ["ref-1"],
    });

    expect(contract.shotType).toBe("wide");
    expect(contract.backgroundExtras.length).toBeGreaterThan(0);
    expect(contract.mustNotShow).toContain("empty background");
    expect(contract.persistentSceneAnchors?.length).toBeGreaterThan(0);
    expect(contract.mustShowLocationSignals?.length).toBeGreaterThan(0);
  });
});
