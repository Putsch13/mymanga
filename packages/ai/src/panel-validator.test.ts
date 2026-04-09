import { describe, expect, it } from "vitest";
import { validateGeneratedPanel } from "./panel-validator";
import type { SceneBlueprint } from "@manga-ai-studio/world";

const blueprint: SceneBlueprint = {
  id: "panel-1",
  seed: 42,
  narrativeContext: {
    chapterGoal: "survivre",
    sceneSummary: "Luna fuit dans une ruelle néon sous la pluie.",
    scenePurpose: "installer le danger",
    panelIntent: "Luna glisse entre les enseignes et se plaque au mur.",
    panelNarration: null,
    pageRole: "setup",
    progressionBeat: "installer le danger -> esquive",
  },
  styleContext: {
    universe: "cyberpunk",
    tone: "tendu",
    visualStyle: "premium manga noir",
    renderFamily: "manga",
    cameraLanguage: "manga_dynamic",
    backgroundDensity: "high",
    noveltyLevel: 60,
    worldStrictness: 85,
    visualExoticism: 50,
    npcVariety: 55,
    environmentRichness: 85,
  },
  environment: {
    primaryLocation: "ruelle cyberpunk",
    secondaryLocationSignals: ["flaques lumineuses"],
    weather: "rain",
    timeOfDay: "night",
    atmosphereSignals: ["vapeur", "perspective néon"],
    foregroundElements: ["Luna"],
    midgroundElements: ["passant augmenté"],
    backgroundElements: ["enseignes verticales", "flaques lumineuses"],
    mustShowLocationSignals: ["ruelle cyberpunk", "enseignes verticales", "flaques lumineuses"],
    persistentSceneAnchors: ["ruelle cyberpunk", "enseignes verticales"],
    props: ["parapluie transparent"],
    traces: ["vapeur sortant des bouches d’aération"],
  },
  cast: {
    foregroundSubjects: ["Luna"],
    midgroundSubjects: ["passant augmenté"],
    backgroundSubjects: ["silhouettes en profondeur"],
    npcPresence: ["passant augmenté"],
    creaturePresence: [],
  },
  composition: {
    shotType: "wide",
    cameraAngle: "eye_level",
    framingRules: ["full environment visible"],
    interactionBeat: "oblige à se coller aux murs",
    spatialRelations: ["foreground: Luna", "midground: passant augmenté", "background: enseignes verticales"],
  },
  constraints: {
    hard: ["Respect universe: cyberpunk"],
    soft: ["Environment richness bounded at 85/100"],
    graph: { nodes: [], edges: [] },
    decision: { accepted: true, hardFailures: [], softWarnings: [], score: 1 },
  },
  procedural: {
    selectedNpcs: { primary: [], secondary: [], traces: [] },
    selectedLocations: { primary: [], secondary: [], traces: [] },
    selectedCreatures: { primary: [], secondary: [], traces: [] },
  },
  promptBridge: {
    actionLine: "Luna se plaque au mur.",
    sceneContextLine: "progression: danger",
    environmentLine: "location signals: ruelle cyberpunk, enseignes verticales",
    hardConstraintLine: "Respect universe: cyberpunk",
    softConstraintLine: "Environment richness bounded at 85/100",
  },
};

describe("panel validator premium scoring", () => {
  it("flags weak environment on wide shots", async () => {
    const result = await validateGeneratedPanel({
      panelId: "panel-1",
      imageUrl: "https://example.com/panel.png",
      requiredCharacters: [],
      metadata: {
        prompt: "close framing on Luna portrait, moody face, soft blur background",
        sceneBlueprint: blueprint,
        panelContract: {
          shotType: "wide",
          backgroundExtras: ["enseignes verticales", "flaques lumineuses"],
        },
        stylePack: {
          renderFamily: "manga",
          cameraLanguage: "manga_dynamic",
          backgroundDensity: "high",
        },
      },
    });

    expect(result.requiredReroll).toBe(true);
    expect(result.qualityScores?.backgroundPresenceScore).toBeLessThan(0.62);
    expect(result.issues.some((issue) => issue.type === "empty_background")).toBe(true);
  });

  it("keeps strong structured prompts above release threshold", async () => {
    const result = await validateGeneratedPanel({
      panelId: "panel-2",
      imageUrl: "https://example.com/panel.png",
      requiredCharacters: [],
      metadata: {
        prompt:
          "wide shot, full environment visible, Luna in foreground, passant augmenté in midground, enseignes verticales and flaques lumineuses in background, character and environment both readable, spatial relation preserved, environment affects action, oblige à se coller aux murs, location signals: ruelle cyberpunk, enseignes verticales, flaques lumineuses, manga, manga_dynamic, high background density, medium line weight, ink_bw shading, dramatic contrast",
        sceneBlueprint: blueprint,
        panelContract: {
          shotType: "wide",
          backgroundExtras: ["enseignes verticales", "flaques lumineuses"],
        },
        stylePack: {
          renderFamily: "manga",
          lineWeight: "medium",
          shadingMode: "ink_bw",
          contrastProfile: "dramatic",
          cameraLanguage: "manga_dynamic",
          backgroundDensity: "high",
        },
      },
    });

    expect(result.requiredReroll).toBe(false);
    expect(result.qualityScores?.releaseScore).toBeGreaterThan(0.72);
  });
});
