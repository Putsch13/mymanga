/**
 * P3.15 — emotional-arc-qa-pass : QA de l'arc émotionnel.
 *
 * Ce QA vérifie que l'arc émotionnel survit au découpage en panels :
 * - Les étapes émotionnelles clés sont représentées
 * - L'intensité émotionnelle progresse de manière cohérente
 * - Pas de ruptures brusques non justifiées
 *
 * @module emotional-arc-qa-pass
 */

import { PIPELINE_ERROR_CODES, type PipelineErrorCode } from "@manga-ai-studio/core";

export interface EmotionalArcStep {
  stepId: string;
  label: string;
  intensity: number;
  beatIds: string[];
}

export interface EmotionalArcQaInput {
  /** Étapes de l'arc émotionnel attendu. */
  expectedArc: EmotionalArcStep[];
  /** Panels avec leur ton émotionnel. */
  panels: Array<{
    panelId: string;
    beatId?: string | null;
    emotionLine?: string | null;
    emotionalTone?: string | null;
    intensity?: number;
  }>;
  /** Seuil de rupture d'intensité autorisé (0-100). Défaut: 40. */
  maxIntensityJump?: number;
  /** Mode strict : fail sur ruptures. */
  strictMode?: boolean;
}

export interface EmotionalArcIssue {
  stepId?: string;
  panelId?: string;
  code: PipelineErrorCode;
  message: string;
  severity: "error" | "warning";
}

export interface EmotionalArcQaOutput {
  issues: EmotionalArcIssue[];
  errorCount: number;
  warningCount: number;
  ok: boolean;
  stats: {
    expectedSteps: number;
    coveredSteps: number;
    uncoveredSteps: number;
    intensityJumps: number;
    avgIntensity: number;
  };
}

/**
 * Détecte le ton émotionnel approximatif depuis le texte.
 */
function detectEmotionalIntensity(text: string | null | undefined): number {
  if (!text) return 50;
  const lower = text.toLowerCase();

  const highIntensityWords = [
    "rage", "fury", "terror", "ecstasy", "despair", "shock",
    "explosion", "scream", "death", "kill", "destroy",
    "colère", "fureur", "terreur", "désespoir", "mort", "cri",
  ];
  const lowIntensityWords = [
    "calm", "peace", "quiet", "gentle", "soft", "rest",
    "calme", "paix", "doux", "repos", "tranquille",
  ];

  let intensity = 50;
  for (const word of highIntensityWords) {
    if (lower.includes(word)) intensity += 15;
  }
  for (const word of lowIntensityWords) {
    if (lower.includes(word)) intensity -= 10;
  }

  return Math.max(0, Math.min(100, intensity));
}

/**
 * Exécute le QA de l'arc émotionnel.
 */
export function runEmotionalArcQaPass(input: EmotionalArcQaInput): EmotionalArcQaOutput {
  const strictMode = input.strictMode ?? false;
  const maxJump = input.maxIntensityJump ?? 40;
  const issues: EmotionalArcIssue[] = [];

  const coveredSteps = new Set<string>();
  const panelIntensities: number[] = [];

  const beatToStep = new Map<string, string>();
  for (const step of input.expectedArc) {
    for (const beatId of step.beatIds) {
      beatToStep.set(beatId, step.stepId);
    }
  }

  let prevIntensity: number | null = null;
  let intensityJumps = 0;

  for (const panel of input.panels) {
    const beatId = panel.beatId;
    if (beatId && beatToStep.has(beatId)) {
      coveredSteps.add(beatToStep.get(beatId)!);
    }

    const intensity = panel.intensity ?? detectEmotionalIntensity(panel.emotionLine ?? panel.emotionalTone);
    panelIntensities.push(intensity);

    if (prevIntensity !== null) {
      const jump = Math.abs(intensity - prevIntensity);
      if (jump > maxJump) {
        intensityJumps++;
        issues.push({
          panelId: panel.panelId,
          code: PIPELINE_ERROR_CODES.E_STORY_EMOTIONAL_ARC_BROKEN,
          message: `Emotional intensity jump of ${jump} (${prevIntensity}→${intensity}) exceeds threshold ${maxJump}`,
          severity: strictMode ? "error" : "warning",
        });
      }
    }
    prevIntensity = intensity;
  }

  for (const step of input.expectedArc) {
    if (!coveredSteps.has(step.stepId)) {
      issues.push({
        stepId: step.stepId,
        code: PIPELINE_ERROR_CODES.E_STORY_EMOTIONAL_ARC_BROKEN,
        message: `Emotional step "${step.label}" (${step.stepId}) not covered by any panel`,
        severity: strictMode ? "error" : "warning",
      });
    }
  }

  const avgIntensity =
    panelIntensities.length > 0
      ? Math.round(panelIntensities.reduce((a, b) => a + b, 0) / panelIntensities.length)
      : 50;

  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;

  return {
    issues,
    errorCount,
    warningCount,
    ok: errorCount === 0,
    stats: {
      expectedSteps: input.expectedArc.length,
      coveredSteps: coveredSteps.size,
      uncoveredSteps: input.expectedArc.length - coveredSteps.size,
      intensityJumps,
      avgIntensity,
    },
  };
}

/**
 * Formate le résultat du QA pour le logging.
 */
export function formatEmotionalArcQaLog(output: EmotionalArcQaOutput): string {
  if (output.ok && output.warningCount === 0) {
    return (
      `[emotional-arc-qa] ok — steps=${output.stats.coveredSteps}/${output.stats.expectedSteps} ` +
      `avgIntensity=${output.stats.avgIntensity}`
    );
  }

  return (
    `[emotional-arc-qa] errors=${output.errorCount} warnings=${output.warningCount} ` +
    `jumps=${output.stats.intensityJumps} uncovered=${output.stats.uncoveredSteps}`
  );
}
