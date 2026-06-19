/**
 * Evals — Visual Consistency Golden Set
 *
 * 9 types de scènes couvrant les cas critiques de cohérence visuelle.
 * Métriques : style consistency, character consistency, scene continuity,
 * beat alignment, SFX coherence.
 * Seuils : tous >= 0.9 pour un pass.
 */

import { detectVisualDrift } from "../services/visual-drift-detector";
import { buildPanelIntentCard } from "../services/panel-intent-card";
import { resolveChapterLookProfile } from "@manga-ai-studio/core";
import type { ChapterLookProfile } from "@manga-ai-studio/core";
import { runPanelQualityGate } from "../services/story-quality-gate";

export interface VisualConsistencyMetrics {
  styleConsistency: number;
  characterConsistency: number;
  sceneContinuity: number;
  beatAlignment: number;
  sfxCoherence: number;
  overall: number;
}

export interface EvalScenario {
  id: string;
  type:
    | "combat_turning_point"
    | "romance_tension"
    | "interrupted_confession"
    | "reveal"
    | "quiet_aftermath"
    | "crowd_scene"
    | "reroll_environment"
    | "reroll_character"
    | "infiltration";
  description: string;
  prompt: string;
  lookProfileMode: "premium_manga_bw" | "premium_manga_color" | "anime_cel_shaded_consistent";
  characters: Array<{
    name: string;
    gender: string;
    hairColor: string;
    eyeColor: string;
    hardTraits: string[];
    forbiddenVisualDrift: string[];
  }>;
  beatEventType: string;
  motionLevel: number;
  sfx: string[];
  expectedMetrics: VisualConsistencyMetrics;
}

