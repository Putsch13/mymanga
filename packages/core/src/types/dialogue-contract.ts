/**
 * P2.12 — DialogueContract : contrat de dialogues pour un chapitre.
 *
 * Ce contrat définit les règles et contraintes pour les dialogues du chapitre.
 * Il garantit que :
 * 1. Chaque dialogue a un speaker identifié
 * 2. Le speaker est ancré à un panel
 * 3. Pas de dialogues "flottants" (speaker non identifié ou non visible)
 *
 * @module dialogue-contract
 */

import { z } from "zod";
import { PIPELINE_ERROR_CODES, type PipelineErrorCode } from "./pipeline-error-codes";

/**
 * Une ligne de dialogue dans un panel.
 */
export const dialogueContractLineSchema = z.object({
  /** ID unique de la ligne (optionnel). */
  lineId: z.string().optional(),
  /** ID du panel contenant ce dialogue. */
  panelId: z.string().min(1),
  /** ID du speaker (personnage). */
  speakerId: z.string().min(1),
  /** Nom du speaker (pour affichage). */
  speakerName: z.string().min(1),
  /** Texte du dialogue. */
  text: z.string().min(1).max(280),
  /** Le speaker est-il visible dans le panel ? */
  speakerVisible: z.boolean().default(true),
  /** Type de dialogue. */
  dialogueType: z
    .enum(["speech", "thought", "whisper", "shout", "narration", "sfx"])
    .default("speech"),
});

export type DialogueContractLine = z.infer<typeof dialogueContractLineSchema>;

/**
 * DialogueContract — le contrat de dialogues pour un chapitre.
 */
export const dialogueContractSchema = z.object({
  chapterId: z.string().min(1),
  /** Toutes les lignes de dialogue du chapitre. */
  lines: z.array(dialogueContractLineSchema),
  /** Nombre total de lignes. */
  totalLines: z.number().int().min(0),
  /** Nombre de panels avec dialogue. */
  panelsWithDialogue: z.number().int().min(0),
  /** Speakers uniques. */
  uniqueSpeakers: z.array(z.string()),
});

export type DialogueContract = z.infer<typeof dialogueContractSchema>;

/**
 * Codes d'erreur pour la validation du contrat de dialogue.
 */
export const DIALOGUE_CONTRACT_ERROR_CODES = {
  SPEAKER_NOT_IDENTIFIED: "E_DIALOGUE_SPEAKER_NOT_IDENTIFIED",
  SPEAKER_NOT_ANCHORED: "E_DIALOGUE_SPEAKER_NOT_ANCHORED",
  DIALOGUE_FLOATING: "E_DIALOGUE_FLOATING",
  DIALOGUE_TOO_LONG: "E_DIALOGUE_TOO_LONG",
  PANEL_NOT_FOUND: "E_DIALOGUE_PANEL_NOT_FOUND",
} as const;

export type DialogueContractErrorCode =
  (typeof DIALOGUE_CONTRACT_ERROR_CODES)[keyof typeof DIALOGUE_CONTRACT_ERROR_CODES];

export interface DialogueContractIssue {
  code: DialogueContractErrorCode | PipelineErrorCode;
  message: string;
  panelId?: string;
  speakerId?: string;
  lineIndex?: number;
  severity: "error" | "warning";
}

export interface DialogueContractValidationResult {
  ok: boolean;
  issues: DialogueContractIssue[];
  stats: {
    totalLines: number;
    floatingLines: number;
    anchoredLines: number;
    uniqueSpeakers: number;
  };
}

/**
 * Valide un DialogueContract.
 */
export function validateDialogueContract(
  contract: DialogueContract,
  options?: {
    /** IDs des panels existants pour vérifier l'ancrage. */
    panelIds?: string[];
    /** IDs des personnages connus pour vérifier le speaker. */
    characterIds?: string[];
    /** Autoriser les dialogues flottants (speaker non visible). */
    allowFloating?: boolean;
  },
): DialogueContractValidationResult {
  const issues: DialogueContractIssue[] = [];
  const panelSet = new Set(options?.panelIds ?? []);
  const characterSet = new Set(options?.characterIds ?? []);
  const allowFloating = options?.allowFloating ?? false;

  let floatingLines = 0;
  let anchoredLines = 0;

  for (let i = 0; i < contract.lines.length; i++) {
    const line = contract.lines[i];

    if (panelSet.size > 0 && !panelSet.has(line.panelId)) {
      issues.push({
        code: DIALOGUE_CONTRACT_ERROR_CODES.PANEL_NOT_FOUND,
        message: `Panel "${line.panelId}" not found for dialogue line ${i}`,
        panelId: line.panelId,
        lineIndex: i,
        severity: "error",
      });
    }

    if (characterSet.size > 0 && !characterSet.has(line.speakerId)) {
      issues.push({
        code: DIALOGUE_CONTRACT_ERROR_CODES.SPEAKER_NOT_IDENTIFIED,
        message: `Speaker "${line.speakerId}" not in known characters for line ${i}`,
        speakerId: line.speakerId,
        lineIndex: i,
        severity: "warning",
      });
    }

    if (!line.speakerVisible) {
      floatingLines++;
      if (!allowFloating) {
        issues.push({
          code: DIALOGUE_CONTRACT_ERROR_CODES.DIALOGUE_FLOATING,
          message: `Floating dialogue (speaker "${line.speakerName}" not visible) in panel ${line.panelId}`,
          panelId: line.panelId,
          speakerId: line.speakerId,
          lineIndex: i,
          severity: "warning",
        });
      }
    } else {
      anchoredLines++;
    }

    if (line.text.length > 220) {
      issues.push({
        code: DIALOGUE_CONTRACT_ERROR_CODES.DIALOGUE_TOO_LONG,
        message: `Dialogue too long (${line.text.length} chars) in panel ${line.panelId}`,
        panelId: line.panelId,
        lineIndex: i,
        severity: "warning",
      });
    }
  }

  const errorCount = issues.filter((i) => i.severity === "error").length;

  return {
    ok: errorCount === 0,
    issues,
    stats: {
      totalLines: contract.lines.length,
      floatingLines,
      anchoredLines,
      uniqueSpeakers: contract.uniqueSpeakers.length,
    },
  };
}

