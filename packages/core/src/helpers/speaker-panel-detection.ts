/**
 * P0 — Helper unique pour détecter un panel speaker valide.
 *
 * Ce helper est utilisé par :
 * - dialogue-qa-pass
 * - manga-structure-qa
 * - pre-render-qa
 * - dialogue-scene-writer
 *
 * Un panel est considéré comme "speaker panel" pour un beat avec dialogue si :
 * - dialogueCarrier === "speaker_visible" ET speakerAnchorCharacterId défini
 * - OU subjectFocus === "speaker" ou "duo" ET dialogueLines présentes
 * - OU mangaPanelFunction === "dialogue_speaker"
 *
 * @module speaker-panel-detection
 */

/**
 * Input pour la détection de speaker panel.
 * Toutes les propriétés sont optionnelles pour permettre des objets partiels.
 */
export interface SpeakerPanelInput {
  dialogueCarrier?: string | null;
  subjectFocus?: string | null;
  speakerAnchorCharacterId?: string | null;
  mangaPanelFunction?: string | null;
  dialogueLines?: Array<{ speaker?: string; text: string }> | null;
  dialogueLinesAnchored?: number | null;
  mustShowCharacterIds?: string[] | null;
  /** PR9 — `PanelTextContract` quand le dialogue vit dans le contrat plutôt que dans `dialogueLines`. */
  textContract?: unknown;
}

function panelHasNonEmptyDialogue(panel: SpeakerPanelInput): boolean {
  if (Array.isArray(panel.dialogueLines) && panel.dialogueLines.some((l) => String(l.text ?? "").trim().length > 0)) {
    return true;
  }
  const tc = panel.textContract;
  if (!tc || typeof tc !== "object" || Array.isArray(tc)) return false;
  const dialogues = (tc as { dialogues?: unknown }).dialogues;
  if (!Array.isArray(dialogues)) return false;
  return dialogues.some((d) => {
    if (!d || typeof d !== "object") return false;
    const text = String((d as { text?: unknown }).text ?? "").trim();
    return text.length > 0;
  });
}

/**
 * Vérifie si un panel est un panel speaker valide pour un beat avec dialogue.
 *
 * Critères (au moins un doit être satisfait) :
 * 1. dialogueCarrier === "speaker_visible" + speakerAnchorCharacterId
 * 2. subjectFocus === "speaker" ou "duo" + dialogueLines
 * 3. mangaPanelFunction === "dialogue_speaker"
 * 4. dialogueLinesAnchored > 0
 */
export function isSpeakerPanelForDialogueBeat(panel: SpeakerPanelInput): boolean {
  // Critère 1 : dialogueCarrier speaker_visible avec anchor
  if (
    panel.dialogueCarrier === "speaker_visible" &&
    panel.speakerAnchorCharacterId != null &&
    panel.speakerAnchorCharacterId.length > 0
  ) {
    return true;
  }

  // Critère 2 : subjectFocus speaker/duo avec dialogue
  const hasSpeakerFocus =
    panel.subjectFocus === "speaker" || panel.subjectFocus === "duo";
  const hasDialogueLines = panelHasNonEmptyDialogue(panel);

  if (hasSpeakerFocus && hasDialogueLines) {
    return true;
  }

  // Critère 3 : mangaPanelFunction dialogue_speaker
  if (panel.mangaPanelFunction === "dialogue_speaker") {
    return true;
  }

  // Critère 4 : dialogueLinesAnchored explicitement > 0
  if (
    typeof panel.dialogueLinesAnchored === "number" &&
    panel.dialogueLinesAnchored > 0
  ) {
    return true;
  }

  // Critère fallback : hero focus avec dialogue et personnages visibles
  if (
    panel.subjectFocus === "hero" &&
    hasDialogueLines &&
    Array.isArray(panel.mustShowCharacterIds) &&
    panel.mustShowCharacterIds.length > 0
  ) {
    return true;
  }

  return false;
}

/**
 * Input pour un blueprint avec beatId.
 */
export interface SpeakerPanelWithBeatInput extends SpeakerPanelInput {
  beatId: string;
}

/**
 * Vérifie si un beat avec dialogue a au moins un panel speaker valide.
 */
export function beatHasSpeakerPanelForDialogue(
  beatId: string,
  blueprints: ReadonlyArray<SpeakerPanelWithBeatInput>,
): boolean {
  const beatPanels = blueprints.filter((bp) => bp.beatId === beatId);

  // Si aucun panel du beat n'a de dialogue, pas besoin de speaker panel
  const hasDialogueInBeat = beatPanels.some((bp) => panelHasNonEmptyDialogue(bp));
  if (!hasDialogueInBeat) {
    return true;
  }

  // Sinon, il faut au moins un speaker panel
  return beatPanels.some(isSpeakerPanelForDialogueBeat);
}

/**
 * Compte les panels speaker valides pour les statistiques.
 */
export function countSpeakerPanels(
  blueprints: ReadonlyArray<SpeakerPanelInput>,
): number {
  return blueprints.filter(isSpeakerPanelForDialogueBeat).length;
}

/**
 * Retourne les beats qui ont des dialogues mais pas de speaker panel valide.
 */
export function findBeatsWithMissingSpeakerPanels(
  blueprints: ReadonlyArray<SpeakerPanelWithBeatInput>,
): string[] {
  const beatIds = [...new Set(blueprints.map((bp) => bp.beatId))];
  return beatIds.filter((bid) => !beatHasSpeakerPanelForDialogue(bid, blueprints));
}