/** Golden set — 9 scènes de référence */
export const GOLDEN_SET: EvalScenario[] = [
  {
    id: "eval_combat_turning_point",
    type: "combat_turning_point",
    description: "Combat turning point — mouvement lisible, conséquence visible",
    prompt: "male warrior with silver hair and red scar, dynamic action scene, speed lines, impact burst, decisive blow, manga style, black and white ink, cel shading, motion blur, attacker on left defender on right, consequence visible",
    lookProfileMode: "premium_manga_bw",
    characters: [
      { name: "Kael", gender: "male", hairColor: "silver", eyeColor: "blue", hardTraits: ["silver hair", "red scar on cheek"], forbiddenVisualDrift: ["blonde hair", "no scar"] },
    ],
    beatEventType: "combat_turning_point",
    motionLevel: 9,
    sfx: ["SMASH", "CRACK"],
    expectedMetrics: { styleConsistency: 0.9, characterConsistency: 0.9, sceneContinuity: 0.9, beatAlignment: 0.9, sfxCoherence: 0.9, overall: 0.9 },
  },
  {
    id: "eval_romance_tension",
    type: "romance_tension",
    description: "Romance tension — proximité, regard, pas de SFX impact",
    prompt: "female protagonist with black hair and green eyes, male character with brown hair, intimate framing close-up, eye contact, hesitation visible, soft lighting, manga style, colored manga, no impact SFX, proximity between characters",
    lookProfileMode: "premium_manga_color",
    characters: [
      { name: "Yuki", gender: "female", hairColor: "black", eyeColor: "green", hardTraits: ["black hair", "green eyes"], forbiddenVisualDrift: ["blonde hair", "blue eyes"] },
      { name: "Ren", gender: "male", hairColor: "brown", eyeColor: "brown", hardTraits: ["brown hair"], forbiddenVisualDrift: ["silver hair"] },
    ],
    beatEventType: "romance_tension",
    motionLevel: 1,
    sfx: [],
    expectedMetrics: { styleConsistency: 0.9, characterConsistency: 0.9, sceneContinuity: 0.9, beatAlignment: 0.9, sfxCoherence: 1.0, overall: 0.9 },
  },
  {
    id: "eval_interrupted_confession",
    type: "interrupted_confession",
    description: "Confession interrompue — contraste élan/cassure",
    prompt: "female character leaning forward confession beginning, male character arriving as interruption, sharp visual break, both characters readable, manga style, colored manga, emotional expression visible",
    lookProfileMode: "premium_manga_color",
    characters: [
      { name: "Yuki", gender: "female", hairColor: "black", eyeColor: "green", hardTraits: ["black hair"], forbiddenVisualDrift: [] },
    ],
    beatEventType: "interruption",
    motionLevel: 5,
    sfx: [],
    expectedMetrics: { styleConsistency: 0.9, characterConsistency: 0.9, sceneContinuity: 0.8, beatAlignment: 0.9, sfxCoherence: 1.0, overall: 0.9 },
  },
  {
    id: "eval_reveal",
    type: "reveal",
    description: "Révélation — focus clair, pas de bruit visuel",
    prompt: "dramatic reveal, focal point centered, character reaction visible, shocked expression, no cluttered background, clear information readable, manga style, black and white ink",
    lookProfileMode: "premium_manga_bw",
    characters: [
      { name: "Kael", gender: "male", hairColor: "silver", eyeColor: "blue", hardTraits: ["silver hair"], forbiddenVisualDrift: [] },
    ],
    beatEventType: "reveal",
    motionLevel: 2,
    sfx: [],
    expectedMetrics: { styleConsistency: 0.9, characterConsistency: 0.9, sceneContinuity: 0.9, beatAlignment: 0.9, sfxCoherence: 1.0, overall: 0.9 },
  },
  {
    id: "eval_quiet_aftermath",
    type: "quiet_aftermath",
    description: "Aftermath silencieux — coût émotionnel, pas de SFX action",
    prompt: "aftermath scene, character sitting exhausted, wide shot showing scale of consequence, silence and stillness, emotional weight visible, manga style, black and white ink, no speed lines",
    lookProfileMode: "premium_manga_bw",
    characters: [
      { name: "Kael", gender: "male", hairColor: "silver", eyeColor: "blue", hardTraits: ["silver hair"], forbiddenVisualDrift: [] },
    ],
    beatEventType: "aftermath",
    motionLevel: 1,
    sfx: [],
    expectedMetrics: { styleConsistency: 0.9, characterConsistency: 0.9, sceneContinuity: 0.9, beatAlignment: 0.9, sfxCoherence: 1.0, overall: 0.9 },
  },
  {
    id: "eval_crowd_scene",
    type: "crowd_scene",
    description: "Scène de foule — focal character visible, crowd reactive",
    prompt: "crowd reaction scene, protagonist in foreground, crowd in background reactive, wide shot, social pressure visible, manga style, colored manga, crowd emotion readable",
    lookProfileMode: "premium_manga_color",
    characters: [
      { name: "Kael", gender: "male", hairColor: "silver", eyeColor: "blue", hardTraits: ["silver hair"], forbiddenVisualDrift: [] },
    ],
    beatEventType: "crowd_reaction",
    motionLevel: 4,
    sfx: ["MURMUR"],
    expectedMetrics: { styleConsistency: 0.9, characterConsistency: 0.8, sceneContinuity: 0.9, beatAlignment: 0.9, sfxCoherence: 0.9, overall: 0.9 },
  },
  {
    id: "eval_reroll_environment",
    type: "reroll_environment",
    description: "Reroll environnement — personnage préservé, décor changé",
    prompt: "male warrior with silver hair and red scar, new background forest environment, character identity preserved, silver hair visible, red scar on cheek, manga style, black and white ink",
    lookProfileMode: "premium_manga_bw",
    characters: [
      { name: "Kael", gender: "male", hairColor: "silver", eyeColor: "blue", hardTraits: ["silver hair", "red scar on cheek"], forbiddenVisualDrift: ["blonde hair"] },
    ],
    beatEventType: "establishing",
    motionLevel: 2,
    sfx: [],
    expectedMetrics: { styleConsistency: 0.9, characterConsistency: 0.9, sceneContinuity: 0.7, beatAlignment: 0.9, sfxCoherence: 1.0, overall: 0.9 },
  },
  {
    id: "eval_reroll_character",
    type: "reroll_character",
    description: "Reroll personnage — hard traits respectés",
    prompt: "male warrior with silver hair, red scar on cheek, blue eyes, strong build, manga style, black and white ink, hard lock silver hair, hard lock red scar",
    lookProfileMode: "premium_manga_bw",
    characters: [
      { name: "Kael", gender: "male", hairColor: "silver", eyeColor: "blue", hardTraits: ["silver hair", "red scar on cheek", "blue eyes"], forbiddenVisualDrift: ["blonde hair", "no scar", "brown eyes"] },
    ],
    beatEventType: "reaction",
    motionLevel: 2,
    sfx: [],
    expectedMetrics: { styleConsistency: 0.9, characterConsistency: 0.95, sceneContinuity: 0.9, beatAlignment: 0.9, sfxCoherence: 1.0, overall: 0.9 },
  },
  {
    id: "eval_infiltration",
    type: "infiltration",
    description: "Infiltration — tension, atmosphère sombre, pas de bruit",
    prompt: "infiltration scene, character moving silently in shadows, tension atmosphere, dark environment, high contrast lighting, manga style, black and white ink, no crowd, stealth movement implied",
    lookProfileMode: "premium_manga_bw",
    characters: [
      { name: "Kael", gender: "male", hairColor: "silver", eyeColor: "blue", hardTraits: ["silver hair"], forbiddenVisualDrift: [] },
    ],
    beatEventType: "tension",
    motionLevel: 3,
    sfx: [],
    expectedMetrics: { styleConsistency: 0.9, characterConsistency: 0.9, sceneContinuity: 0.9, beatAlignment: 0.9, sfxCoherence: 1.0, overall: 0.9 },
  },
];

