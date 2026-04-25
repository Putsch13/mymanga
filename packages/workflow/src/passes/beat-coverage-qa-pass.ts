/**
 * P3.14 — beat-coverage-qa-pass : QA de la couverture des beats.
 *
 * Ce QA vérifie que chaque beat narratif est couvert par au moins un panel.
 * Un beat non couvert = une partie de l'histoire qui n'est pas visualisée.
 *
 * @module beat-coverage-qa-pass
 */

import { PIPELINE_ERROR_CODES, type PipelineErrorCode } from "@manga-ai-studio/core";

export interface BeatCoverageQaInput {
  /** IDs des beats attendus (depuis le production plan). */
  expectedBeatIds: string[];
  /** Blueprints ou panels avec leur sourceBeatId. */
  panels: Array<{ panelId: string; sourceBeatId?: string | null; beatId?: string | null }>;
  /** Mode strict : fail si un beat n'est pas couvert. */
  strictMode?: boolean;
}

export interface BeatCoverageIssue {
  beatId: string;
  code: PipelineErrorCode;
  message: string;
  severity: "error" | "warning";
}

export interface BeatCoverageQaOutput {
  issues: BeatCoverageIssue[];
  errorCount: number;
  warningCount: number;
  ok: boolean;
  stats: {
    expectedBeats: number;
    coveredBeats: number;
    uncoveredBeats: number;
    coveragePercent: number;
    panelsPerBeat: Record<string, number>;
  };
}

/**
 * Exécute le QA de couverture des beats.
 */
export function runBeatCoverageQaPass(input: BeatCoverageQaInput): BeatCoverageQaOutput {
  const strictMode = input.strictMode ?? true;
  const issues: BeatCoverageIssue[] = [];

  const expectedSet = new Set(input.expectedBeatIds);
  const panelsPerBeat: Record<string, number> = {};

  for (const beatId of input.expectedBeatIds) {
    panelsPerBeat[beatId] = 0;
  }

  for (const panel of input.panels) {
    const beatId = panel.sourceBeatId ?? panel.beatId;
    if (beatId && panelsPerBeat[beatId] !== undefined) {
      panelsPerBeat[beatId]++;
    }
  }

  const uncoveredBeats: string[] = [];
  for (const [beatId, count] of Object.entries(panelsPerBeat)) {
    if (count === 0) {
      uncoveredBeats.push(beatId);
      issues.push({
        beatId,
        code: PIPELINE_ERROR_CODES.E_STORY_BEAT_NOT_COVERED,
        message: `Beat "${beatId}" has no panels — this part of the story will not be visualized`,
        severity: strictMode ? "error" : "warning",
      });
    }
  }

  const expectedBeats = input.expectedBeatIds.length;
  const coveredBeats = expectedBeats - uncoveredBeats.length;
  const coveragePercent = expectedBeats > 0 ? Math.round((coveredBeats / expectedBeats) * 100) : 100;

  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;

  return {
    issues,
    errorCount,
    warningCount,
    ok: errorCount === 0,
    stats: {
      expectedBeats,
      coveredBeats,
      uncoveredBeats: uncoveredBeats.length,
      coveragePercent,
      panelsPerBeat,
    },
  };
}

/**
 * Formate le résultat du QA pour le logging.
 */
export function formatBeatCoverageQaLog(output: BeatCoverageQaOutput): string {
  if (output.ok && output.warningCount === 0) {
    return (
      `[beat-coverage-qa] ok — coverage=${output.stats.coveragePercent}% ` +
      `(${output.stats.coveredBeats}/${output.stats.expectedBeats} beats)`
    );
  }

  const uncovered = output.issues
    .filter((i) => i.severity === "error")
    .slice(0, 5)
    .map((i) => i.beatId)
    .join(", ");

  return (
    `[beat-coverage-qa] errors=${output.errorCount} ` +
    `coverage=${output.stats.coveragePercent}% ` +
    `uncovered=${output.stats.uncoveredBeats}` +
    (uncovered ? ` [${uncovered}${output.stats.uncoveredBeats > 5 ? "..." : ""}]` : "")
  );
}
