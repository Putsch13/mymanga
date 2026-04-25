/**
 * P2.13 — dialogue-qa-pass : QA des dialogues.
 *
 * En mode premium, ce QA interdit les dialogues flottants :
 * - Chaque dialogue doit avoir un speaker identifié
 * - Le speaker doit être ancré à un panel (visible ou référencé)
 *
 * @module dialogue-qa-pass
 */

import {
  buildDialogueContractFromBlueprints,
  validateDialogueContract,
  formatDialogueContractLog,
  type DialogueContract,
} from "@manga-ai-studio/core";
import { PIPELINE_ERROR_CODES, type PipelineErrorCode } from "@manga-ai-studio/core";

export interface DialogueQaPassInput {
  blueprints: Array<{
    panelId: string;
    dialogueLines?: Array<{ speaker?: string; text: string }> | null;
    requiredCharacterIds?: string[];
    visibleCharacterIds?: string[];
  }>;
  chapterId: string;
  characterNameById: Record<string, string>;
  /** IDs des personnages connus. */
  knownCharacterIds?: string[];
  /** Mode strict : fail sur dialogues flottants. Par défaut true en premium. */
  strictMode?: boolean;
}

export interface DialogueQaIssue {
  panelId?: string;
  speakerId?: string;
  code: PipelineErrorCode | string;
  message: string;
  severity: "error" | "warning";
}

export interface DialogueQaPassOutput {
  contract: DialogueContract;
  issues: DialogueQaIssue[];
  errorCount: number;
  warningCount: number;
  ok: boolean;
  stats: {
    totalLines: number;
    floatingLines: number;
    anchoredLines: number;
    uniqueSpeakers: number;
  };
}

/**
 * Exécute le QA des dialogues.
 */
export function runDialogueQaPass(input: DialogueQaPassInput): DialogueQaPassOutput {
  const strictMode = input.strictMode ?? true;

  const contract = buildDialogueContractFromBlueprints(
    input.chapterId,
    input.blueprints,
    input.characterNameById,
  );

  console.info(formatDialogueContractLog(contract));

  const panelIds = input.blueprints.map((b) => b.panelId);
  const validationResult = validateDialogueContract(contract, {
    panelIds,
    characterIds: input.knownCharacterIds,
    allowFloating: !strictMode,
  });

  const issues: DialogueQaIssue[] = validationResult.issues.map((i) => ({
    panelId: i.panelId,
    speakerId: i.speakerId,
    code: i.code,
    message: i.message,
    severity: i.severity,
  }));

  if (strictMode && validationResult.stats.floatingLines > 0) {
    issues.push({
      code: PIPELINE_ERROR_CODES.E_DIALOGUE_SPEAKER_NOT_ANCHORED,
      message: `${validationResult.stats.floatingLines} floating dialogue(s) detected — speaker not visible in panel`,
      severity: "error",
    });
  }

  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;

  return {
    contract,
    issues,
    errorCount,
    warningCount,
    ok: errorCount === 0,
    stats: validationResult.stats,
  };
}

/**
 * Formate le résultat du QA pour le logging.
 */
export function formatDialogueQaLog(output: DialogueQaPassOutput): string {
  if (output.ok && output.warningCount === 0) {
    return (
      `[dialogue-qa] ok — lines=${output.stats.totalLines} ` +
      `anchored=${output.stats.anchoredLines} speakers=${output.stats.uniqueSpeakers}`
    );
  }

  const errorSummary =
    output.errorCount > 0
      ? output.issues
          .filter((i) => i.severity === "error")
          .slice(0, 3)
          .map((i) => `  - ${i.message}`)
          .join("\n")
      : "";

  return (
    `[dialogue-qa] errors=${output.errorCount} warnings=${output.warningCount} ` +
    `floating=${output.stats.floatingLines}` +
    (errorSummary ? `\n${errorSummary}` : "")
  );
}
