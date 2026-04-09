import { buildSceneBlueprint } from "./scene-blueprint";
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
