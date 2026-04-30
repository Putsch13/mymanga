/**
 * PR5 — Adapters entre fragments legacy / script CTO et `PanelTextContract` (generation).
 */

import type { PanelTextContract, PanelDialogueEntry, PanelSfxEntry } from "../generation/panel-text-contract";
import {
  buildPanelTextContractFromFragments,
  createSilentTextContract,
} from "../generation/panel-text-contract";
import {
  isPersistedPanelTextContract,
  synthesizePanelTextContractFromLooseMetadata,
} from "../generation/reader-panel-metadata-text";
import type { ScriptCaptionLine, ScriptDialogueLine, ScriptNarrationLine, ScriptPanelTextContract, ScriptSfxLine } from "./panel-text-contract";

let scriptLineIdSeq = 0;
function nextScriptId(prefix: string): string {
  scriptLineIdSeq += 1;
  return `${prefix}_${scriptLineIdSeq}`;
}

/** Mappe le contrat script PR5 → `PanelTextContract` (generation). */
export function scriptPanelTextContractToGenerationContract(
  panelId: string,
  script: ScriptPanelTextContract,
): PanelTextContract {
  const dialogueLines: ScriptDialogueLine[] = script.dialogueLines.map((d) => ({
    ...d,
    id: d.id || nextScriptId("dlg"),
  }));
  const narrationJoined =
    script.narration.length > 0
      ? script.narration.map((n) => n.text.trim()).filter(Boolean).join("\n")
      : null;
  const sfxStrings = [...script.sfx.map((s) => s.text), ...script.captions.map((c) => c.text)].filter(
    (t) => t.trim().length > 0,
  );
  return buildPanelTextContractFromFragments({
    panelId,
    dialogueLines: dialogueLines.map((d) => ({
      line: d.text,
      speakerLabel: d.speakerName ?? null,
      characterId: d.characterId ?? null,
    })),
    narration: narrationJoined,
    sfx: sfxStrings,
  });
}

/** Extrait une vue script depuis un `PanelTextContract` generation. */
export function generationContractToScriptPanelText(contract: PanelTextContract): ScriptPanelTextContract {
  const dialogueLines: ScriptDialogueLine[] = contract.dialogues.map((d: PanelDialogueEntry, i) => ({
    id: `dlg_${contract.panelId}_${i}`,
    characterId: d.speakerId ?? d.anchorCharacterId,
    speakerName: d.speakerName,
    text: d.text,
    emotion: d.emotion,
    balloonType:
      d.bubbleStyle === "speech"
        ? "normal"
        : d.bubbleStyle === "thought"
          ? "thought"
          : d.bubbleStyle === "shout"
            ? "shout"
            : d.bubbleStyle === "whisper"
              ? "whisper"
              : undefined,
  }));
  const narration: ScriptNarrationLine[] =
    contract.narration?.trim()
      ? [{ id: `nar_${contract.panelId}`, text: contract.narration.trim() }]
      : [];
  const sfx: ScriptSfxLine[] = (contract.sfx as PanelSfxEntry[]).map((s, i) => ({
    id: `sfx_${contract.panelId}_${i}`,
    text: s.text,
    intensity: s.kind === "impact" ? "high" : s.kind === "emotion" ? "medium" : "low",
  }));
  const captions: ScriptCaptionLine[] = [];
  return { dialogueLines, narration, sfx, captions };
}

/**
 * Accepte un payload legacy épars et retourne le **`PanelTextContract` generation**
 * (source unique persistée PR9). Délègue à la synthèse métadonnées si besoin.
 */
export function legacyDialogueToPanelTextContract(input: unknown): PanelTextContract {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return createSilentTextContract("panel", "silent_panel");
  }
  if (isPersistedPanelTextContract(input)) {
    return input;
  }
  const rec = input as Record<string, unknown>;
  const embedded = rec.textContract;
  if (isPersistedPanelTextContract(embedded)) {
    return embedded;
  }
  const panelId = typeof rec.panelId === "string" && rec.panelId.trim() ? rec.panelId.trim() : "panel";
  return synthesizePanelTextContractFromLooseMetadata(rec, panelId);
}

/** Alias PR5 — réexport de `textContractToLegacyDialogue`. */
export { textContractToLegacyDialogue as panelTextContractToLegacyDialogue } from "../generation/panel-text-contract";
