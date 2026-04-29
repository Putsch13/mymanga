/**
 * P4.17 / P9.24 — job-audit-bundle : Génération d'un bundle d'audit par job.
 *
 * Ce module génère un ensemble de fichiers JSON pour chaque job de génération,
 * permettant le debug et la traçabilité complète du pipeline.
 *
 * Fichiers générés (16) :
 * 01. job-meta.json — métadonnées du job
 * 02. input-story.json — texte narratif d'entrée
 * 03. visual-discovery.json — entités détectées automatiquement
 * 04. canon-resolver.json — résolution canonique des entités
 * 05. cast-contract.json — contrat de cast validé
 * 06. location-contract.json — contrat de lieux
 * 07. npc-contract.json — contrat de groupes PNJ
 * 08. non-human-contract.json — contrat robots/hybrides/créatures
 * 09. prop-contract.json — contrat de props (autorisés/interdits)
 * 10. story-contract.json — contrat d'histoire validé
 * 11. dialogue-contract.json — contrat de dialogues
 * 12. storyboard-plan.json — plan du storyboard
 * 13. qa-results.json — résultats des QA passes
 * 14. render-specs.json — spécifications de rendu
 * 15. preflight-report.json — rapport de preflight
 * 16. final-job-report.json — rapport final du job
 *
 * @module job-audit-bundle
 */

import type {
  ChapterCastContract,
  ChapterStoryContract,
  DialogueContract,
  LocationContract,
  NpcGroupContract,
  NonHumanVisualContract,
} from "@manga-ai-studio/core";
import type { ChapterVisualDiscoveryContract } from "../passes/visual-discovery-pass";
import type { CanonResolvedVisualContract } from "../passes/canon-resolver-pass";

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
  // P9.24 — Nouveaux contrats de découverte
  inputStory?: {
    chapterSummary?: string | null;
    userIntent?: string | null;
    beats?: Array<{ beatId: string; summary?: string }>;
  } | null;
  visualDiscovery?: ChapterVisualDiscoveryContract | null;
  /** Métadonnées composeur monde vs regex (aligné `VisualWorldDiscoveryPassResult`). */
  visualWorldComposeMeta?: {
    path: "ai_composer" | "regex_only" | "regex_after_compose_error";
    composeErrorSummary?: string;
  } | null;
  canonResolver?: CanonResolvedVisualContract | null;
  // Contrats principaux
  castContract?: ChapterCastContract | null;
  locationContract?: LocationContract | null;
  npcContract?: NpcGroupContract | null;
  nonHumanContract?: NonHumanVisualContract | null;
  propContract?: {
    allowedProps: string[];
    forbiddenProps: string[];
    phantomPropsStripped: string[];
  } | null;
  storyContract?: ChapterStoryContract | null;
  dialogueContract?: DialogueContract | null;
  // Plan et rendu
  storyboardPlan?: Record<string, unknown> | null;
  renderSpecs?: Array<Record<string, unknown>> | null;
  visualMemory?: Record<string, unknown> | null;
  renderResults?: {
    totalPanels: number;
    successfulRenders: number;
    failedRenders: number;
    skippedRenders: number;
  } | null;
  // QA et erreurs
  qaResults?: QaPassResult[];
  preflightReport?: {
    totalSpecs: number;
    validSpecs: number;
    errors: Array<{ code: string; panelId?: string; message: string }>;
  } | null;
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
    npcGroupsCovered: number;
    npcGroupsExpected: number;
  } | null;
  // Rapport final
  finalReport?: {
    success: boolean;
    totalPanels: number;
    generatedImages: number;
    failedImages: number;
    totalQaPasses: number;
    passedQaPasses: number;
    totalTimeMs: number;
  } | null;
}

/**
 * Crée un bundle d'audit vide avec les métadonnées.
 */
