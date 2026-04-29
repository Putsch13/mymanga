import { describe, expect, it } from "vitest";
import { buildFixedRegressionSuite } from "@manga-ai-studio/world";
import { buildSceneBlueprint } from "@manga-ai-studio/world/scene-blueprint";
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
    // H5 — le bloc "Mandatory constraints: ..." a été retiré du prompt
    // composé (les contraintes sont validées en amont). On vérifie
    // désormais que le prompt N'inclut PAS cette prose générique.
    expect(result.positive).not.toContain("Mandatory constraints");
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

describe("P0.1 — Cutaway panels ne reçoivent jamais de hero lock", () => {
  it("subjectFocus=environment → pas de Subject lock héros", () => {
    const result = composeMangaPanelPrompt({
      location: "cité fortifiée",
      action: "Vue d'ensemble de la cité au lever du soleil",
      camera: "wide establishing shot",
      mood: "calm",
      contentIntensityLayer: "TEEN",
      subjectFocus: "environment",
      characters: [
        { name: "Lyra", importanceTier: "MAIN_HERO", lockStrength: "HARD_LOCK" },
      ],
    });

    expect(result.positive).not.toContain("Subject lock:");
    expect(result.positive).not.toContain("HARD_LOCK");
    expect(result.negative).toContain("hero panel");
    expect(result.negative).toContain("protagonist centered");
  });

  it("subjectFocus=prop → pas de Subject lock héros", () => {
    const result = composeMangaPanelPrompt({
      location: "table de travail",
      action: "Insert sur une lettre scellée",
      camera: "close-up on face",
      mood: "tension",
      contentIntensityLayer: "TEEN",
      subjectFocus: "prop",
      characters: [
        { name: "Lyra", importanceTier: "MAIN_HERO", lockStrength: "HARD_LOCK" },
      ],
    });

    expect(result.positive).not.toContain("Subject lock:");
    expect(result.negative).toContain("hero portrait");
  });

  it("subjectFocus=reaction → pas de Subject lock héros", () => {
    const result = composeMangaPanelPrompt({
      location: "taverne",
      action: "Plan réaction d'un PNJ choqué",
      camera: "close-up on face",
      mood: "emotion",
      contentIntensityLayer: "TEEN",
      subjectFocus: "reaction",
      heroCenterAllowed: false,
      characters: [
        { name: "Lyra", importanceTier: "MAIN_HERO", lockStrength: "HARD_LOCK" },
        { name: "Tavernier", importanceTier: "RECURRING_NPC", lockStrength: "LIGHT" },
      ],
    });

    expect(result.positive).not.toContain("Subject lock:");
    expect(result.negative).toContain("hero panel");
  });

  it("cutawayType=crowd → pas de hero lock même si héros présent", () => {
    const result = composeMangaPanelPrompt({
      location: "place du marché",
      action: "Réaction de la foule à l'annonce",
      camera: "wide establishing shot",
      mood: "tension",
      contentIntensityLayer: "TEEN",
      cutawayType: "crowd",
      characters: [
        { name: "Lyra", importanceTier: "MAIN_HERO", lockStrength: "HARD_LOCK" },
      ],
    });

    expect(result.positive).not.toContain("Subject lock:");
    expect(result.negative).toContain("main character foreground");
  });

  it("cutawayType=npc_group → pas de hero lock sur les gardes", () => {
    const result = composeMangaPanelPrompt({
      location: "poste de garde",
      action: "Les gardes patrouillent dans le couloir",
      camera: "medium shot",
      mood: "tension",
      contentIntensityLayer: "TEEN",
      cutawayType: "npc_group",
      characters: [
        { name: "Lyra", importanceTier: "MAIN_HERO", lockStrength: "HARD_LOCK" },
      ],
    });

    expect(result.positive).not.toContain("Subject lock:");
    expect(result.negative).toContain("hero showcase");
  });

  it("subjectFocus=hero garde le Subject lock", () => {
    const result = composeMangaPanelPrompt({
      location: "arène",
      action: "Lyra dégaine son épée",
      camera: "medium shot",
      mood: "action",
      contentIntensityLayer: "TEEN",
      subjectFocus: "hero",
      characters: [
        { name: "Lyra", importanceTier: "MAIN_HERO", lockStrength: "HARD_LOCK" },
      ],
    });

    expect(result.positive).toContain("Subject lock:");
    expect(result.positive).toContain("[Lyra]");
  });
});
