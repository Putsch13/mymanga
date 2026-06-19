/**
 * visual-panel-qa-checks.ts
 *
 * Heuristiques de QA visuelle (sans vision réelle) : narrative,
 * character, composition, technical. Extrait de `visual-panel-qa.ts`
 * (audit-v9).
 */

import { normalizePanelRetryStrategy } from "@manga-ai-studio/core";
import type {
  CharacterFidelityCheck,
  CompositionCheck,
  NarrativeFidelityCheck,
  RetryStrategy,
  TechnicalCheck,
  VisualQaFailure,
  VisualQaInput,
} from "./visual-panel-qa-types";

export function checkNarrativeFidelity(
  _input: VisualQaInput,
): { check: NarrativeFidelityCheck; score: number; failures: VisualQaFailure[] } {
  const failures: VisualQaFailure[] = [];

  const check: NarrativeFidelityCheck = {
    sceneTypeCorrect: true,
    panelRoleCorrect: true,
    emotionCompatible: true,
    actionCompatible: true,
    contextPresent: true,
  };

  let score = 1.0;

  if (!check.sceneTypeCorrect) {
    score -= 0.25;
    failures.push({
      reason: "Scene type does not match expected panel role",
      category: "narrative_fidelity",
      severity: "medium",
      suggestedStrategy: "refined_prompt",
    });
  }

  if (!check.panelRoleCorrect) {
    score -= 0.20;
    failures.push({
      reason: "Panel role (action/dialogue/cutaway) not clearly expressed",
      category: "narrative_fidelity",
      severity: "medium",
      suggestedStrategy: "refined_prompt",
    });
  }

  if (!check.emotionCompatible) {
    score -= 0.15;
    failures.push({
      reason: "Emotional tone inconsistent with narrative intent",
      category: "narrative_fidelity",
      severity: "low",
      suggestedStrategy: "refined_prompt",
    });
  }

  if (!check.contextPresent) {
    score -= 0.20;
    failures.push({
      reason: "Scene context/environment missing or unclear",
      category: "narrative_fidelity",
      severity: "medium",
      suggestedStrategy: "composition_fix",
    });
  }

  return { check, score: Math.max(0, score), failures };
}

export function checkCharacterFidelity(
  input: VisualQaInput,
): { check: CharacterFidelityCheck; score: number; failures: VisualQaFailure[] } {
  const failures: VisualQaFailure[] = [];

  const hasProtagonist = input.expectedCharacters.some((c) => c.isProtagonist);
  const requiredCount = input.panelMetadata.mustShowCharacterIds.length;

  const check: CharacterFidelityCheck = {
    protagonistPresent: !hasProtagonist || true,
    protagonistRecognizable: !hasProtagonist || true,
    requiredCharactersPresent: requiredCount === 0 || true,
    characterCountPlausible: true,
    noUnexpectedCharacters: true,
  };

  let score = 1.0;

  if (hasProtagonist && !check.protagonistPresent) {
    score -= 0.35;
    failures.push({
      reason: "Protagonist missing from panel",
      category: "character_fidelity",
      severity: "critical",
      suggestedStrategy: "stronger_character_lock",
    });
  }

  if (hasProtagonist && !check.protagonistRecognizable) {
    score -= 0.30;
    failures.push({
      reason: "Protagonist not recognizable (visual drift)",
      category: "character_fidelity",
      severity: "high",
      suggestedStrategy: "stronger_character_lock",
    });
  }

  if (!check.requiredCharactersPresent) {
    score -= 0.25;
    failures.push({
      reason: `Required characters missing: expected ${requiredCount}`,
      category: "character_fidelity",
      severity: "high",
      suggestedStrategy: "stronger_character_lock",
    });
  }

  if (!check.characterCountPlausible) {
    score -= 0.10;
    failures.push({
      reason: "Character count implausible for scene",
      category: "character_fidelity",
      severity: "low",
      suggestedStrategy: "simplify_scene",
    });
  }

  const needsCharacterProof = hasProtagonist || requiredCount > 0;
  const ambientCutawayRelax =
    input.panelMetadata.isCutaway
    && !hasProtagonist
    && requiredCount === 0
    && input.expectedCharacters.length === 0;

  if (input.heuristicAssurance === "no_vision" && needsCharacterProof && !ambientCutawayRelax) {
    score = Math.min(score, 0.14);
  }

  return { check, score: Math.max(0, score), failures };
}

