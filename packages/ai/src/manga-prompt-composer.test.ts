import { describe, expect, it } from "vitest";
import { buildFixedRegressionSuite } from "@manga-ai-studio/world";
import { buildSceneBlueprint } from "@manga-ai-studio/world";
import { composeMangaPanelPrompt } from "./manga-prompt-composer";

describe("composeMangaPanelPrompt with scene blueprint", () => {
  it("injects scene blueprint constraints into the final prompt", () => {
    const sample = buildFixedRegressionSuite()[0];
    const sceneBlueprint = buildSceneBlueprint(sample.input);
    const result = composeMangaPanelPrompt({
      location: sample.input.scene.location,
      action: sample.input.narrative.panelIntent,
      camera: "wide establishing shot",
      mood: "tension",
      contentIntensityLayer: "TEEN",
      sceneContext: sample.input.narrative.sceneSummary,
      environmentHint: "ruined skyline visible",
      sceneBlueprint,
      stylePack: {
        visualStyle: sample.input.style.visualStyle,
        name: sample.input.style.renderFamily,
      },
      characters: [{ name: "Héros", gender: "male", appearance: "silhouette fatiguée" }],
    });

    expect(result.positive).toContain("scene blueprint narrative");
    expect(result.positive).toContain("strict constraints");
    expect(result.negative).toContain("empty background");
  });
});
