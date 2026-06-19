/**
 * visual-panel-qa-types.ts
 *
 * Types et constantes du module QA visuelle. Extrait de
 * `visual-panel-qa.ts` (audit-v9) pour passer sous 500 lignes.
 */

import type { CanonicalPanelPlan, PanelRetryStrategy } from "@manga-ai-studio/core";
import type { PanelVisionQaScore } from "../services/panel-vision-analyzer";

/** @deprecated utiliser {@link PanelRetryStrategy} depuis `@manga-ai-studio/core` */
export type RetryStrategy = PanelRetryStrategy;

export interface VisualQaInput {
  panelId: string;
  imageUrl: string;
  /** Si fourni, la criticité suit le plan canonique (premium). */
  canonicalPanel?: CanonicalPanelPlan | null;
  /**
   * `no_vision` : les checks « personnage présent » ne prétendent pas valider
   * sans vision — le score heuristique est plafonné pour les panels critiques.
   */
  heuristicAssurance?: "full" | "no_vision";
  panelMetadata: {
    role: string;
    purpose: string;
    shotType: string;
    subjectFocus: string;
    isCutaway: boolean;
    mustShowCharacterIds: string[];
    reserveTextArea: boolean;
    textMode: string;
  };
  promptUsed: string;
  expectedCharacters: Array<{
    characterId: string;
    name: string;
    isProtagonist: boolean;
  }>;
  attemptNumber: number;
  previousFailures?: VisualQaFailure[];
}

export interface VisualQaFailure {
  reason: string;
  category: VisualQaCategory;
  severity: "low" | "medium" | "high" | "critical";
  suggestedStrategy: RetryStrategy;
}

export type VisualQaCategory =
  | "narrative_fidelity"
  | "character_fidelity"
  | "composition"
  | "technical";

export interface VisualQaResult {
  passed: boolean;
  score: number;
  reasons: string[];
  failures: VisualQaFailure[];
  retryRecommended: boolean;
  retryStrategy?: RetryStrategy;
  attemptNumber: number;
  maxAttempts: number;
  shouldMarkManualReview: boolean;
  /** Présent si `VISUAL_PANEL_QA_VISION=true` et l’appel vision a réussi. */
  visionAnalysis?: Pick<
    PanelVisionQaScore,
    "releaseScore" | "findings" | "model" | "characterConsistencyScore"
  > | null;
}

export interface VisualQaScoreWeights {
  narrativeFidelity: number;
  characterFidelity: number;
  composition: number;
  technical: number;
}

export const DEFAULT_WEIGHTS: VisualQaScoreWeights = {
  narrativeFidelity: 0.30,
  characterFidelity: 0.35,
  composition: 0.20,
  technical: 0.15,
};

export interface NarrativeFidelityCheck {
  sceneTypeCorrect: boolean;
  panelRoleCorrect: boolean;
  emotionCompatible: boolean;
  actionCompatible: boolean;
  contextPresent: boolean;
}

export interface CharacterFidelityCheck {
  protagonistPresent: boolean;
  protagonistRecognizable: boolean;
  requiredCharactersPresent: boolean;
  characterCountPlausible: boolean;
  noUnexpectedCharacters: boolean;
}

export interface CompositionCheck {
  framingCorrect: boolean;
  readabilityGood: boolean;
  notOverSaturated: boolean;
  textSpaceAvailable: boolean;
  focalPointClear: boolean;
}

export interface TechnicalCheck {
  noVisualAnomalies: boolean;
  anatomyAcceptable: boolean;
  noDoubleFeatures: boolean;
  sharpnessAcceptable: boolean;
  aspectRatioCorrect: boolean;
}

export interface ImageRetryRecord {
  panelId: string;
  attemptNumber: number;
  imageUrl: string;
  promptUsed: string;
  qaResult: VisualQaResult;
  strategy: RetryStrategy | null;
  timestamp: string;
}

export interface RetryContext {
  panelId: string;
  originalPrompt: string;
  previousResults: VisualQaResult[];
  currentStrategy: RetryStrategy;
}