/**
 * Input blueprint pour la construction du contrat de dialogue.
 * P0.3 — Utilise les attributs speaker pour déterminer la visibilité.
 */
export interface DialogueContractBlueprintInput {
  panelId: string;
  dialogueLines?: Array<{ speaker?: string; text: string; characterId?: string }> | null;
  requiredCharacterIds?: string[];
  visibleCharacterIds?: string[];
  mustShowCharacterIds?: string[];
  dialogueCarrier?: string;
  subjectFocus?: string;
  speakerAnchorCharacterId?: string | null;
  /** Aligné sur PanelBlueprintPremium (peut être null côté schéma). */
  mangaPanelFunction?: string | null;
  dialogueLinesAnchored?: number;
}

/**
 * Détermine si un speaker est visible dans un panel.
 * P0.3 — Logique alignée avec isSpeakerPanelForDialogueBeat.
 */
function isSpeakerVisibleInPanel(
  speakerId: string,
  bp: DialogueContractBlueprintInput,
): boolean {
  // Si c'est le speaker anchor, il est forcément visible
  if (bp.speakerAnchorCharacterId === speakerId) {
    return true;
  }

  // Si le panel est explicitement speaker_visible avec anchor
  if (bp.dialogueCarrier === "speaker_visible" && bp.speakerAnchorCharacterId) {
    return bp.speakerAnchorCharacterId === speakerId;
  }

  // Si le panel est de type dialogue_speaker
  if (bp.mangaPanelFunction === "dialogue_speaker") {
    return true;
  }

  // Vérifier dans les IDs de personnages visibles
  const visibleIds = new Set([
    ...(bp.requiredCharacterIds ?? []),
    ...(bp.visibleCharacterIds ?? []),
    ...(bp.mustShowCharacterIds ?? []),
  ]);

  if (visibleIds.has(speakerId)) {
    return true;
  }

  // Si dialogueLinesAnchored > 0, considérer comme visible
  if ((bp.dialogueLinesAnchored ?? 0) > 0) {
    return true;
  }

  // Si subjectFocus est speaker/duo avec des personnages
  if (
    (bp.subjectFocus === "speaker" || bp.subjectFocus === "duo") &&
    visibleIds.size > 0
  ) {
    return true;
  }

  // Fallback : si aucun ID visible défini, considérer visible par défaut
  return visibleIds.size === 0;
}

/**
 * Construit un DialogueContract depuis les blueprints premium.
 * P0.3 — Utilise la logique unifiée de détection speaker.
 */
export function buildDialogueContractFromBlueprints(
  chapterId: string,
  blueprints: Array<DialogueContractBlueprintInput>,
  characterNameById: Record<string, string>,
): DialogueContract {
  const lines: DialogueContractLine[] = [];
  const panelsWithDialogue = new Set<string>();
  const uniqueSpeakers = new Set<string>();

  for (const bp of blueprints) {
    if (!bp.dialogueLines || bp.dialogueLines.length === 0) continue;

    for (const dl of bp.dialogueLines) {
      const speakerId =
        typeof dl.characterId === "string" && dl.characterId.trim().length > 0
          ? dl.characterId.trim()
          : (dl.speaker?.trim() || "unknown");
      const speakerName = characterNameById[speakerId] ?? dl.speaker?.trim() ?? (speakerId === "unknown" ? "???" : speakerId);
      const speakerVisible = isSpeakerVisibleInPanel(speakerId, bp);

      lines.push({
        panelId: bp.panelId,
        speakerId,
        speakerName,
        text: dl.text,
        speakerVisible,
        dialogueType: "speech",
      });

      panelsWithDialogue.add(bp.panelId);
      uniqueSpeakers.add(speakerId);
    }
  }

  return {
    chapterId,
    lines,
    totalLines: lines.length,
    panelsWithDialogue: panelsWithDialogue.size,
    uniqueSpeakers: Array.from(uniqueSpeakers),
  };
}

/**
 * Log formaté pour debug/observabilité.
 */
export function formatDialogueContractLog(contract: DialogueContract): string {
  const speakers = contract.uniqueSpeakers.slice(0, 5).join(",");
  const more = contract.uniqueSpeakers.length > 5 ? `+${contract.uniqueSpeakers.length - 5}` : "";
  return (
    `[dialogue-contract] lines=${contract.totalLines} ` +
    `panels=${contract.panelsWithDialogue} ` +
    `speakers=${speakers}${more}`
  );
}
