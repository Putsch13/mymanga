/**
 * visual-panel-qa-runner.ts
 *
 * Orchestrateurs : `runVisualPanelQa` (heuristique pure) et
 * `runVisualPanelQaWithOptionalVision` (heuristique + appel vision).
 * Extrait de `visual-panel-qa.ts` (audit-v9).
 */

import type { CharacterFingerprint, CanonicalPanelPlan } from "@manga-ai-studio/core";
import { PRODUCTION_RULES, isPipelineV3PremiumOnlyEnabled } from "@manga-ai-studio/core";
import { analyzePanelWithVision, type PanelVisionQaScore } from "../services/panel-vision-analyzer";
import {
  checkCharacterFidelity,
  checkComposition,
  checkNarrativeFidelity,
  checkTechnical,
  selectRetryStrategy,
} from "./visual-panel-qa-checks";
import {
  DEFAULT_WEIGHTS,
  type VisualQaInput,
  type VisualQaResult,
  type VisualQaScoreWeights,
} from "./visual-panel-qa-types";

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
  canonicalPanel?: CanonicalPanelPlan | null;
}): VisualQaInput {
  return {
    panelId: input.panelId,
    imageUrl: input.imageUrl,
    canonicalPanel: input.canonicalPanel ?? null,
    heuristicAssurance: undefined,
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
 * Panel critique : vision réelle obligatoire en production premium
 * (pas de succès heuristique par défaut).
 */
export function isCriticalPanelForVisualQa(
  panel: CanonicalPanelPlan,
  opts?: { previousQaAttemptFailed?: boolean },
): boolean {
  if (opts?.previousQaAttemptFailed) return true;
  if (panel.isCutaway && panel.textPlan.mode === "silent" && !panel.textPlan.reserveTextArea) {
    return false;
  }
  if (panel.isActorDriven) return true;
  if (panel.mustShowCharacterIds.length > 0 || panel.requiredCharacterIds.length > 0) return true;
  const mode = panel.textPlan.mode;
  if (mode === "dialogue" || mode === "thought") return true;
  if (panel.mustShowEnemy || panel.role === "enemy") return true;
  if (panel.role === "action" || panel.role === "speaker" || panel.role === "listener") return true;
  if (panel.textPlan.reserveTextArea) return true;
  if (panel.criticality === "high" || panel.criticality === "critical") return true;
  return false;
}

function inferCriticalPanelForVisualQa(input: VisualQaInput): boolean {
  if (input.attemptNumber > 1) return true;
  if (input.canonicalPanel) {
    return isCriticalPanelForVisualQa(input.canonicalPanel, {
      previousQaAttemptFailed: input.attemptNumber > 1,
    });
  }
  const m = input.panelMetadata;
  if (m.reserveTextArea) return true;
  if (m.mustShowCharacterIds.length > 0) return true;
  if (input.expectedCharacters.length > 0) return true;
  return false;
}

function isStrictVisionEnvironment(): boolean {
  return isProductionNodeEnv() || isPipelineV3PremiumOnlyEnabled();
}

function visualQaMocksExplicitlyAllowed(): boolean {
  return process.env.NODE_ENV === "test" || process.env.ENABLE_VISUAL_QA_MOCKS === "true";
}

function isProductionNodeEnv(): boolean {
  return process.env.NODE_ENV === "production";
}

function visionUnavailableBlockResult(input: VisualQaInput, maxAttempts: number): VisualQaResult {
  return {
    passed: false,
    score: 0,
    reasons: ["Vision QA unavailable for critical panel"],
    failures: [
      {
        reason: "Vision QA unavailable for critical panel",
        category: "technical",
        severity: "critical",
        suggestedStrategy: "refined_prompt",
      },
    ],
    retryRecommended: false,
    attemptNumber: input.attemptNumber,
    maxAttempts,
    shouldMarkManualReview: true,
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
  const passThreshold = PRODUCTION_RULES.visualQa.passScore;
  const maxAttempts = PRODUCTION_RULES.visualQa.maxAttemptsPerPanel;
  const critical = inferCriticalPanelForVisualQa(input);
  const visionFeatureOn = process.env.VISUAL_PANEL_QA_VISION === "true" && Boolean(input.imageUrl?.trim());
  const mocksOk = visualQaMocksExplicitlyAllowed();

  if (critical && isStrictVisionEnvironment() && !mocksOk && !visionFeatureOn) {
    return visionUnavailableBlockResult(input, maxAttempts);
  }

  const nodeEnv = process.env.NODE_ENV;
  const useNoVisionAssurance =
    !visionFeatureOn
    && critical
    && (isStrictVisionEnvironment() || nodeEnv === "development" || process.env.STRICT_VISUAL_QA_HEURISTIC === "true");

  const inputForHeuristic: VisualQaInput = {
    ...input,
    heuristicAssurance: useNoVisionAssurance ? "no_vision" : "full",
  };

  const base = runVisualPanelQa(inputForHeuristic, weights);

  if (!visionFeatureOn) {
    if (useNoVisionAssurance && nodeEnv === "development") {
      console.warn(
        `[visual-qa] critical_panel_heuristic_without_vision panel=${input.panelId} — ` +
          "activer VISUAL_PANEL_QA_VISION=true (et clés) pour une QA visuelle fiable.",
      );
    }
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

  if (critical && !mocksOk && !vision && isStrictVisionEnvironment()) {
    return visionUnavailableBlockResult(input, maxAttempts);
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
      suggestedStrategy: vision.releaseScore < 0.32 ? "simplify_scene" : "refined_prompt",
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
