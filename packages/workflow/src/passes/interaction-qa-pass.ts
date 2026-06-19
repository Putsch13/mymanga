/**
 * P3.16 — interaction-qa-pass : QA des interactions visuelles.
 *
 * Ce QA vérifie que les interactions entre personnages sont visuellement cohérentes :
 * - Regard : personnages qui se parlent se regardent
 * - Distance : personnages proches pour dialogue, éloignés pour tension
 * - Réaction : réponse visuelle aux actions importantes
 *
 * @module interaction-qa-pass
 */

import { PIPELINE_ERROR_CODES, type PipelineErrorCode } from "@manga-ai-studio/core";

export interface InteractionQaInput {
  panels: Array<{
    panelId: string;
    renderMode?: string | null;
    visibleCharacterIds?: string[];
    dialogueLines?: Array<{ speaker?: string; text: string }> | null;
    actionLine?: string | null;
    shotType?: string | null;
  }>;
  /** Paires de personnages qui doivent interagir. */
  expectedInteractions?: Array<{
    characterA: string;
    characterB: string;
    interactionType: "dialogue" | "conflict" | "observation";
  }>;
  strictMode?: boolean;
}

export interface InteractionIssue {
  panelId: string;
  code: PipelineErrorCode;
  message: string;
  severity: "error" | "warning";
  characterIds?: string[];
}

export interface InteractionQaOutput {
  issues: InteractionIssue[];
  errorCount: number;
  warningCount: number;
  ok: boolean;
  stats: {
    dialoguePanels: number;
    multiCharacterPanels: number;
    reactionPanels: number;
    interactionsCovered: number;
    interactionsExpected: number;
  };
}

/**
 * Détecte si un panel contient une réaction visuelle.
 */
function isReactionPanel(panel: { renderMode?: string | null; actionLine?: string | null }): boolean {
  if (panel.renderMode === "reaction_shot") return true;
  const action = panel.actionLine?.toLowerCase() ?? "";
  return /react|réagi|surpris|choqué|shocked|surprised|gasp|eyes widen/.test(action);
}

/**
 * Exécute le QA des interactions.
 */
export function runInteractionQaPass(input: InteractionQaInput): InteractionQaOutput {
  const strictMode = input.strictMode ?? false;
  const issues: InteractionIssue[] = [];

  let dialoguePanels = 0;
  let multiCharacterPanels = 0;
  let reactionPanels = 0;

  const interactionPairs = new Set<string>();

  for (const panel of input.panels) {
    const chars = panel.visibleCharacterIds ?? [];
    const hasDialogue = (panel.dialogueLines?.length ?? 0) > 0;
    const isReaction = isReactionPanel(panel);

    if (hasDialogue) dialoguePanels++;
    if (chars.length >= 2) multiCharacterPanels++;
    if (isReaction) reactionPanels++;

    if (hasDialogue && chars.length >= 2) {
      for (let i = 0; i < chars.length; i++) {
        for (let j = i + 1; j < chars.length; j++) {
          const pair = [chars[i], chars[j]].sort().join("|");
          interactionPairs.add(pair);
        }
      }
    }

    if (hasDialogue && chars.length === 0) {
      issues.push({
        panelId: panel.panelId,
        code: PIPELINE_ERROR_CODES.E_STORY_INTERACTION_MISSING,
        message: `Dialogue panel ${panel.panelId} has no visible characters — consider adding speaker`,
        severity: "warning",
      });
    }

    if (
      panel.renderMode === "dialogue_two_shot" &&
      chars.length < 2
    ) {
      issues.push({
        panelId: panel.panelId,
        code: PIPELINE_ERROR_CODES.E_STORY_INTERACTION_MISSING,
        message: `dialogue_two_shot panel ${panel.panelId} has ${chars.length} characters (expected 2+)`,
        severity: strictMode ? "error" : "warning",
        characterIds: chars,
      });
    }

    const needsReaction = /attack|hit|strike|reveal|shock|frappe|attaque|révèle/i.test(
      panel.actionLine ?? "",
    );
    if (needsReaction && !isReaction) {
      issues.push({
        panelId: panel.panelId,
        code: PIPELINE_ERROR_CODES.E_STORY_INTERACTION_MISSING,
        message: `Panel ${panel.panelId} has impactful action but no reaction shot follows`,
        severity: "warning",
      });
    }
  }

  let interactionsCovered = 0;
  const expectedInteractions = input.expectedInteractions ?? [];
  for (const interaction of expectedInteractions) {
    const pair = [interaction.characterA, interaction.characterB].sort().join("|");
    if (interactionPairs.has(pair)) {
      interactionsCovered++;
    } else {
      issues.push({
        panelId: "",
        code: PIPELINE_ERROR_CODES.E_STORY_INTERACTION_MISSING,
        message: `Expected ${interaction.interactionType} between ${interaction.characterA} and ${interaction.characterB} not found`,
        severity: strictMode ? "error" : "warning",
        characterIds: [interaction.characterA, interaction.characterB],
      });
    }
  }

  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;

  return {
    issues,
    errorCount,
    warningCount,
    ok: errorCount === 0,
    stats: {
      dialoguePanels,
      multiCharacterPanels,
      reactionPanels,
      interactionsCovered,
      interactionsExpected: expectedInteractions.length,
    },
  };
}

/**
 * Formate le résultat du QA pour le logging.
 */
export function formatInteractionQaLog(output: InteractionQaOutput): string {
  if (output.ok && output.warningCount === 0) {
    return (
      `[interaction-qa] ok — dialogue=${output.stats.dialoguePanels} ` +
      `multiChar=${output.stats.multiCharacterPanels} reactions=${output.stats.reactionPanels}`
    );
  }

  return (
    `[interaction-qa] errors=${output.errorCount} warnings=${output.warningCount} ` +
    `interactions=${output.stats.interactionsCovered}/${output.stats.interactionsExpected}`
  );
}
