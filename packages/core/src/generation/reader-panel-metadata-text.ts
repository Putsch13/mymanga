/**
 * Texte panel pour le reader / grille pipeline : même heuristique que
 * `build-reader-pages` et `manga-page-grid` (évite la divergence).
 */

import {
  buildPanelTextContractFromFragments,
  type DialogueLineFragment,
  type PanelTextContract,
} from "./panel-text-contract";

export function isPersistedPanelTextContract(value: unknown): value is PanelTextContract {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.panelId === "string"
    && typeof o.hasText === "boolean"
    && Array.isArray(o.dialogues)
    && o.placement !== null
    && typeof o.placement === "object"
    && !Array.isArray(o.placement)
  );
}

/** Lignes dialogue brutes depuis `metadata.dialogue` / `metadata.dialogues`. */
export function primaryDialogueLineRowsFromLooseMetadata(
  meta: Record<string, unknown>,
): Array<{ speaker?: string; text?: string }> | null {
  const normalizeRow = (item: unknown): { speaker?: string; text: string } | null => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const rec = item as Record<string, unknown>;
    const text = String(rec.text ?? "").trim();
    if (!text) return null;
    const speakerRaw = String(rec.speaker ?? rec.speakerName ?? "").trim();
    return speakerRaw ? { speaker: speakerRaw, text } : { text };
  };

  const multi = meta.dialogues;
  if (Array.isArray(multi) && multi.length > 0) {
    const rows = multi.map(normalizeRow).filter((r): r is { speaker?: string; text: string } => r !== null);
    return rows.length > 0 ? rows : null;
  }

  const single = meta.dialogue;
  if (single && typeof single === "object" && !Array.isArray(single)) {
    const one = normalizeRow(single);
    return one ? [one] : null;
  }

  if (typeof single === "string" && single.trim()) {
    return [{ speaker: "Unknown", text: single.trim() }];
  }

  return null;
}

function dialogueFragmentsHaveLineText(rows: readonly DialogueLineFragment[] | null | undefined): boolean {
  if (!rows?.length) return false;
  for (const d of rows) {
    if ("line" in d && typeof (d as { line?: string }).line === "string" && (d as { line: string }).line.trim()) {
      return true;
    }
    if ("text" in d && String((d as { text?: string }).text ?? "").trim()) return true;
  }
  return false;
}

export function metadataSfxToStringArray(sfx: unknown): string[] | null {
  if (Array.isArray(sfx)) {
    const a = (sfx as unknown[]).map((x) => String(x).trim()).filter(Boolean);
    return a.length > 0 ? a : null;
  }
  if (typeof sfx === "string" && sfx.trim()) return [sfx.trim()];
  return null;
}

/**
 * `PanelTextContract` depuis les métadonnées panel : si `textContract` est un
 * contrat persisté valide, il est retourné tel quel ; sinon construction depuis
 * les champs lâches (`dialogue` / `dialogues`, narration, sfx, etc.).
 */
export function synthesizePanelTextContractFromLooseMetadata(
  meta: Record<string, unknown>,
  panelIdFallback: string,
): PanelTextContract {
  const embedded = meta.textContract;
  if (isPersistedPanelTextContract(embedded)) {
    return embedded as PanelTextContract;
  }
  const fromDialogueLines =
    Array.isArray(meta.dialogueLines) && meta.dialogueLines.length > 0
      ? (meta.dialogueLines as readonly DialogueLineFragment[])
      : null;
  const primaryLines = fromDialogueLines ?? primaryDialogueLineRowsFromLooseMetadata(meta);
  return buildPanelTextContractFromFragments({
    panelId: String(meta.panelId ?? panelIdFallback),
    dialogueLines: dialogueFragmentsHaveLineText(primaryLines) ? primaryLines : null,
    narration: typeof meta.narration === "string" ? meta.narration : null,
    sfx: metadataSfxToStringArray(meta.sfx),
    panelTextBundle:
      typeof meta.panelTextBundle === "object" && meta.panelTextBundle !== null
        ? (meta.panelTextBundle as never)
        : null,
  });
}

const LEGACY_PANEL_TEXT_KEYS = ["dialogue", "dialogues", "dialogueLines", "narration", "sfx"] as const;

/**
 * Quand `textContract` est un contrat persisté valide, supprime les champs texte
 * legacy au premier niveau (`dialogue` / `dialogues` / `narration` / `sfx`) pour
 * éviter deux sources divergentes (PR9). Sinon renvoie `meta` inchangé.
 */
export function stripLegacyPanelTextFieldsWhenContractPresent(
  meta: Record<string, unknown>,
): Record<string, unknown> {
  if (!isPersistedPanelTextContract(meta.textContract)) {
    return meta;
  }
  const out = { ...meta };
  for (const k of LEGACY_PANEL_TEXT_KEYS) {
    delete out[k];
  }
  return out;
}
