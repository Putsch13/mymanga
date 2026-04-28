import { describe, expect, it } from "vitest";
import { buildStorySpine } from "./story-spine";
import type { GeneratedChapterBundle } from "../chapter/shared-types";

function makeBundle(overrides: Partial<GeneratedChapterBundle> = {}): GeneratedChapterBundle {
  return {
    generationDiagnostics: {
      operationalStatus: "full",
      degradedModes: [],
      outline: { fallbackReason: null, source: "generator_structured" },
      dialogue: { fallbackSceneIds: [] },
    },
    creativeDirection: {
      chapterGoal: "Test chapter",
      whyNow: "Because",
      emotionalArc: "rise",
      keyTension: "conflict",
    },
    plotOptions: [],
    outline: {
      chapter_goal: "Test chapter",
      cliffhanger: "Le héros découvre la vérité",
      beats: [
        {
          id: "beat-1",
          summary: "Le héros établit sa position dans l'arène",
          characters: ["Ryuu"],
          location: "Arène",
          pageRole: "setup",
          turn: "introduction",
          emotionalDelta: 0,
          structuredBeat: null,
        },
        {
          id: "beat-2",
          summary: "Le combat s'intensifie, Ryuu escalade la pression",
          characters: ["Ryuu", "Ennemi"],
          location: "Arène",
          pageRole: "escalation",
          turn: "montée en puissance",
          emotionalDelta: 2,
          structuredBeat: null,
        },
        {
          id: "beat-3",
          summary: "Ryuu révèle son pouvoir secret, twist surprise",
          characters: ["Ryuu"],
          location: "Arène",
          pageRole: "revelation",
          turn: "révélation",
          emotionalDelta: 3,
          structuredBeat: null,
        },
        {
          id: "beat-4",
          summary: "Silence après l'impact, aftermath calme",
          characters: ["Ryuu", "Ennemi"],
          location: "Arène",
          pageRole: "aftermath",
          turn: "respiration",
          emotionalDelta: -1,
          structuredBeat: null,
        },
      ],
    },
    script: {
      scenes: [
        {
          id: "scene_1",
          summary: "Le héros établit sa position dans l'arène",
          characters: ["Ryuu"],
          location: "Arène",
          dialogue: [],
        },
        {
          id: "scene_2",
          summary: "Le combat s'intensifie, Ryuu escalade la pression",
          characters: ["Ryuu", "Ennemi"],
          location: "Arène",
          dialogue: [],
        },
        {
          id: "scene_3",
          summary: "Ryuu révèle son pouvoir secret, mais l'ennemi contre-attaque",
          characters: ["Ryuu"],
          location: "Arène",
          dialogue: [],
        },
        {
          id: "scene_4",
          summary: "Silence après l'impact, aftermath calme",
          characters: ["Ryuu", "Ennemi"],
          location: "Arène",
          dialogue: [],
        },
      ],
    },
    storyboard: {
      pages: [
        {
          pageNumber: 1,
          panels: [
            { panelNumber: 1, caption: "Ryuu entre dans l'arène", characters: ["Ryuu"], shotType: "wide" },
          ],
        },
      ],
    },
    memory: {
      narrativeSummary: "Test",
      openLoops: [],
      characterStates: {},
    },
    ...overrides,
  } as unknown as GeneratedChapterBundle;
}

describe("buildStorySpine", () => {
  it("retourne une spine avec des beats classifiés", () => {
    const bundle = makeBundle();
    const spine = buildStorySpine(bundle, "shonen_combat");

    expect(spine.beats.length).toBeGreaterThan(0);
    expect(spine.beats[0].eventType).toBeDefined();
    expect(spine.beats[0].sceneIndex).toBe(0);
  });

  it("détecte un cliffhanger préparé quand reveal est présent", () => {
    const bundle = makeBundle();
    const spine = buildStorySpine(bundle, "shonen_combat");

    // La scène 3 contient "révèle" → devrait être classifiée comme reveal
    const hasRevealOrCliff = spine.beats.some((b) => b.eventType === "reveal" || b.eventType === "cliff_pivot");
    expect(hasRevealOrCliff).toBe(true);
  });

  it("calcule un premiumScore > 0", () => {
    const bundle = makeBundle();
    const spine = buildStorySpine(bundle, "shonen_combat");

    expect(spine.premiumScore).toBeGreaterThan(0);
    expect(spine.premiumScore).toBeLessThanOrEqual(100);
  });

  it("détecte des beats de type silent_aftermath", () => {
    const bundle = makeBundle();
    const spine = buildStorySpine(bundle, "quiet_aftermath");

    const hasAftermath = spine.beats.some((b) => b.eventType === "silent_aftermath");
    expect(hasAftermath).toBe(true);
  });

  it("retourne des payoffTargets depuis le cliffhanger de l'outline", () => {
    const bundle = makeBundle();
    const spine = buildStorySpine(bundle, "shonen_combat");

    expect(spine.payoffTargets.length).toBeGreaterThan(0);
    expect(spine.payoffTargets[0]).toContain("vérité");
  });

  it("identifie des scènes faibles si elles sont vides", () => {
    const bundle = makeBundle({
      script: {
        scenes: [
          { id: "scene_1", summary: "", characters: [], location: "Arène", dialogue: [] },
          { id: "scene_2", summary: "Scène normale avec contenu", characters: ["Ryuu"], location: "Arène", dialogue: [] },
        ],
      } as unknown as GeneratedChapterBundle["script"],
    });
    const spine = buildStorySpine(bundle, "shonen_combat");

    expect(spine.weakScenes).toContain(0);
    expect(spine.weakScenes).not.toContain(1);
  });
});
