import { buildSceneBlueprint } from "./legacy/scene-blueprint";
import { runPropertyValidators } from "./property-validators";
import { hashSeed } from "./seeded-rng";
import type { SceneBlueprintQaCase, SceneBlueprintQaReport, SceneBlueprintInput } from "./types";

export function buildFixedRegressionSuite(): SceneBlueprintQaCase[] {
  return [
    {
      id: "postapo-hero-solo",
      title: "Extérieur post-apocalyptique avec héros seul",
      input: {
        panelId: "fixed-1",
        pageNumber: 1,
        panelNumber: 1,
        narrative: {
          sceneSummary: "Le héros traverse un wasteland ruiné seul, scrutant les traces d’un ancien combat.",
          scenePurpose: "établir le danger et la solitude",
          panelIntent: "montrer l’étendue du décor et la vulnérabilité du héros",
          pageRole: "establishing",
        },
        style: {
          universe: "post-apocalyptique",
          tone: "dark epic",
          visualStyle: "premium manga",
          renderFamily: "cinematic",
          backgroundDensity: "high",
        },
        scene: {
          location: "wasteland ruiné",
          worldState: ["collapse", "scarcity"],
          factions: ["survivors"],
        },
        composition: {
          shotType: "wide",
          cameraAngle: "eye_level",
          focusCharacters: ["Héros"],
          requiredCharacters: ["Héros"],
          backgroundExtras: [],
        },
        cast: { namedCharacters: ["Héros"], npcNames: [], creatureNames: [] },
        controls: {
          noveltyLevel: 45,
          worldStrictness: 90,
          visualExoticism: 40,
          npcVariety: 30,
          environmentRichness: 85,
        },
        continuity: { anchors: ["véhicules rouillés", "sol craquelé"], worldRules: [], styleRules: [], loreConstraints: [] },
      },
    },
    {
      id: "romantic-garden-duo",
      title: "Jardin romantique avec duo",
      input: {
        panelId: "fixed-2",
        pageNumber: 1,
        panelNumber: 2,
        narrative: {
          sceneSummary: "Deux personnages avancent dans un jardin romantique avant une confession hésitante.",
          scenePurpose: "préparer une confession intime",
          panelIntent: "rendre l’interaction crédible dans un décor lisible",
          pageRole: "escalation",
        },
        style: {
          universe: "romance",
          tone: "soft mélancolique",
          visualStyle: "premium manga",
          renderFamily: "shojo",
          backgroundDensity: "high",
        },
        scene: {
          location: "jardin fleuri",
          worldState: ["peaceful"],
          factions: [],
        },
        composition: {
          shotType: "medium",
          cameraAngle: "eye_level",
          focusCharacters: ["Luna", "Ari"],
          requiredCharacters: ["Luna", "Ari"],
          backgroundExtras: [],
        },
        cast: { namedCharacters: ["Luna", "Ari"], npcNames: [], creatureNames: [] },
        controls: {
          noveltyLevel: 40,
          worldStrictness: 88,
          visualExoticism: 35,
          npcVariety: 20,
          environmentRichness: 80,
        },
        continuity: { anchors: ["allée fleurie", "lumière dorée"], worldRules: [], styleRules: ["delicate composition"], loreConstraints: [] },
      },
    },
    {
      id: "cyberpunk-alley-with-npc",
      title: "Ruelle cyberpunk avec PNJ",
      input: {
        panelId: "fixed-3",
        pageNumber: 1,
        panelNumber: 3,
        narrative: {
          sceneSummary: "Luna traverse une ruelle cyberpunk où les passants et drones réagissent à sa fuite.",
          scenePurpose: "montrer la profondeur urbaine et la pression sociale",
          panelIntent: "faire sentir la foule, les enseignes et l'influence du décor sur la trajectoire",
          pageRole: "escalation",
        },
        style: {
          universe: "cyberpunk",
          tone: "tendu cool",
          visualStyle: "premium manga",
          renderFamily: "cinematic",
          backgroundDensity: "high",
        },
        scene: {
          location: "ruelle cyberpunk néon",
          worldState: ["surveillance", "urban chaos"],
          factions: ["megacorp"],
        },
        composition: {
          shotType: "wide",
          cameraAngle: "dutch",
          focusCharacters: ["Luna"],
          requiredCharacters: ["Luna"],
          backgroundExtras: ["crowd silhouettes", "hovering drones"],
        },
        cast: { namedCharacters: ["Luna"], npcNames: ["Passants"], creatureNames: [] },
        controls: {
          noveltyLevel: 55,
          worldStrictness: 88,
          visualExoticism: 45,
          npcVariety: 35,
          environmentRichness: 60,
        },
        continuity: { anchors: ["enseignes verticales", "flaques lumineuses"], worldRules: [], styleRules: ["layered neon depth"], loreConstraints: [] },
      },
    },
    {
      id: "abandoned-lab-creature",
      title: "Laboratoire abandonné avec créature",
      input: {
        panelId: "fixed-4",
        pageNumber: 1,
        panelNumber: 4,
        narrative: {
          sceneSummary: "Une créature sort d'un ancien caisson dans un laboratoire abandonné sous alarme rouge.",
          scenePurpose: "faire monter la menace et la lisibilité du décor scientifique",
          panelIntent: "montrer la menace, les props et le danger ambiant",
          pageRole: "revelation",
        },
        style: {
          universe: "sci-fi horror",
          tone: "oppressant",
          visualStyle: "premium manga",
          renderFamily: "seinen",
          backgroundDensity: "high",
        },
        scene: {
          location: "laboratoire abandonné",
          worldState: ["containment breach"],
          factions: ["research division"],
        },
        composition: {
          shotType: "medium",
          cameraAngle: "low_angle",
          focusCharacters: ["Créature"],
          requiredCharacters: ["Créature"],
          backgroundExtras: ["broken glass", "warning lights"],
        },
        cast: { namedCharacters: ["Créature"], npcNames: [], creatureNames: ["Créature"] },
        controls: {
          noveltyLevel: 48,
          worldStrictness: 92,
          visualExoticism: 66,
          npcVariety: 20,
          environmentRichness: 88,
        },
        continuity: { anchors: ["cuves fissurées", "signalétique technique"], worldRules: [], styleRules: ["threat readable"], loreConstraints: [] },
      },
    },
    {
      id: "arena-action-scene",
      title: "Arène / scène d'action",
      input: {
        panelId: "fixed-5",
        pageNumber: 1,
        panelNumber: 5,
        narrative: {
          sceneSummary: "Le duel éclate dans l'arène tandis que la foule se lève et que les gradins vibrent.",
          scenePurpose: "maximiser le dynamisme sans sacrifier le fond",
          panelIntent: "garder mouvement, profondeur et lisibilité du public",
          pageRole: "confrontation",
        },
        style: {
          universe: "shōnen",
          tone: "epic",
          visualStyle: "premium manga",
          renderFamily: "battle",
          backgroundDensity: "high",
        },
        scene: {
          location: "arène de tournoi",
          worldState: ["competition"],
          factions: ["challengers"],
        },
        composition: {
          shotType: "wide",
          cameraAngle: "low_angle",
          focusCharacters: ["Héros", "Rival"],
          requiredCharacters: ["Héros", "Rival"],
          backgroundExtras: ["spectator tiers", "arena banners"],
        },
        cast: { namedCharacters: ["Héros", "Rival"], npcNames: ["Foule"], creatureNames: [] },
        controls: {
          noveltyLevel: 52,
          worldStrictness: 84,
          visualExoticism: 54,
          npcVariety: 58,
          environmentRichness: 86,
        },
        continuity: { anchors: ["gradins", "bannières"], worldRules: [], styleRules: ["dynamic motion readability"], loreConstraints: [] },
      },
    },
    {
      id: "emotional-closeup",
      title: "Close-up émotionnel",
      input: {
        panelId: "fixed-6",
        pageNumber: 1,
        panelNumber: 6,
        narrative: {
          sceneSummary: "Luna retient ses larmes pendant que les lumières du jardin s'effacent derrière elle.",
          scenePurpose: "faire porter l'émotion sans perdre les indices du lieu",
          panelIntent: "close-up intense avec environnement encore lisible",
          pageRole: "aftermath",
        },
        style: {
          universe: "romance drama",
          tone: "soft melancholic",
          visualStyle: "premium manga",
          renderFamily: "shojo",
          backgroundDensity: "medium",
        },
        scene: {
          location: "jardin nocturne",
          worldState: ["after confession"],
          factions: [],
        },
        composition: {
          shotType: "closeup",
          cameraAngle: "eye_level",
          focusCharacters: ["Luna"],
          requiredCharacters: ["Luna"],
          backgroundExtras: ["blurred lanterns", "flower silhouettes"],
        },
        cast: { namedCharacters: ["Luna"], npcNames: [], creatureNames: [] },
        controls: {
          noveltyLevel: 38,
          worldStrictness: 90,
          visualExoticism: 30,
          npcVariety: 10,
          environmentRichness: 68,
        },
        continuity: { anchors: ["lanternes", "pétales"], worldRules: [], styleRules: ["emotional close-up with cues"], loreConstraints: [] },
      },
    },
  ];
}

