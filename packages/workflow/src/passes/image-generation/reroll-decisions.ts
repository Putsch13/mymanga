/**
 * P5.2 — Helpers décisionnels du reroll d'image (panel).
 *
 * Avant l'extraction, ces 3 closures vivaient dans `processOneImage` :
 *   - `isEnvironmentSufficientForNarrativePanel`
 *   - `pickRerollKind`
 *   - `rankCandidate`
 *
 * On les centralise ici pour pouvoir les tester unitairement et les réutiliser
 * dans le pass de recovery. Pas de side-effect, signatures pures.
 */
import type { detectVisualDrift, validateGeneratedPanel } from "@manga-ai-studio/ai";

export type RerollKind =
  | "REROLL_ENVIRONMENT"
  | "REROLL_CHARACTER_FIDELITY"
  | "REROLL_INTERACTION"
  | "REROLL_STYLE"
  | "REROLL_COMPOSITION";

type ValidationResult = Awaited<ReturnType<typeof validateGeneratedPanel>>;
type DriftResult = ReturnType<typeof detectVisualDrift>;

interface StrategyForReroll {
  panelCategory: string;
  interactionCritical: boolean;
}

/**
 * Détermine si l'environnement du panel est "suffisant" — c.-à-d. qu'on
 * peut accepter le rendu même sans atteindre tous les seuils. Sert de
 * shortcut pour ne pas relancer un reroll quand le panel est CHARACTER_LOCK
 * ou LOCAL_FIX (le décor n'est pas la priorité).
 */
export function isEnvironmentSufficientForNarrativePanel(args: {
  validation: ValidationResult;
  strategy: StrategyForReroll;
  panelPrompt: string;
}): boolean {
  const { validation, strategy, panelPrompt } = args;
  if (strategy.panelCategory === "CHARACTER_LOCK" || strategy.panelCategory === "LOCAL_FIX") return true;
  const scores = validation.qualityScores;
  if (!scores) return false;
  const schoolScene = /school|lycée|lycee|école|ecole|campus|cour du lycée/i.test(panelPrompt);
  const visionFindings = validation.visionAnalysis?.findings.join(" | ").toLowerCase() ?? "";
  return !(
    scores.backgroundPresenceScore < 0.62
    || scores.environmentReadabilityScore < 0.6
    || (strategy.interactionCritical && scores.interactionScore < 0.58 && scores.visionScore !== null)
    || (schoolScene && /missing school architecture|generic background|fond vide/.test(visionFindings))
  );
}

/**
 * P0-4 : pilotage unifié du reroll automatique par `drift.recommendedAction`.
 *
 * Le détecteur de drift calcule déjà une action (keep, soft_reroll,
 * character_reroll, style_reroll, full_reroll, flag_for_review). On honore
 * cette décision en priorité et on retombe sur les signaux de validation
 * (backgroundPresence, interaction…) uniquement pour les cas soft/full
 * où aucun axe clair ne domine.
 */
export function pickRerollKind(args: {
  validation: ValidationResult;
  drift: DriftResult;
  strategy: StrategyForReroll;
}): RerollKind {
  const { validation, drift, strategy } = args;
  const scores = validation.qualityScores;

  switch (drift.recommendedAction) {
    case "character_reroll":
      return "REROLL_CHARACTER_FIDELITY";
    case "style_reroll":
      return "REROLL_STYLE";
    case "full_reroll":
      if (scores && (scores.backgroundPresenceScore < 0.62 || scores.environmentReadabilityScore < 0.6)) {
        return "REROLL_ENVIRONMENT";
      }
      return "REROLL_COMPOSITION";
    case "soft_reroll":
    case "keep":
    case "flag_for_review":
      // fall through to validation-driven heuristics
      break;
  }

  if (!scores) return "REROLL_COMPOSITION";
  if (scores.backgroundPresenceScore < 0.62 || scores.environmentReadabilityScore < 0.6) return "REROLL_ENVIRONMENT";
  if (strategy.interactionCritical && scores.interactionScore < 0.58 && scores.visionScore !== null) return "REROLL_INTERACTION";
  if (
    !drift.pass
    || validation.issues.some(
      (issue) => issue.type === "missing_character" || issue.type === "wrong_hair" || issue.type === "wrong_outfit",
    )
  ) {
    return "REROLL_CHARACTER_FIDELITY";
  }
  if (validation.issues.some((issue) => issue.type === "style_drift")) return "REROLL_STYLE";
  return "REROLL_COMPOSITION";
}

/**
 * Score utilisé pour comparer plusieurs `bestAttempt` candidates.
 * Plus le score est haut, meilleure est la candidate.
 */
export function rankCandidate(args: {
  validation: ValidationResult;
  drift: DriftResult;
}): number {
  const { validation, drift } = args;
  const scores = validation.qualityScores;
  const release = scores?.releaseScore ?? validation.score;
  return (
    release
    + (scores?.backgroundPresenceScore ?? 0) * 0.2
    + (scores?.interactionScore ?? 0) * 0.15
    + (drift.pass ? 0.05 : -0.08)
  );
}
