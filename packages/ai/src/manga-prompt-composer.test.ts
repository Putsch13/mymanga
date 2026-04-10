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

    expect(result.positive).toContain("Continuity");
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

    expect(result.positive).toContain("Strict environment readability");
    expect(result.positive).toContain("students visible in background");
    expect(result.negative).toContain("empty school courtyard");
  });

  it("injecte la memoire legere d'un recurring NPC dans le lock personnage", () => {
    const result = composeMangaPanelPrompt({
      location: "rue commerçante",
      action: "Le hero recroise un marchand deja vu plusieurs fois",
      camera: "medium shot",
      mood: "dramatic",
      contentIntensityLayer: "TEEN",
      characters: [
        {
          name: "Marchand 12",
          importanceTier: "RECURRING_NPC",
          lockStrength: "MEDIUM",
          continuityBudget: "light",
          recurringMemory: "broad silhouette, hair braid, age adult, marker copper earring, outfit patched vest, seen 4 times",
        },
      ],
    });

    expect(result.positive).toContain("broad silhouette");
    expect(result.positive).toContain("marker copper earring");
    expect(result.positive).toContain("seen 4 times");
  });
});
