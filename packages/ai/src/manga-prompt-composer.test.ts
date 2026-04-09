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

    expect(result.positive).toContain("Narrative context");
    expect(result.positive).toContain("Mandatory constraints");
    expect(result.negative).toContain("empty background");
  });

  it("force les signaux scolaires pour une cour de lycée validée", () => {
    const result = composeMangaPanelPrompt({
      location: "cour du lycée",
      action: "Miro est humilié devant Kutsi et ses amis, les élèves observent la scène",
      camera: "wide establishing shot",
      mood: "tension",
      contentIntensityLayer: "TEEN",
      sceneContext: "Humiliation publique dans la cour du lycée",
      environmentHint: "school courtyard, students visible, campus architecture readable",
      stylePack: {
        visualStyle: "lignes fines shonen",
        backgroundDensity: "high",
      },
    });

    expect(result.positive).toContain("Environment must stay readable");
    expect(result.positive).toContain("students visible in background");
    expect(result.negative).toContain("empty school courtyard");
  });
});
