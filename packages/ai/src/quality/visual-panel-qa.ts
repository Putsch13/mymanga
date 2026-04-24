/**
 * visual-panel-qa.ts — QA visuelle automatique des images générées.
 *
 * Ce module analyse chaque image générée et décide si elle passe ou doit être relancée.
 * C'est LA SOURCE DE VÉRITÉ pour la qualité visuelle des panels.
 *
 * L'auto-retry n'est pas "renvoyer pareil" mais est piloté par les causes d'échec.
 *
 * Persistance : le résultat de `runVisualPanelQa` est stocké dans `SceneImage.metadata.visualQa`
 * après rendu v3 (`v3-scene-image-persistence`). Une couche vision réelle peut s'appuyer sur
 * `analyzePanelWithVision` (panel-vision-analyzer) et fusionner les scores avant persistance.
 */

import type { CharacterFingerprint } from "@manga-ai-studio/core";
import { PRODUCTION_RULES } from "@manga-ai-studio/core";
import { analyzePanelWithVision, type PanelVisionQaScore } from "../services/panel-vision-analyzer";

export type RetryStrategy =
  | "same_prompt"
  | "refined_prompt"
  | "stronger_character_lock"
  | "composition_fix"
  | "text_space_fix"
  | "style_lock"
  | "simplify_scene"
  /** @deprecated utiliser {@link simplify_scene} */
  | "simpler_scene"
  | "force_subject_focus";

