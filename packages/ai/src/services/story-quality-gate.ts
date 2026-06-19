/**
 * Façade publique du quality gate (story / panel / scene).
 *
 * - `runStoryQualityGate` analyse la `GeneratedChapterBundle` + `ChapterDramaticSpine`,
 *   produit un score global, des `StoryQualityIssue` et des `NarrativePatch`
 *   (suggérés ou auto-appliqués selon le mode genre).
 * - `runPanelQualityGate` vérifie un panel isolé (look, beat alignment, SFX).
 * - `runSceneQualityGate` vérifie la cohérence inter-panels d'une scène.
 *
 * Toute la logique métier vit dans `_story-quality-gate/`.
 */
import type { GeneratedChapterBundle } from "../chapter/shared-types";
import type { ChapterDramaticSpine } from "./story-spine";
import type { GenreDirectorMode } from "./genre-director";
import type {
  StoryQualityIssue,
  StoryQualityReport,
} from "./_story-quality-gate/types";
import {
  scoreBeatVariety,
  scoreBreathing,
  scoreCausality,
  scoreCharacterFunction,
  scoreCliffhanger,
  scoreMicroTurns,
  scorePayoff,
  scoreSceneUtility,
} from "./_story-quality-gate/score-story";
import { generateNarrativePatches } from "./_story-quality-gate/genre-patches";

export type {
  StoryQualityIssue,
  StoryQualityReport,
  NarrativePatch,
  PanelQualityIssue,
  PanelQualityReport,
  SceneQualityReport,
} from "./_story-quality-gate/types";
export { runPanelQualityGate } from "./_story-quality-gate/panel-gate";
export { runSceneQualityGate } from "./_story-quality-gate/scene-gate";

export function runStoryQualityGate(
  bundle: GeneratedChapterBundle,
  spine: ChapterDramaticSpine,
  genreMode: GenreDirectorMode = "seinen_tension",
): { report: StoryQualityReport; patchedBundle: GeneratedChapterBundle } {
  const causality = scoreCausality(bundle);
  const beatVariety = scoreBeatVariety(spine);
  const microTurns = scoreMicroTurns(bundle);
  const cliffhanger = scoreCliffhanger(spine, bundle);
  const payoff = scorePayoff(spine);
  const breathing = scoreBreathing(spine);
  const sceneUtility = scoreSceneUtility(bundle);
  const characterFunction = scoreCharacterFunction(bundle);

  const allIssues: StoryQualityIssue[] = [
    ...causality.issues,
    ...beatVariety.issues,
    ...microTurns.issues,
    ...cliffhanger.issues,
    ...payoff.issues,
    ...breathing.issues,
    ...sceneUtility.issues,
    ...characterFunction.issues,
  ];

  const overallScore = Math.round(
    causality.score * 0.15 +
      beatVariety.score * 0.15 +
      microTurns.score * 0.1 +
      cliffhanger.score * 0.15 +
      payoff.score * 0.15 +
      breathing.score * 0.1 +
      sceneUtility.score * 0.1 +
      characterFunction.score * 0.1,
  );

  const errorCount = allIssues.filter((i) => i.severity === "error").length;
  const passed = errorCount === 0 && overallScore >= 50;

  const { suggestedPatches, autoAppliedPatches, patchedBundle } =
    generateNarrativePatches(bundle, spine, allIssues, genreMode);

  if (autoAppliedPatches.length > 0) {
    console.log(
      `[quality-gate] auto_applied_patches=${autoAppliedPatches.length} genre=${genreMode} score=${overallScore}`,
    );
  }

  const report: StoryQualityReport = {
    passed,
    overallScore,
    issues: allIssues,
    causalityScore: causality.score,
    beatVarietyScore: beatVariety.score,
    microTurnsScore: microTurns.score,
    cliffhangerScore: cliffhanger.score,
    payoffScore: payoff.score,
    breathingScore: breathing.score,
    sceneUtilityScore: sceneUtility.score,
    characterFunctionScore: characterFunction.score,
    suggestedPatches,
    autoAppliedPatches,
    genreMode,
  };

  return { report, patchedBundle };
}
