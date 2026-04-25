/**
 * P4.17 — job-audit-bundle : Génération d'un bundle d'audit par job.
 *
 * Ce module génère un ensemble de fichiers JSON pour chaque job de génération,
 * permettant le debug et la traçabilité complète du pipeline.
 *
 * Fichiers générés (12) :
 * 1. job-meta.json — métadonnées du job
 * 2. cast-contract.json — contrat de cast validé
 * 3. story-contract.json — contrat d'histoire validé
 * 4. dialogue-contract.json — contrat de dialogues
 * 5. storyboard-plan.json — plan du storyboard
 * 6. panel-specs.json — spécifications des panels
 * 7. visual-memory.json — mémoire visuelle chargée
 * 8. render-results.json — résultats du rendu
 * 9. qa-results.json — résultats des QA passes
 * 10. error-log.json — erreurs et warnings
 * 11. timings.json — temps d'exécution par phase
 * 12. coverage-report.json — rapport de couverture visuelle
 *
 * @module job-audit-bundle
 */

import type { ChapterCastContract, ChapterStoryContract, DialogueContract } from "@manga-ai-studio/core";

export interface JobAuditMeta {
  jobId: string;
  chapterId: string;
  projectId: string;
  startedAt: string;
  completedAt?: string;
  pipelineVersion: string;
  premiumMode: boolean;
}

export interface QaPassResult {
  passName: string;
  ok: boolean;
  errorCount: number;
  warningCount: number;
  issues: Array<{ code: string; message: string; severity: string }>;
}

export interface JobAuditBundle {
  meta: JobAuditMeta;
  castContract?: ChapterCastContract | null;
  storyContract?: ChapterStoryContract | null;
  dialogueContract?: DialogueContract | null;
  storyboardPlan?: Record<string, unknown> | null;
  panelSpecs?: Array<Record<string, unknown>> | null;
  visualMemory?: Record<string, unknown> | null;
  renderResults?: {
    totalPanels: number;
    successfulRenders: number;
    failedRenders: number;
    skippedRenders: number;
  } | null;
  qaResults?: QaPassResult[];
  errorLog?: Array<{
    timestamp: string;
    code: string;
    message: string;
    context?: Record<string, unknown>;
  }>;
  timings?: Record<string, number>;
  coverageReport?: {
    charactersCovered: number;
    charactersExpected: number;
    locationsCovered: number;
    locationsExpected: number;
    beatsCovered: number;
    beatsExpected: number;
  } | null;
}

/**
 * Crée un bundle d'audit vide avec les métadonnées.
 */
export function createAuditBundle(meta: JobAuditMeta): JobAuditBundle {
  return {
    meta,
    castContract: null,
    storyContract: null,
    dialogueContract: null,
    storyboardPlan: null,
    panelSpecs: null,
    visualMemory: null,
    renderResults: null,
    qaResults: [],
    errorLog: [],
    timings: {},
    coverageReport: null,
  };
}

/**
 * Ajoute un résultat de QA pass au bundle.
 */
export function addQaResultToBundle(bundle: JobAuditBundle, result: QaPassResult): void {
  if (!bundle.qaResults) bundle.qaResults = [];
  bundle.qaResults.push(result);
}

/**
 * Ajoute une erreur au log d'erreurs.
 */
export function addErrorToBundle(
  bundle: JobAuditBundle,
  error: { code: string; message: string; context?: Record<string, unknown> },
): void {
  if (!bundle.errorLog) bundle.errorLog = [];
  bundle.errorLog.push({
    timestamp: new Date().toISOString(),
    code: error.code,
    message: error.message,
    context: error.context,
  });
}

/**
 * Sérialise le bundle en fichiers JSON individuels.
 */
export function serializeAuditBundle(bundle: JobAuditBundle): Map<string, string> {
  const files = new Map<string, string>();

  files.set("job-meta.json", JSON.stringify(bundle.meta, null, 2));

  if (bundle.castContract) {
    files.set("cast-contract.json", JSON.stringify(bundle.castContract, null, 2));
  }

  if (bundle.storyContract) {
    files.set("story-contract.json", JSON.stringify(bundle.storyContract, null, 2));
  }

  if (bundle.dialogueContract) {
    files.set("dialogue-contract.json", JSON.stringify(bundle.dialogueContract, null, 2));
  }

  if (bundle.storyboardPlan) {
    files.set("storyboard-plan.json", JSON.stringify(bundle.storyboardPlan, null, 2));
  }

  if (bundle.panelSpecs) {
    files.set("panel-specs.json", JSON.stringify(bundle.panelSpecs, null, 2));
  }

  if (bundle.visualMemory) {
    files.set("visual-memory.json", JSON.stringify(bundle.visualMemory, null, 2));
  }

  if (bundle.renderResults) {
    files.set("render-results.json", JSON.stringify(bundle.renderResults, null, 2));
  }

  if (bundle.qaResults && bundle.qaResults.length > 0) {
    files.set("qa-results.json", JSON.stringify(bundle.qaResults, null, 2));
  }

  if (bundle.errorLog && bundle.errorLog.length > 0) {
    files.set("error-log.json", JSON.stringify(bundle.errorLog, null, 2));
  }

  if (bundle.timings && Object.keys(bundle.timings).length > 0) {
    files.set("timings.json", JSON.stringify(bundle.timings, null, 2));
  }

  if (bundle.coverageReport) {
    files.set("coverage-report.json", JSON.stringify(bundle.coverageReport, null, 2));
  }

  return files;
}

/**
 * Génère un résumé du bundle pour le logging.
 */
export function formatAuditBundleSummary(bundle: JobAuditBundle): string {
  const files = serializeAuditBundle(bundle);
  const qaOk = bundle.qaResults?.every((r) => r.ok) ?? true;
  const errorCount = bundle.errorLog?.length ?? 0;

  return (
    `[audit-bundle] job=${bundle.meta.jobId} ` +
    `files=${files.size} qa_ok=${qaOk} errors=${errorCount}`
  );
}

/**
 * Calcule les statistiques globales du bundle.
 */
export function computeBundleStats(bundle: JobAuditBundle): {
  totalQaPasses: number;
  passedQaPasses: number;
  failedQaPasses: number;
  totalErrors: number;
  totalWarnings: number;
  totalTimeMs: number;
} {
  const qaResults = bundle.qaResults ?? [];
  const totalQaPasses = qaResults.length;
  const passedQaPasses = qaResults.filter((r) => r.ok).length;
  const failedQaPasses = totalQaPasses - passedQaPasses;

  let totalErrors = 0;
  let totalWarnings = 0;
  for (const result of qaResults) {
    totalErrors += result.errorCount;
    totalWarnings += result.warningCount;
  }

  const timings = bundle.timings ?? {};
  const totalTimeMs = Object.values(timings).reduce((sum, t) => sum + t, 0);

  return {
    totalQaPasses,
    passedQaPasses,
    failedQaPasses,
    totalErrors,
    totalWarnings,
    totalTimeMs,
  };
}