export function createAuditBundle(meta: JobAuditMeta): JobAuditBundle {
  return {
    meta,
    inputStory: null,
    visualDiscovery: null,
    visualWorldComposeMeta: null,
    canonResolver: null,
    castContract: null,
    locationContract: null,
    npcContract: null,
    nonHumanContract: null,
    propContract: null,
    storyContract: null,
    dialogueContract: null,
    storyboardPlan: null,
    renderSpecs: null,
    visualMemory: null,
    renderResults: null,
    qaResults: [],
    preflightReport: null,
    errorLog: [],
    timings: {},
    coverageReport: null,
    finalReport: null,
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
 * Sérialise le bundle en fichiers JSON individuels (16 fichiers).
 */
export function serializeAuditBundle(bundle: JobAuditBundle): Map<string, string> {
  const files = new Map<string, string>();

  // 01. Métadonnées
  files.set("01_job_meta.json", JSON.stringify(bundle.meta, null, 2));

  // 02. Input story
  if (bundle.inputStory) {
    files.set("02_input_story.json", JSON.stringify(bundle.inputStory, null, 2));
  }

  // 03. Visual discovery
  if (bundle.visualDiscovery) {
    files.set("03_visual_discovery.json", JSON.stringify(bundle.visualDiscovery, null, 2));
  }

  if (bundle.visualWorldComposeMeta) {
    files.set("03b_visual_world_compose_meta.json", JSON.stringify(bundle.visualWorldComposeMeta, null, 2));
  }

  // 04. Canon resolver
  if (bundle.canonResolver) {
    files.set("04_canon_resolver.json", JSON.stringify(bundle.canonResolver, null, 2));
  }

  // 05. Cast contract
  if (bundle.castContract) {
    files.set("05_cast_contract.json", JSON.stringify(bundle.castContract, null, 2));
  }

  // 06. Location contract
  if (bundle.locationContract) {
    files.set("06_location_contract.json", JSON.stringify(bundle.locationContract, null, 2));
  }

  // 07. NPC contract
  if (bundle.npcContract) {
    files.set("07_npc_contract.json", JSON.stringify(bundle.npcContract, null, 2));
  }

  // 08. Non-human contract
  if (bundle.nonHumanContract) {
    files.set("08_non_human_contract.json", JSON.stringify(bundle.nonHumanContract, null, 2));
  }

  // 09. Prop contract
  if (bundle.propContract) {
    files.set("09_prop_contract.json", JSON.stringify(bundle.propContract, null, 2));
  }

  // 10. Story contract
  if (bundle.storyContract) {
    files.set("10_story_contract.json", JSON.stringify(bundle.storyContract, null, 2));
  }

  // 11. Dialogue contract
  if (bundle.dialogueContract) {
    files.set("11_dialogue_contract.json", JSON.stringify(bundle.dialogueContract, null, 2));
  }

  // 12. Storyboard plan
  if (bundle.storyboardPlan) {
    files.set("12_storyboard_plan.json", JSON.stringify(bundle.storyboardPlan, null, 2));
  }

  // 13. QA results
  if (bundle.qaResults && bundle.qaResults.length > 0) {
    files.set("13_qa_results.json", JSON.stringify(bundle.qaResults, null, 2));
  }

  // 14. Render specs
  if (bundle.renderSpecs) {
    files.set("14_render_specs.json", JSON.stringify(bundle.renderSpecs, null, 2));
  }

  // 15. Preflight report
  if (bundle.preflightReport) {
    files.set("15_preflight_report.json", JSON.stringify(bundle.preflightReport, null, 2));
  }

  // 16. Final report
  if (bundle.finalReport) {
    files.set("16_final_job_report.json", JSON.stringify(bundle.finalReport, null, 2));
  }

  // Fichiers supplémentaires (non numérotés)
  if (bundle.visualMemory) {
    files.set("visual_memory.json", JSON.stringify(bundle.visualMemory, null, 2));
  }

  if (bundle.renderResults) {
    files.set("render_results.json", JSON.stringify(bundle.renderResults, null, 2));
  }

  if (bundle.errorLog && bundle.errorLog.length > 0) {
    files.set("error_log.json", JSON.stringify(bundle.errorLog, null, 2));
  }

  if (bundle.timings && Object.keys(bundle.timings).length > 0) {
    files.set("timings.json", JSON.stringify(bundle.timings, null, 2));
  }

  if (bundle.coverageReport) {
    files.set("coverage_report.json", JSON.stringify(bundle.coverageReport, null, 2));
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
