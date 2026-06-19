/**
 * P2.2 — Subject Balance Score
 *
 * Calcule un score de balance visuelle pour chaque panel, indiquant
 * si la composition respecte les intentions du planning.
 *
 * Utilisation :
 *   - Avant génération : calculer le score cible basé sur l'intent
 *   - Après génération : comparer avec le score observé (via vision API)
 *   - Pour le reroll : déterminer si une correction de balance est nécessaire
 *
 * Score :
 *   0   = l'autre personnage domine complètement
 *   50  = équilibre parfait
 *   100 = le héros domine complètement
 */

import type { PanelGenerationIntent, DominantSubjectType } from "./generation-intent-planner";
import { calculateSpotlightBalance, type SharedSpotlightInput } from "./shared-spotlight";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface SubjectBalanceScore {
  targetScore: number;
  observedScore: number | null;
  deviation: number | null;
  isAcceptable: boolean;
  recommendation: BalanceRecommendation;
  debugInfo: string;
}

export type BalanceRecommendation =
  | "KEEP"
  | "REROLL_HERO_TOO_DOMINANT"
  | "REROLL_OTHER_TOO_DOMINANT"
  | "REROLL_HERO_NOT_VISIBLE_ENOUGH"
  | "REROLL_OTHER_NOT_VISIBLE_ENOUGH"
  | "CANNOT_EVALUATE";

export interface BalanceScoreInput {
  intent: PanelGenerationIntent;
  heroCharacterId: string | null;
  observedHeroProminence?: number;
  observedOtherProminence?: number;
  hasVisionApiResult: boolean;
}

