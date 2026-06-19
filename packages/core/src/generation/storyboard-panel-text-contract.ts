/**
 * PR9 — Point d’entrée unique : storyboard panel → `PanelTextContract`.
 * Évite la divergence entre render-spec (IA) et enrich render-pass (workflow).
 */

import {
  buildPanelTextContractFromFragments,
  textContractToLegacyDialogue,
  validatePanelTextContract,
  type DialogueLineFragment,
  type PanelTextContract,
} from "./panel-text-contract";
import { isPersistedPanelTextContract } from "./reader-panel-metadata-text";

/** Sous-ensemble stable du storyboard panel pour le contrat texte. */
export type StoryboardPanelLikeForTextContract = {
  panelId: string;
  /**
   * Contrat déjà matérialisé (studio / snapshot). Si la forme est celle d’un
   * `PanelTextContract` persisté et qu’il passe `validatePanelTextContract`, il
   * prime sur `dialogue` / `panelTextBundle` (PR9).
   */
  textContract?: unknown;
  /** Lignes structurées blueprint / writer (prioritaires sur `dialogue` / `dialogues`). */
  dialogueLines?: readonly DialogueLineFragment[] | null;
  /** Lignes de dialogue (storyboard v2 / blueprint). */
  dialogue?: Array<{ speaker?: string; text: string }> | null;
  /** Alias legacy (`dialogues`) — même sémantique que `dialogue`. */
  dialogues?: Array<{ speaker?: string; text: string }> | null;
  narration?: string | null;
  sfx?: string[] | null;
  panelTextBundle?: Readonly<{
    dialogues?: ReadonlyArray<{ speaker: string; text: string }> | null;
    narration?: string | null;
    sfx?: readonly string[] | null;
  }> | null;
};

export function buildPanelTextContractFromStoryboardPanelLike(
  panel: StoryboardPanelLikeForTextContract,
): PanelTextContract {
  const primaryLines =
    panel.dialogueLines?.length
      ? panel.dialogueLines
      : panel.dialogue?.length
        ? panel.dialogue
        : panel.dialogues?.length
          ? panel.dialogues
          : null;
  return buildPanelTextContractFromFragments({
    panelId: panel.panelId,
    dialogueLines: primaryLines,
    narration: panel.narration ?? null,
    sfx: panel.sfx ?? null,
    panelTextBundle: panel.panelTextBundle ?? null,
  });
}

/**
 * Résout le `PanelTextContract` pour un panel storyboard : contrat embarqué
 * valide en priorité, sinon construction depuis les fragments épars.
 */
export function resolvePanelTextContractFromStoryboardPanelLike(
  panel: StoryboardPanelLikeForTextContract,
  options?: { narrativeRole?: string },
): PanelTextContract {
  const embedded = panel.textContract;
  if (isPersistedPanelTextContract(embedded)) {
    const base = embedded as PanelTextContract;
    const normalized: PanelTextContract = {
      ...base,
      panelId: panel.panelId,
      sfx: Array.isArray(base.sfx) ? base.sfx : [],
    };
    const { valid } = validatePanelTextContract(normalized, options?.narrativeRole);
    if (valid) return normalized;
  }
  return buildPanelTextContractFromStoryboardPanelLike(panel);
}

export function legacyDialogueLinesFromStoryboardPanelLike(
  panel: StoryboardPanelLikeForTextContract,
): Array<{ speaker: string; text: string }> {
  return textContractToLegacyDialogue(resolvePanelTextContractFromStoryboardPanelLike(panel));
}

/** Payload texte issu du `PanelRenderSpec` (post enrich), pour persistance v3. */
export type SpecPanelTextPayloadLike = {
  dialogue?: ReadonlyArray<{ speaker?: string; text: string }> | null;
  narration?: string | null;
  sfx?: readonly string[] | null;
};

/**
 * PR9 — persistance : un `textContract` déjà matérialisé sur le storyboard ne doit
 * pas être écrasé par une reconstruction depuis `spec.panelTextPayload` (souvent
 * dérivée du même texte mais sans les champs du contrat studio).
 */
export function resolveStoryboardTextContractForPersistence(
  panel: StoryboardPanelLikeForTextContract,
  options: {
    specPanelTextPayload?: SpecPanelTextPayloadLike | null;
    panelTextBundleOverride?: StoryboardPanelLikeForTextContract["panelTextBundle"];
  } = {},
): PanelTextContract {
  if (isPersistedPanelTextContract(panel.textContract)) {
    return resolvePanelTextContractFromStoryboardPanelLike(panel);
  }
  const p = options.specPanelTextPayload;
  if (p != null) {
    const bundle = options.panelTextBundleOverride ?? panel.panelTextBundle ?? null;
    return buildPanelTextContractFromFragments({
      panelId: panel.panelId,
      dialogueLines: p.dialogue?.length ? [...p.dialogue] : null,
      narration: p.narration ?? null,
      sfx: p.sfx ? [...p.sfx] : null,
      panelTextBundle: bundle,
    });
  }
  return resolvePanelTextContractFromStoryboardPanelLike(panel);
}
