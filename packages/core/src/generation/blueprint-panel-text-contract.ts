/**
 * PR9 — Blueprint premium : résolution du `PanelTextContract` et lignes dialogue
 * legacy à partir de `textContract` persisté ou des fragments (`dialogueLines`, etc.).
 */

import type { PanelBlueprintPremium } from "../types/narrative-facts";
import {
  buildPanelTextContractFromBlueprintTextFields,
  syncAllTextViewsFromPanelTextContract,
  textContractToLegacyDialogue,
  validatePanelTextContract,
  type PanelTextContract,
} from "./panel-text-contract";
import { isPersistedPanelTextContract } from "./reader-panel-metadata-text";

export type BlueprintTextSourcePick = Pick<
  PanelBlueprintPremium,
  "panelId" | "dialogueLines" | "textContract" | "panelTextBundle" | "narrationText" | "sfxCues"
>;

export function resolvePanelTextContractFromBlueprintPremium(bp: BlueprintTextSourcePick): PanelTextContract {
  const embedded = bp.textContract;
  if (isPersistedPanelTextContract(embedded)) {
    const base = embedded as PanelTextContract;
    const normalized: PanelTextContract = {
      ...base,
      panelId: bp.panelId,
      sfx: Array.isArray(base.sfx) ? base.sfx : [],
    };
    if (validatePanelTextContract(normalized).valid) {
      return normalized;
    }
  }
  return buildPanelTextContractFromBlueprintTextFields(bp);
}

export function legacyDialogueLinesFromBlueprintPremium(
  bp: BlueprintTextSourcePick,
): Array<{ speaker: string; text: string }> {
  return textContractToLegacyDialogue(resolvePanelTextContractFromBlueprintPremium(bp));
}

export function blueprintPrimaryDialogueLineCount(bp: BlueprintTextSourcePick): number {
  return legacyDialogueLinesFromBlueprintPremium(bp).filter((l) => String(l.text ?? "").trim().length > 0).length;
}

/**
 * P0.16 — À la persistance studio : une seule source de vérité texte ; propage vers dialogueLines,
 * panelTextBundle, narrationText, sfxCues.
 */
export function normalizePremiumBlueprintTextViews(bp: PanelBlueprintPremium): PanelBlueprintPremium {
  const contract = resolvePanelTextContractFromBlueprintPremium(bp);
  return syncAllTextViewsFromPanelTextContract(bp, contract) as PanelBlueprintPremium;
}

/** Recalcule `textContract` après mutation des champs texte fragment (PR9). */
export function syncBlueprintTextContractFromTextFragments(bp: PanelBlueprintPremium): void {
  bp.textContract = buildPanelTextContractFromBlueprintTextFields(bp);
}