export function checkComposition(
  input: VisualQaInput,
): { check: CompositionCheck; score: number; failures: VisualQaFailure[] } {
  const failures: VisualQaFailure[] = [];

  const check: CompositionCheck = {
    framingCorrect: true,
    readabilityGood: true,
    notOverSaturated: true,
    textSpaceAvailable: !input.panelMetadata.reserveTextArea || true,
    focalPointClear: true,
  };

  let score = 1.0;

  if (!check.framingCorrect) {
    score -= 0.25;
    failures.push({
      reason: `Framing does not match expected shot type: ${input.panelMetadata.shotType}`,
      category: "composition",
      severity: "medium",
      suggestedStrategy: "composition_fix",
    });
  }

  if (!check.readabilityGood) {
    score -= 0.20;
    failures.push({
      reason: "Panel composition is hard to read",
      category: "composition",
      severity: "medium",
      suggestedStrategy: "simplify_scene",
    });
  }

  if (!check.notOverSaturated) {
    score -= 0.15;
    failures.push({
      reason: "Panel is visually oversaturated",
      category: "composition",
      severity: "low",
      suggestedStrategy: "simplify_scene",
    });
  }

  if (input.panelMetadata.reserveTextArea && !check.textSpaceAvailable) {
    score -= 0.30;
    failures.push({
      reason: "Insufficient space for text bubbles/captions",
      category: "composition",
      severity: "high",
      suggestedStrategy: "composition_fix",
    });
  }

  if (!check.focalPointClear) {
    score -= 0.15;
    failures.push({
      reason: "No clear focal point in composition",
      category: "composition",
      severity: "low",
      suggestedStrategy: "composition_fix",
    });
  }

  if (input.panelMetadata.reserveTextArea && input.heuristicAssurance === "no_vision") {
    score = Math.min(score, 0.48);
  }

  return { check, score: Math.max(0, score), failures };
}

export function checkTechnical(
  _input: VisualQaInput,
): { check: TechnicalCheck; score: number; failures: VisualQaFailure[] } {
  const failures: VisualQaFailure[] = [];

  const check: TechnicalCheck = {
    noVisualAnomalies: true,
    anatomyAcceptable: true,
    noDoubleFeatures: true,
    sharpnessAcceptable: true,
    aspectRatioCorrect: true,
  };

  let score = 1.0;

  if (!check.noVisualAnomalies) {
    score -= 0.30;
    failures.push({
      reason: "Major visual anomalies detected",
      category: "technical",
      severity: "high",
      suggestedStrategy: "same_prompt",
    });
  }

  if (!check.anatomyAcceptable) {
    score -= 0.25;
    failures.push({
      reason: "Anatomical issues detected",
      category: "technical",
      severity: "medium",
      suggestedStrategy: "simplify_scene",
    });
  }

  if (!check.noDoubleFeatures) {
    score -= 0.35;
    failures.push({
      reason: "Double faces/limbs detected",
      category: "technical",
      severity: "critical",
      suggestedStrategy: "same_prompt",
    });
  }

  if (!check.sharpnessAcceptable) {
    score -= 0.10;
    failures.push({
      reason: "Image sharpness below acceptable threshold",
      category: "technical",
      severity: "low",
      suggestedStrategy: "same_prompt",
    });
  }

  return { check, score: Math.max(0, score), failures };
}

/**
 * Sélectionne la stratégie de retry appropriée parmi les failures.
 * Visible parce que le runner et la vision la partagent.
 */
export function selectRetryStrategy(
  failures: VisualQaFailure[],
  attemptNumber: number,
): RetryStrategy {
  if (failures.length === 0) return "same_prompt";

  const criticalFailures = failures.filter((f) => f.severity === "critical");
  if (criticalFailures.length > 0) {
    return normalizePanelRetryStrategy(criticalFailures[0]!.suggestedStrategy as string);
  }

  const highFailures = failures.filter((f) => f.severity === "high");
  if (highFailures.length > 0) {
    return normalizePanelRetryStrategy(highFailures[0]!.suggestedStrategy as string);
  }

  const characterFailures = failures.filter((f) => f.category === "character_fidelity");
  if (characterFailures.length > 0 && attemptNumber <= 2) {
    return "stronger_character_lock";
  }

  const compositionFailures = failures.filter((f) => f.category === "composition");
  if (compositionFailures.length > 0 && attemptNumber >= 2) {
    return "simplify_scene";
  }

  if (attemptNumber === 1) return "refined_prompt";
  if (attemptNumber === 2) return "stronger_character_lock";
  if (attemptNumber === 3) return "composition_fix";

  return "simplify_scene";
}
