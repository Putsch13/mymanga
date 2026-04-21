import { describe, expect, it } from "vitest";
import { buildPanelContract } from "./build-panel-contract";
import type { BeatNarrativeContract } from "@manga-ai-studio/core";

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

  it("verrouille les signaux de cour de lycée et la présence d'élèves", async () => {
    const contract = await buildPanelContract({
      panelId: "scene-school:1",
      pageNumber: 1,
      panelNumber: 1,
      panel: {
        panelNumber: 1,
        sceneId: "scene-school",
        beatId: "beat-school",
        caption: "Wide establishing shot sur la cour du lycée où Miro est humilié devant les élèves.",
        prompt: "school courtyard, students surrounding Miro, public humiliation, campus architecture readable",
        negativePrompt: "plain backdrop",
        camera: "wide establishing shot",
        characters: ["Miro", "Kutsi"],
        mood: "tension",
      },
      sceneContext: {
        location: "cour du lycée",
        atmosphere: "humiliation publique",
        presentCharacters: ["Miro", "Kutsi"],
      },
      visualAnchorIds: [],
    });

    expect(contract.mustShow).toContain("visible students around the main action");
    expect(contract.mustShowLocationSignals).toContain("school courtyard ground markings and gathering space");
    expect(contract.backgroundExtras.join(" ")).toContain("students");
    expect(contract.mustNotShow).toContain("empty school background");
  });

  describe("deducePurpose priority (Phase 1)", () => {
    const dialogueBeat: BeatNarrativeContract = {
      beatId: "b1",
      summary: "characters argue on the rooftop",
      storyFunction: "dialogue_tension",
      actionEnvelope: "none",
      visualEscalationPolicy: "forbid_invented_action",
      causalInputs: [],
      causalOutputs: [],
      forbiddenVisualEvents: [],
      requiredVisualEvents: [],
    };

    it("n'infère plus 'action' depuis un prompt vague même sur un beat dialogue", async () => {
      // Before this refactor, a caption containing "fight" or "move"
      // promoted the panel to action. We now require a structured source
      // (blueprint.purpose or a combat-envelope beat) to get action.
      const contract = await buildPanelContract({
        panelId: "p1",
        pageNumber: 1,
        panelNumber: 1,
        panel: {
          panelNumber: 1,
          sceneId: "s1",
          beatId: "b1",
          caption: "they almost fight as they move forward",
          prompt: "tense exchange, rooftop, nightfall",
          negativePrompt: "",
          camera: "medium",
          characters: ["A", "B"],
          mood: "tension",
        },
        sceneContext: {
          location: "rooftop",
          presentCharacters: ["A", "B"],
        },
        visualAnchorIds: [],
        beatNarrativeContract: dialogueBeat,
      });
      expect(contract.purpose).not.toBe("action");
      expect(contract.purpose).toBe("dialogue");
    });

    it("respecte le purpose du panelBlueprint premium en priorité absolue", async () => {
      const contract = await buildPanelContract({
        panelId: "p1",
        pageNumber: 1,
        panelNumber: 1,
        panel: {
          panelNumber: 1,
          sceneId: "s1",
          beatId: "b1",
          caption: "wide establishing shot",
          prompt: "",
          negativePrompt: "",
          camera: "wide",
          characters: ["A"],
          mood: "tension",
        },
        sceneContext: {
          location: "rooftop",
          presentCharacters: ["A"],
        },
        visualAnchorIds: [],
        panelBlueprint: {
          panelId: "p1",
          beatId: "b1",
          panelNumber: 1,
          purpose: "reaction",
          shotType: "closeup",
          cameraAngle: "eye_level",
          subjectFocus: "hero" as never,
          mustShowEnemy: false,
          requiredNpcCount: 0,
          requiredProps: [],
          requiredLocationSignals: [],
          cutawayType: null as never,
          heroCenterAllowed: true,
          criticality: "medium" as never,
        } as never,
      });
      expect(contract.purpose).toBe("reaction");
    });

    it("promeut en 'action' uniquement quand le beat autorise combat_full", async () => {
      const contract = await buildPanelContract({
        panelId: "p1",
        pageNumber: 1,
        panelNumber: 1,
        panel: {
          panelNumber: 1,
          sceneId: "s1",
          beatId: "b1",
          caption: "fight scene",
          prompt: "",
          negativePrompt: "",
          camera: "medium",
          characters: ["A", "B"],
          mood: "action",
        },
        sceneContext: {
          location: "arena",
          presentCharacters: ["A", "B"],
        },
        visualAnchorIds: [],
        beatNarrativeContract: {
          ...dialogueBeat,
          storyFunction: "movement",
          actionEnvelope: "combat_full",
          visualEscalationPolicy: "allow_literal_only",
        },
      });
      expect(contract.purpose).toBe("action");
    });
  });
});
