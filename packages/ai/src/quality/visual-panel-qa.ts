/**
 * visual-panel-qa.ts — façade publique du module QA visuelle.
 *
 * Le module a été splitté (audit-v9) pour rester sous 500 lignes.
 * Tous les imports historiques restent valides via ce fichier.
 *
 * Couches :
 *   - `visual-panel-qa-types`    : types et constantes
 *   - `visual-panel-qa-checks`   : heuristiques par catégorie + selectRetryStrategy
 *   - `visual-panel-qa-runner`   : runVisualPanelQa + runVisualPanelQaWithOptionalVision
 *   - `visual-panel-qa-retry`    : buildRetryPrompt + createRetryRecord
 */

export type {
  CharacterFidelityCheck,
  CompositionCheck,
  ImageRetryRecord,
  NarrativeFidelityCheck,
  RetryContext,
  RetryStrategy,
  TechnicalCheck,
  VisualQaCategory,
  VisualQaFailure,
  VisualQaInput,
  VisualQaResult,
  VisualQaScoreWeights,
} from "./visual-panel-qa-types";

export { DEFAULT_WEIGHTS } from "./visual-panel-qa-types";

export {
  checkCharacterFidelity,
  checkComposition,
  checkNarrativeFidelity,
  checkTechnical,
  selectRetryStrategy,
} from "./visual-panel-qa-checks";

export {
  buildVisualQaInputFromRenderSpec,
  isCriticalPanelForVisualQa,
  runVisualPanelQa,
  runVisualPanelQaWithOptionalVision,
} from "./visual-panel-qa-runner";

export { buildRetryPrompt, createRetryRecord } from "./visual-panel-qa-retry";