/** Thresholds pour le pass */
export const EVAL_THRESHOLDS = {
  styleConsistency: 0.9,
  characterConsistency: 0.9,
  beatAlignment: 0.9,
  sfxCoherence: 0.9,
  overall: 0.9,
};

/** Évaluer un scénario contre le golden set */
export function evaluateScenario(scenario: EvalScenario): {
  metrics: VisualConsistencyMetrics;
  passed: boolean;
  failures: string[];
} {
  const lookProfile: ChapterLookProfile = resolveChapterLookProfile(scenario.lookProfileMode);

  const intentCard = buildPanelIntentCard({
    purpose: scenario.beatEventType,
    mood: null,
    scenePurpose: scenario.description,
    sfx: scenario.sfx,
    cameraShot: "medium",
  });

  const driftResult = detectVisualDrift({
    prompt: scenario.prompt,
    characters: scenario.characters.map((c) => ({
      name: c.name,
      gender: c.gender,
      hairColor: c.hairColor,
      eyeColor: c.eyeColor,
      bodyDetails: null,
      appearance: null,
      hardTraits: c.hardTraits,
      forbiddenVisualDrift: c.forbiddenVisualDrift,
      canonicalReferenceAvailable: false,
    })),
    usedLoras: false,
    usedRefs: false,
    beatEventType: scenario.beatEventType,
    chapterLookProfile: lookProfile,
    intentCard: {
      beatEventType: intentCard.beatEventType,
      motionLevel: intentCard.motionLevel,
      actionIntensity: intentCard.actionIntensity,
      mustShow: intentCard.mustShow,
      sfxForbiddenTypes: intentCard.sfxForbiddenTypes,
    },
  });

  const panelGate = runPanelQualityGate({
    panelPrompt: scenario.prompt,
    beatEventType: scenario.beatEventType,
    motionLevel: scenario.motionLevel,
    sfx: scenario.sfx,
    chapterLookProfileMode: scenario.lookProfileMode,
    sfxForbiddenTypes: intentCard.sfxForbiddenTypes,
    mustShow: intentCard.mustShow,
  });

  const metrics: VisualConsistencyMetrics = {
    styleConsistency: driftResult.styleDriftScore / 100,
    characterConsistency: driftResult.characterDriftScore / 100,
    sceneContinuity: driftResult.sceneContinuityScore / 100,
    beatAlignment: driftResult.beatAlignmentScore / 100,
    sfxCoherence: panelGate.sfxCoherenceOk ? 1.0 : 0.5,
    overall: driftResult.score / 100,
  };

  const failures: string[] = [];
  if (metrics.styleConsistency < EVAL_THRESHOLDS.styleConsistency) {
    failures.push(`styleConsistency: ${metrics.styleConsistency.toFixed(2)} < ${EVAL_THRESHOLDS.styleConsistency}`);
  }
  if (metrics.characterConsistency < EVAL_THRESHOLDS.characterConsistency) {
    failures.push(`characterConsistency: ${metrics.characterConsistency.toFixed(2)} < ${EVAL_THRESHOLDS.characterConsistency}`);
  }
  if (metrics.beatAlignment < EVAL_THRESHOLDS.beatAlignment) {
    failures.push(`beatAlignment: ${metrics.beatAlignment.toFixed(2)} < ${EVAL_THRESHOLDS.beatAlignment}`);
  }
  if (metrics.sfxCoherence < EVAL_THRESHOLDS.sfxCoherence) {
    failures.push(`sfxCoherence: ${metrics.sfxCoherence.toFixed(2)} < ${EVAL_THRESHOLDS.sfxCoherence}`);
  }

  return {
    metrics,
    passed: failures.length === 0,
    failures,
  };
}

/** Évaluer tout le golden set */
export function runGoldenSetEval(): {
  results: Array<{ scenario: EvalScenario; metrics: VisualConsistencyMetrics; passed: boolean; failures: string[] }>;
  passCount: number;
  failCount: number;
  overallPass: boolean;
} {
  const results = GOLDEN_SET.map((scenario) => ({
    scenario,
    ...evaluateScenario(scenario),
  }));

  const passCount = results.filter((r) => r.passed).length;
  const failCount = results.length - passCount;

  return {
    results,
    passCount,
    failCount,
    overallPass: failCount === 0,
  };
}