export function buildProceduralStressSuite(base: SceneBlueprintInput, seeds: number[]): SceneBlueprintQaCase[] {
  return seeds.map((seed, index) => ({
    id: `stress-${index + 1}`,
    title: `Procedural stress seed ${seed}`,
    input: {
      ...base,
      seed,
      panelId: `${base.panelId}-stress-${seed}`,
    },
  }));
}

export function runBlueprintSuite(
  suiteId: SceneBlueprintQaReport["suiteId"],
  cases: SceneBlueprintQaCase[],
): SceneBlueprintQaReport {
  const results = cases.map((testCase) => {
    const blueprint = buildSceneBlueprint(testCase.input);
    const failures = runPropertyValidators(blueprint).filter((result) => !result.ok);
    return {
      caseId: testCase.id,
      seed: blueprint.seed,
      ok: failures.length === 0,
      failures,
    };
  });
  return {
    suiteId,
    total: results.length,
    passed: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
    results,
  };
}

export function buildMetamorphicPair(
  base: SceneBlueprintInput,
  overridesA: Partial<SceneBlueprintInput>,
  overridesB: Partial<SceneBlueprintInput>,
) {
  const seed = base.seed ?? hashSeed(base.panelId);
  const a = buildSceneBlueprint({ ...base, ...overridesA, seed, panelId: `${base.panelId}-meta-a` });
  const b = buildSceneBlueprint({ ...base, ...overridesB, seed, panelId: `${base.panelId}-meta-b` });
  return { a, b };
}
