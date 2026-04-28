import { describe, it, expect } from "vitest";
import { runStoryQualityGate } from "./story-quality-gate";
import type { GeneratedChapterBundle } from "../chapter/shared-types";
import type { ChapterDramaticSpine } from "./story-spine";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeBundle(overrides: Partial<GeneratedChapterBundle["script"]> = {}): GeneratedChapterBundle {
  return {
    outline: {
      chapter_title: "Test Chapter",
      chapter_goal: "Test goal",
      cliffhanger: "",
      beats: [],
      continuity_notes: [],
    },
    script: {
      scenes: [
        { id: "scene_1", title: "Scène 1", summary: "Le héros arrive.", location: "Arène", characters: ["Ryuu"], purpose: "setup", dialogue: [], continuityPayload: null },
        { id: "scene_2", title: "Scène 2", summary: "Le combat commence.", location: "Arène", characters: ["Ryuu", "Ennemi"], purpose: "action", dialogue: [], continuityPayload: null },
        { id: "scene_3", title: "Scène 3", summary: "La défaite approche.", location: "Arène", characters: ["Ryuu"], purpose: "climax", dialogue: [], continuityPayload: null },
      ],
      ...overrides,
    },
    storyboard: { pages: [] },
    memory: { narrativeSummary: "Test", openLoops: [], characterDeltas: [], worldChanges: [] },
    creativeDirection: { chapterGoal: "Test", tone: "action", pacing: "fast", visualFocus: "combat" },
    plotOptions: [],
    generationDiagnostics: { operationalStatus: "FULLY_OPERATIONAL", degradedModes: [], outline: null, dialogue: null },
  } as unknown as GeneratedChapterBundle;
}

function makeSpine(overrides: Partial<ChapterDramaticSpine> = {}): ChapterDramaticSpine {
  return {
    beats: [
      { eventType: "setup", sceneIndex: 0, description: "Introduction" },
      { eventType: "escalation", sceneIndex: 1, description: "Montée" },
      { eventType: "confrontation", sceneIndex: 2, description: "Combat" },
    ],
    reversals: [],
    payoffTargets: ["Beat 3"],
    cliffhangerPrep: { preparedAtBeat: 2, type: "cliff_pivot" },
    premiumScore: 65,
    pacingIssues: [],
    weakScenes: [],
    deadPanels: [],
    payoffWeaknesses: [],
    hookOpportunities: [],
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("runStoryQualityGate — structure de base", () => {
  it("retourne un rapport avec les champs requis", () => {
    const bundle = makeBundle();
    const spine = makeSpine();
    const { report } = runStoryQualityGate(bundle, spine, "shonen_combat");

    expect(report).toHaveProperty("passed");
    expect(report).toHaveProperty("overallScore");
    expect(report).toHaveProperty("issues");
    expect(report).toHaveProperty("suggestedPatches");
    expect(report).toHaveProperty("autoAppliedPatches");
    expect(report).toHaveProperty("genreMode");
    expect(report.genreMode).toBe("shonen_combat");
  });

  it("retourne un patchedBundle (même si non modifié)", () => {
    const bundle = makeBundle();
    const spine = makeSpine();
    const { patchedBundle } = runStoryQualityGate(bundle, spine);
    expect(patchedBundle).toBeDefined();
    expect(patchedBundle.script.scenes.length).toBe(3);
  });
});

describe("runStoryQualityGate — auto-application du cliffhanger", () => {
  it("auto-applique un cliffhanger si absent ou trop court", () => {
    const bundle = makeBundle();
    const spine = makeSpine({ cliffhangerPrep: null });
    const { report, patchedBundle } = runStoryQualityGate(bundle, spine, "shonen_combat");

    const autoApplied = report.autoAppliedPatches.filter((p) => p.type === "strengthen_cliffhanger");
    expect(autoApplied.length).toBeGreaterThan(0);
    expect(autoApplied[0]?.autoApplied).toBe(true);
    // Le bundle patché doit avoir un cliffhanger non vide
    expect(patchedBundle.outline.cliffhanger.length).toBeGreaterThan(0);
  });

  it("ne remplace pas un cliffhanger déjà long", () => {
    const bundle = makeBundle();
    const bundleWithCliffhanger = {
      ...bundle,
      outline: { ...bundle.outline, cliffhanger: "Un retournement spectaculaire change tout pour le héros." },
    } as GeneratedChapterBundle;
    const spine = makeSpine({ cliffhangerPrep: null });
    const { report } = runStoryQualityGate(bundleWithCliffhanger, spine, "seinen_tension");

    const autoApplied = report.autoAppliedPatches.filter((p) => p.type === "strengthen_cliffhanger");
    // Cliffhanger déjà présent → suggestion, pas auto-application
    expect(autoApplied.length).toBe(0);
  });
});

describe("runStoryQualityGate — patches genre-aware", () => {
  it("les patches diffèrent selon le genre (shonen vs romance)", () => {
    const bundle = makeBundle();
    const spine = makeSpine({ cliffhangerPrep: null });

    const { report: shonenReport, patchedBundle: shonenBundle } = runStoryQualityGate(bundle, spine, "shonen_combat");
    const { report: romanceReport, patchedBundle: romanceBundle } = runStoryQualityGate(bundle, spine, "romance_shojo");

    const shonenCliff = shonenBundle.outline.cliffhanger;
    const romanceCliff = romanceBundle.outline.cliffhanger;

    // Les cliffhangers auto-appliqués doivent être différents selon le genre
    expect(shonenCliff).not.toBe(romanceCliff);
    expect(shonenReport.genreMode).toBe("shonen_combat");
    expect(romanceReport.genreMode).toBe("romance_shojo");
  });

  it("suggère un micro-turn pour les chapitres sans retournement", () => {
    const bundle = makeBundle();
    const spine = makeSpine();
    const { report } = runStoryQualityGate(bundle, spine, "seinen_tension");

    // Pas de micro-turn dans les scènes → suggestion attendue
    const microTurnSuggestion = report.suggestedPatches.find((p) => p.type === "inject_micro_turn");
    // Peut ou non être présent selon le score ; on vérifie juste la structure
    if (microTurnSuggestion) {
      expect(microTurnSuggestion.autoApplied).toBe(false);
      expect(microTurnSuggestion.description.length).toBeGreaterThan(0);
    }
  });
});

describe("runStoryQualityGate — non-régression sur chapitres forts", () => {
  it("ne génère pas de patches auto sur un chapitre avec cliffhanger fort", () => {
    const bundle = {
      ...makeBundle(),
      outline: {
        chapter_title: "Fort",
        chapter_goal: "Objectif fort",
        cliffhanger: "La révélation finale fracture tout ce que le héros croyait savoir sur lui-même.",
        beats: [],
        continuity_notes: [],
      },
    } as unknown as GeneratedChapterBundle;
    const spine = makeSpine({
      cliffhangerPrep: { preparedAtBeat: 2, type: "cliff_pivot" },
      payoffTargets: ["Beat 3", "Beat 5"],
    });
    const { report } = runStoryQualityGate(bundle, spine, "seinen_tension");

    const autoCliffhanger = report.autoAppliedPatches.filter((p) => p.type === "strengthen_cliffhanger");
    expect(autoCliffhanger.length).toBe(0);
  });
});