export interface BalanceThresholds {
  acceptableDeviation: number;
  heroMinimumForDuo: number;
  otherMinimumForDuo: number;
  heroMinimumForHeroPanel: number;
  environmentMinimumForEnvPanel: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────

const DEFAULT_THRESHOLDS: BalanceThresholds = {
  acceptableDeviation: 20,
  heroMinimumForDuo: 30,
  otherMinimumForDuo: 30,
  heroMinimumForHeroPanel: 70,
  environmentMinimumForEnvPanel: 60,
};

// ────────────────────────────────────────────────────────────────────────────
// Target score calculation
// ────────────────────────────────────────────────────────────────────────────

export function calculateTargetBalanceScore(
  intent: PanelGenerationIntent,
): number {
  const { dominantSubject, intentType, characterPriority, environmentPriority } = intent;

  switch (dominantSubject) {
    case "hero":
      return 85;
    case "enemy":
    case "npc":
    case "ally":
      return 25;
    case "duo":
      return 50;
    case "group":
      return 45;
    case "guard_group":
    case "crowd":
      return 20;
    case "environment":
    case "prop":
    case "aftermath":
      return 10;
    default:
      return 50;
  }
}

export function calculateTargetProminencePerSubject(
  intent: PanelGenerationIntent,
): { hero: number; other: number; environment: number; crowd: number } {
  const { dominantSubject, characterPriority, environmentPriority, crowdPriority } = intent;

  switch (dominantSubject) {
    case "hero":
      return { hero: 90, other: 20, environment: 25, crowd: 10 };
    case "enemy":
    case "npc":
    case "ally":
      return { hero: 20, other: 85, environment: 30, crowd: 15 };
    case "duo":
      return { hero: 60, other: 60, environment: 30, crowd: 15 };
    case "group":
      return { hero: 50, other: 50, environment: 35, crowd: 50 };
    case "guard_group":
      return { hero: 15, other: 30, environment: 45, crowd: 85 };
    case "crowd":
      return { hero: 10, other: 20, environment: 40, crowd: 90 };
    case "environment":
      return { hero: 10, other: 10, environment: 90, crowd: 25 };
    case "prop":
      return { hero: 5, other: 5, environment: 30, crowd: 5 };
    case "aftermath":
      return { hero: 10, other: 10, environment: 80, crowd: 20 };
    default:
      return { hero: 50, other: 50, environment: 50, crowd: 50 };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Observed score calculation (from vision API results)
// ────────────────────────────────────────────────────────────────────────────

export function calculateObservedBalanceScore(
  heroProminence: number,
  otherProminence: number,
): number {
  const total = heroProminence + otherProminence;
  if (total === 0) return 50;
  return Math.round((heroProminence / total) * 100);
}

// ────────────────────────────────────────────────────────────────────────────
// Recommendation logic
// ────────────────────────────────────────────────────────────────────────────

export function determineBalanceRecommendation(
  targetScore: number,
  observedScore: number | null,
  dominantSubject: DominantSubjectType,
  thresholds: BalanceThresholds = DEFAULT_THRESHOLDS,
): BalanceRecommendation {
  if (observedScore === null) {
    return "CANNOT_EVALUATE";
  }

  const deviation = observedScore - targetScore;
  const absDeviation = Math.abs(deviation);

  if (absDeviation <= thresholds.acceptableDeviation) {
    return "KEEP";
  }

  switch (dominantSubject) {
    case "hero":
      if (observedScore < thresholds.heroMinimumForHeroPanel) {
        return "REROLL_HERO_NOT_VISIBLE_ENOUGH";
      }
      break;

    case "duo":
      if (observedScore > 100 - thresholds.otherMinimumForDuo) {
        return "REROLL_HERO_TOO_DOMINANT";
      }
      if (observedScore < thresholds.heroMinimumForDuo) {
        return "REROLL_OTHER_TOO_DOMINANT";
      }
      break;

    case "enemy":
    case "npc":
    case "ally":
      if (observedScore > 50 + thresholds.acceptableDeviation) {
        return "REROLL_HERO_TOO_DOMINANT";
      }
      break;

    case "guard_group":
    case "crowd":
    case "environment":
      if (observedScore > 40) {
        return "REROLL_HERO_TOO_DOMINANT";
      }
      break;

    default:
      if (deviation > 0) {
        return "REROLL_HERO_TOO_DOMINANT";
      } else {
        return "REROLL_OTHER_TOO_DOMINANT";
      }
  }

  return "KEEP";
}

// ────────────────────────────────────────────────────────────────────────────
// Main score builder
// ────────────────────────────────────────────────────────────────────────────

export function computeSubjectBalanceScore(
  input: BalanceScoreInput,
  thresholds: BalanceThresholds = DEFAULT_THRESHOLDS,
): SubjectBalanceScore {
  const targetScore = calculateTargetBalanceScore(input.intent);

  let observedScore: number | null = null;
  if (
    input.hasVisionApiResult &&
    input.observedHeroProminence !== undefined &&
    input.observedOtherProminence !== undefined
  ) {
    observedScore = calculateObservedBalanceScore(
      input.observedHeroProminence,
      input.observedOtherProminence,
    );
  }

  const deviation = observedScore !== null ? observedScore - targetScore : null;
  const isAcceptable =
    deviation !== null
      ? Math.abs(deviation) <= thresholds.acceptableDeviation
      : false;

  const recommendation = determineBalanceRecommendation(
    targetScore,
    observedScore,
    input.intent.dominantSubject,
    thresholds,
  );

  const debugInfo = [
    `target=${targetScore}`,
    `observed=${observedScore ?? "N/A"}`,
    `deviation=${deviation ?? "N/A"}`,
    `acceptable=${isAcceptable}`,
    `rec=${recommendation}`,
  ].join(" | ");

  return {
    targetScore,
    observedScore,
    deviation,
    isAcceptable,
    recommendation,
    debugInfo,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers for metrics
// ────────────────────────────────────────────────────────────────────────────

export function isBalanceRerollNeeded(score: SubjectBalanceScore): boolean {
  return (
    score.recommendation !== "KEEP" && score.recommendation !== "CANNOT_EVALUATE"
  );
}

export function getBalanceScoreLabel(score: SubjectBalanceScore): string {
  if (score.observedScore === null) return "unknown";
  if (score.isAcceptable) return "balanced";
  if (score.deviation !== null && score.deviation > 0) return "hero_heavy";
  return "other_heavy";
}

export function calculateChapterBalanceMetrics(
  scores: SubjectBalanceScore[],
): {
  averageDeviation: number;
  acceptableCount: number;
  rerollNeededCount: number;
  cannotEvaluateCount: number;
} {
  const withObserved = scores.filter((s) => s.observedScore !== null);
  const deviations = withObserved.map((s) => Math.abs(s.deviation ?? 0));

  return {
    averageDeviation:
      deviations.length > 0
        ? deviations.reduce((a, b) => a + b, 0) / deviations.length
        : 0,
    acceptableCount: scores.filter((s) => s.isAcceptable).length,
    rerollNeededCount: scores.filter((s) => isBalanceRerollNeeded(s)).length,
    cannotEvaluateCount: scores.filter((s) => s.recommendation === "CANNOT_EVALUATE")
      .length,
  };
}