export interface VisualQaInput {
  panelId: string;
  imageUrl: string;
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

const DEFAULT_WEIGHTS: VisualQaScoreWeights = {
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
      suggestedStrategy: "simpler_scene",
    });
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
      suggestedStrategy: "simpler_scene",
    });
  }

  if (!check.notOverSaturated) {
    score -= 0.15;
    failures.push({
      reason: "Panel is visually oversaturated",
      category: "composition",
      severity: "low",
      suggestedStrategy: "simpler_scene",
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
      suggestedStrategy: "force_subject_focus",
    });
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
      suggestedStrategy: "simpler_scene",
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

function selectRetryStrategy(
  failures: VisualQaFailure[],
  attemptNumber: number,
): RetryStrategy {
  if (failures.length === 0) return "same_prompt";

  const criticalFailures = failures.filter((f) => f.severity === "critical");
  if (criticalFailures.length > 0) {
    return criticalFailures[0]!.suggestedStrategy;
  }

  const highFailures = failures.filter((f) => f.severity === "high");
  if (highFailures.length > 0) {
    return highFailures[0]!.suggestedStrategy;
  }

  const characterFailures = failures.filter((f) => f.category === "character_fidelity");
  if (characterFailures.length > 0 && attemptNumber <= 2) {
    return "stronger_character_lock";
  }

  const compositionFailures = failures.filter((f) => f.category === "composition");
  if (compositionFailures.length > 0 && attemptNumber >= 2) {
    return "simpler_scene";
  }

  if (attemptNumber === 1) return "refined_prompt";
  if (attemptNumber === 2) return "stronger_character_lock";
  if (attemptNumber === 3) return "composition_fix";

  return "simpler_scene";
}

export function runVisualPanelQa(
  input: VisualQaInput,
  weights: VisualQaScoreWeights = DEFAULT_WEIGHTS,
): VisualQaResult {
  const maxAttempts = PRODUCTION_RULES.visualQa.maxAttemptsPerPanel;
  const passThreshold = PRODUCTION_RULES.visualQa.passScore;

  const narrative = checkNarrativeFidelity(input);
  const character = checkCharacterFidelity(input);
  const composition = checkComposition(input);
  const technical = checkTechnical(input);

  const weightedScore =
    narrative.score * weights.narrativeFidelity +
    character.score * weights.characterFidelity +
    composition.score * weights.composition +
    technical.score * weights.technical;

  const allFailures = [
    ...narrative.failures,
    ...character.failures,
    ...composition.failures,
    ...technical.failures,
  ];

  const passed = weightedScore >= passThreshold;
  const retryRecommended = !passed && input.attemptNumber < maxAttempts;
  const shouldMarkManualReview = !passed && input.attemptNumber >= maxAttempts;

  const retryStrategy = retryRecommended
    ? selectRetryStrategy(allFailures, input.attemptNumber)
    : undefined;

  const reasons = allFailures.map((f) => f.reason);

  return {
    passed,
    score: weightedScore,
    reasons,
    failures: allFailures,
    retryRecommended,
    retryStrategy,
    attemptNumber: input.attemptNumber,
    maxAttempts,
    shouldMarkManualReview,
  };
}

function minimalFingerprintForVision(name: string): CharacterFingerprint {
  return {
    identity: { name, gender: "non_applicable", perceivedAge: "adult", role: "character" },
    face: { faceShape: "unspecified", eyeShape: "unspecified", eyeColor: "unspecified", eyebrowStyle: "unspecified" },
    hair: { color: "unspecified", style: "unspecified", length: "unspecified", texture: "unspecified", silhouette: "unspecified" },
    body: { build: "unspecified", height: "unspecified", posture: "neutral", silhouette: "unspecified" },
    permanentMarkers: [],
    defaultOutfit: [],
    forbiddenDrift: [],
    primaryRefs: [],
  };
}

/**
 * Construit l’entrée QA visuelle à partir du render-spec / storyboard (pipeline v3).
 */
export function buildVisualQaInputFromRenderSpec(input: {
  panelId: string;
  imageUrl: string;
  promptUsed: string;
  attemptNumber: number;
  panelPurpose: string;
  actionLine: string;
  shotType: string;
  subjectFocus: string;
  cutawayType: string;
  mustShowCharacterIds: string[];
  reserveTextArea: boolean;
  textOverflowStrategy?: string | null;
  visibleCharacters: Array<{ characterId: string; name: string; isProtagonist: boolean }>;
}): VisualQaInput {
  return {
    panelId: input.panelId,
    imageUrl: input.imageUrl,
    panelMetadata: {
      role: input.panelPurpose,
      purpose: input.actionLine.slice(0, 240),
      shotType: input.shotType,
      subjectFocus: input.subjectFocus,
      isCutaway: input.cutawayType !== "none",
      mustShowCharacterIds: input.mustShowCharacterIds,
      reserveTextArea: input.reserveTextArea,
      textMode: input.textOverflowStrategy ?? "overlay",
    },
    promptUsed: input.promptUsed,
    expectedCharacters: input.visibleCharacters,
    attemptNumber: input.attemptNumber,
  };
}

/**
 * QA heuristique + optionnellement vision OpenAI (`VISUAL_PANEL_QA_VISION=true` + `OPENAI_API_KEY`).
 * Fusionne les scores ; peut recommander un retry aligné sur {@link PRODUCTION_RULES.retry}.
 */
export async function runVisualPanelQaWithOptionalVision(
  input: VisualQaInput,
  weights: VisualQaScoreWeights = DEFAULT_WEIGHTS,
): Promise<VisualQaResult> {
  const base = runVisualPanelQa(input, weights);
  const passThreshold = PRODUCTION_RULES.visualQa.passScore;
  const maxAttempts = PRODUCTION_RULES.visualQa.maxAttemptsPerPanel;

  if (process.env.VISUAL_PANEL_QA_VISION !== "true" || !input.imageUrl?.trim()) {
    return base;
  }

  const requiredCharacters = input.expectedCharacters.map((c) => ({
    characterName: c.name,
    fingerprint: minimalFingerprintForVision(c.name),
  }));

  let vision: PanelVisionQaScore | null = null;
  try {
    vision = await analyzePanelWithVision({
      imageUrl: input.imageUrl,
      heuristicReleaseScore: base.score,
      requiredCharacters,
      panelContract: {
        shotType: input.panelMetadata.shotType,
        purpose: input.panelMetadata.purpose,
        mustShow: input.panelMetadata.mustShowCharacterIds,
      },
      criticality: {
        sceneComplexityScore: base.score < 0.82 ? 0.82 : 0.35,
      },
    });
  } catch {
    vision = null;
  }

  if (!vision) {
    return base;
  }

  const visionAnalysis = {
    releaseScore: vision.releaseScore,
    findings: vision.findings,
    model: vision.model,
    characterConsistencyScore: vision.characterConsistencyScore,
  };

  const blendedScore = Math.min(base.score, base.score * 0.35 + vision.releaseScore * 0.65);
  const visionGate = vision.releaseScore >= 0.42;

  const failures = [...base.failures];
  if (!visionGate) {
    failures.push({
      reason: `Vision QA (${vision.model}): release=${vision.releaseScore.toFixed(2)} — ${vision.findings.slice(0, 2).join("; ") || "score bas"}`,
      category: "technical",
      severity: vision.releaseScore < 0.32 ? "critical" : "high",
      suggestedStrategy: vision.releaseScore < 0.32 ? "simpler_scene" : "refined_prompt",
    });
  }

  const passed = blendedScore >= passThreshold && visionGate;
  const retryRecommended = !passed && input.attemptNumber < maxAttempts;
  const retryStrategy = retryRecommended
    ? selectRetryStrategy(failures, input.attemptNumber)
    : undefined;
  const shouldMarkManualReview = !passed && input.attemptNumber >= maxAttempts;

  return {
    passed,
    score: blendedScore,
    reasons: [
      ...base.reasons,
      ...(!visionGate ? [`vision_release=${vision.releaseScore.toFixed(2)}`] : []),
    ],
    failures,
    retryRecommended,
    retryStrategy,
    attemptNumber: input.attemptNumber,
    maxAttempts,
    shouldMarkManualReview,
    visionAnalysis,
  };
}

export interface RetryContext {
  panelId: string;
  originalPrompt: string;
  previousResults: VisualQaResult[];
  currentStrategy: RetryStrategy;
}

export function buildRetryPrompt(
  context: RetryContext,
): { prompt: string; strengthenedRefs: boolean; simplifiedScene: boolean } {
  const { originalPrompt, currentStrategy, previousResults } = context;

  let prompt = originalPrompt;
  let strengthenedRefs = false;
  let simplifiedScene = false;

  const lastResult = previousResults[previousResults.length - 1];
  const failureReasons = lastResult?.failures ?? [];

  switch (currentStrategy) {
    case "same_prompt":
      break;

    case "refined_prompt":
      if (failureReasons.some((f) => f.category === "narrative_fidelity")) {
        prompt += " Ensure the scene clearly shows the intended action and emotional tone.";
      }
      break;

    case "stronger_character_lock":
      strengthenedRefs = true;
      prompt += " CRITICAL: The protagonist must be clearly visible and recognizable. Maintain exact character design.";
      break;

    case "composition_fix":
      prompt += " IMPORTANT: Leave clear space at top or bottom for text bubbles. Avoid cluttered compositions.";
      break;

    case "simpler_scene":
    case "simplify_scene":
      simplifiedScene = true;
      prompt += " Simplify the scene. Focus on fewer elements. Clear, uncluttered composition.";
      break;

    case "text_space_fix":
      prompt +=
        " Reserve a clean empty band at top or bottom for dialogue balloons; keep faces and main action out of the text zone.";
      break;

    case "style_lock":
      prompt +=
        " Lock ink style: consistent manga line weight, coherent screentones, no color drift vs reference style.";
      break;

    case "force_subject_focus":
      prompt += " The main subject must be the clear focal point, centered or following rule of thirds.";
      break;
  }

  return { prompt, strengthenedRefs, simplifiedScene };
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

export function createRetryRecord(
  panelId: string,
  imageUrl: string,
  promptUsed: string,
  qaResult: VisualQaResult,
  strategy: RetryStrategy | null,
): ImageRetryRecord {
  return {
    panelId,
    attemptNumber: qaResult.attemptNumber,
    imageUrl,
    promptUsed,
    qaResult,
    strategy,
    timestamp: new Date().toISOString(),
  };
}
