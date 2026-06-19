import type { ChapterLookProfile } from "@manga-ai-studio/core";

import { normalize, promptContainsTrait } from "./text-utils";
import type { DriftCheckInput, DriftSeverity, DriftRecommendedAction, DriftTraitMismatch } from "./types";

/** Calculer le styleDriftScore depuis le prompt vs le look profile */
export function computeStyleDriftScore(
  normalizedPrompt: string,
  lookProfile: ChapterLookProfile | null | undefined,
): number {
  if (!lookProfile) return 100;

  let styleScore = 100;

  for (const incompatible of lookProfile.incompatibleFamilies) {
    const normalized = normalize(incompatible);
    if (promptContainsTrait(normalizedPrompt, normalized)) {
      styleScore -= 30;
    }
  }

  const styleFamilyNorm = normalize(lookProfile.styleFamily);
  if (!promptContainsTrait(normalizedPrompt, styleFamilyNorm)) {
    styleScore -= 15;
  }

  return Math.max(0, Math.min(100, styleScore));
}

/** Calculer le beatAlignmentScore depuis le prompt vs l'intent card */
export function computeBeatAlignmentScore(
  normalizedPrompt: string,
  intentCard: DriftCheckInput["intentCard"],
): number {
  if (!intentCard) return 100;

  let beatScore = 100;

  for (const mustShow of (intentCard.mustShow ?? []).slice(0, 3)) {
    const normalized = normalize(mustShow);
    if (!promptContainsTrait(normalizedPrompt, normalized)) {
      beatScore -= 15;
    }
  }

  for (const sfxForbidden of intentCard.sfxForbiddenTypes ?? []) {
    const normalized = normalize(sfxForbidden);
    if (promptContainsTrait(normalizedPrompt, normalized)) {
      beatScore -= 20;
    }
  }

  if (intentCard.motionLevel >= 7) {
    const hasMotion = /(speed lines|motion blur|dynamic|explosive|burst|impact|movement)/.test(
      normalizedPrompt,
    );
    if (!hasMotion) {
      beatScore -= 25;
    }
  }

  return Math.max(0, Math.min(100, beatScore));
}

/** Calculer le sceneContinuityScore depuis le prompt vs le scene anchor */
export function computeSceneContinuityScore(
  normalizedPrompt: string,
  sceneAnchor: DriftCheckInput["sceneAnchor"],
): number {
  if (!sceneAnchor) return 100;

  let continuityScore = 100;

  const locationNorm = normalize(sceneAnchor.dominantLocation);
  if (!promptContainsTrait(normalizedPrompt, locationNorm)) {
    continuityScore -= 20;
  }

  for (const character of sceneAnchor.castLineup.slice(0, 3)) {
    const charNorm = normalize(character);
    if (!promptContainsTrait(normalizedPrompt, charNorm)) {
      continuityScore -= 10;
    }
  }

  return Math.max(0, Math.min(100, continuityScore));
}

export function scoreToSeverity(score: number): DriftSeverity {
  if (score >= 85) return "none";
  if (score >= 70) return "low";
  if (score >= 50) return "medium";
  if (score >= 30) return "high";
  return "critical";
}

export function computeRecommendedAction(
  score: number,
  conflictingTraits: DriftTraitMismatch[],
  missingTraits: DriftTraitMismatch[],
  isEnvironmentPanel: boolean,
  styleDriftScore: number,
  hardTraitsMissing: number,
  chapterLookMismatch: boolean,
): DriftRecommendedAction {
  if (isEnvironmentPanel && conflictingTraits.length === 0 && !chapterLookMismatch) return "keep";
  if (chapterLookMismatch && styleDriftScore < 40) return "style_reroll";
  if (hardTraitsMissing >= 2) return "character_reroll";

  const hasCriticalConflict = conflictingTraits.some(
    (t) => t.trait === "gender" || t.trait === "hairColor" || t.trait === "forbiddenVisualDrift",
  );
  if (hasCriticalConflict) return "character_reroll";

  if (score < 30 && conflictingTraits.length >= 2) return "full_reroll";
  if (chapterLookMismatch && styleDriftScore < 60) return "style_reroll";
  if (score < 50 && missingTraits.length >= 2) return "soft_reroll";
  if (score < 70) return "flag_for_review";

  return "keep";
}
