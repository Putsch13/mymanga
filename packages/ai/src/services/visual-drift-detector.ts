/**
 * Visual Drift Detector 2.0 — façade.
 *
 * Scoring heuristique symbolique post-génération. Sans analyse image réelle,
 * cette version croise prompt, signature canonique, refs disponibles, hard
 * traits, look profile et intent card pour exposer un drift lisible.
 *
 * Implémentation découpée dans `_visual-drift-detector/*`.
 */

import { checkCharacter } from "./_visual-drift-detector/character-checks";
import {
  computeBeatAlignmentScore,
  computeRecommendedAction,
  computeSceneContinuityScore,
  computeStyleDriftScore,
  scoreToSeverity,
} from "./_visual-drift-detector/sub-scores";
import { normalize } from "./_visual-drift-detector/text-utils";
import type {
  DriftCheckInput,
  DriftCheckResult,
  DriftTraitMismatch,
} from "./_visual-drift-detector/types";

export type {
  CharacterDriftInput,
  DriftCheckInput,
  DriftCheckResult,
  DriftRecommendedAction,
  DriftSeverity,
  DriftTraitMismatch,
} from "./_visual-drift-detector/types";

export function detectVisualDrift(input: DriftCheckInput): DriftCheckResult {
  const normalizedPrompt = normalize(input.prompt);
  let score = 100;
  let characterScore = 100;
  const reasons: string[] = [];
  const missingTraits: DriftTraitMismatch[] = [];
  const conflictingTraits: DriftTraitMismatch[] = [];
  let hardTraitsMissing = 0;

  if (input.usedLoras) score = Math.min(score + 10, 100);
  if (input.usedRefs) score = Math.min(score + 8, 100);

  for (const character of input.characters) {
    const outcome = checkCharacter(
      character,
      {
        normalizedPrompt,
        usedRefs: input.usedRefs,
        usedLoras: input.usedLoras,
      },
      reasons,
      missingTraits,
      conflictingTraits,
    );
    score += outcome.scoreDelta;
    characterScore += outcome.characterScoreDelta;
    hardTraitsMissing += outcome.hardTraitsMissing;
  }

  if (!input.usedLoras && !input.usedRefs) {
    score -= 8;
    reasons.push("Ni LoRA ni ref image utilisés: verrou visuel faible");
  }

  const isEnvironmentPanel =
    input.panelCategory === "ESTABLISHING_ENVIRONMENT" ||
    input.panelCategory === "SCENE_BASE";
  const isAftermathBeat =
    input.beatEventType === "silent_aftermath" ||
    input.beatEventType === "post_impact_silence";
  const isCrowdScene =
    input.panelCategory === "CROWD_SCENE" ||
    input.beatEventType === "crowd_reaction";

  if (isEnvironmentPanel) {
    score = Math.min(100, score + 15);
    characterScore = Math.min(100, characterScore + 15);
    if (score < 70) reasons.push("Panel décor : pénalités personnage réduites");
  }

  if (isAftermathBeat) {
    score = Math.min(100, score + 8);
    characterScore = Math.min(100, characterScore + 8);
  }

  if (isCrowdScene) {
    score = Math.min(100, score + 10);
    characterScore = Math.min(100, characterScore + 10);
  }

  score = Math.max(0, Math.min(100, score));
  characterScore = Math.max(0, Math.min(100, characterScore));

  const styleDriftScore = computeStyleDriftScore(normalizedPrompt, input.chapterLookProfile);
  const beatAlignmentScore = computeBeatAlignmentScore(normalizedPrompt, input.intentCard);
  const sceneContinuityScore = computeSceneContinuityScore(normalizedPrompt, input.sceneAnchor);
  const chapterLookMismatch = styleDriftScore < 60;

  const hasExtraContext =
    !!input.chapterLookProfile || !!input.intentCard || !!input.sceneAnchor;
  const globalScore = hasExtraContext
    ? Math.round(
        score * 0.5 +
          styleDriftScore * 0.2 +
          beatAlignmentScore * 0.2 +
          sceneContinuityScore * 0.1,
      )
    : score;

  const severity = scoreToSeverity(globalScore);
  const pass = globalScore >= 60 && conflictingTraits.length === 0 && !chapterLookMismatch;
  const issues = reasons.slice(0, 8);

  const continuityRisk = conflictingTraits.some(
    (t) => t.trait === "gender" || t.trait === "hairColor",
  );

  const dataPoints =
    input.characters.length +
    (input.chapterLookProfile ? 1 : 0) +
    (input.intentCard ? 1 : 0);
  const confidence = Math.min(
    1,
    0.3 + dataPoints * 0.1 + (input.usedRefs ? 0.2 : 0) + (input.usedLoras ? 0.1 : 0),
  );

  const recommendedAction = computeRecommendedAction(
    globalScore,
    conflictingTraits,
    missingTraits,
    isEnvironmentPanel,
    styleDriftScore,
    hardTraitsMissing,
    chapterLookMismatch,
  );

  return {
    score: globalScore,
    driftScore: globalScore,
    styleDriftScore,
    characterDriftScore: characterScore,
    beatAlignmentScore,
    sceneContinuityScore,
    pass,
    severity,
    chapterLookMismatch,
    issues,
    reasons,
    missingTraits,
    conflictingTraits,
    recommendedAction,
    confidence,
    continuityRisk,
  };
}
