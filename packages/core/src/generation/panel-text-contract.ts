/**
 * PanelTextContract — Source de vérité unique pour le texte d'une case.
 *
 * Ce contrat unifie tous les champs dialogue/narration/SFX qui étaient
 * dispersés dans panel.dialogue, bp.dialogueLines, panelTextBundle, etc.
 *
 * Une seule source de vérité pour:
 *   - Les dialogues (avec speaker, émotion, ancrage personnage)
 *   - La narration
 *   - Les SFX
 *   - Le placement texte
 *
 * Règles fortes:
 *   - Si hasText = true, il DOIT y avoir du contenu (dialogue/narration/sfx)
 *   - Si reserveTextArea = true et hasText = false → erreur
 *   - Si narrativeRole = "dialogue" et hasText = false → erreur
 *   - Aucune bulle vide ne doit être rendue
 */

export type SfxKind = "impact" | "ambient" | "motion" | "emotion";

export type PanelTextOverflowStrategy =
  | "bubble_stack"
  | "caption_strip"
  | "margin_note";

export type SilenceReason = "silent_panel" | "visual_only" | "transition" | null;

export interface PanelDialogueEntry {
  speakerId?: string;
  speakerName: string;
  text: string;
  emotion?: string;
  anchorCharacterId?: string;
  bubbleStyle?: "speech" | "thought" | "shout" | "whisper";
}

export interface PanelSfxEntry {
  text: string;
  kind: SfxKind;
}

export interface PanelTextPlacement {
  reserveTextArea: boolean;
  preferredAnchorZones: string[];
  avoidFaces: boolean;
  overflowStrategy: PanelTextOverflowStrategy;
}

export interface PanelTextContract {
  panelId: string;
  hasText: boolean;

  dialogues: PanelDialogueEntry[];

  narration?: string | null;

  sfx: PanelSfxEntry[];

  placement: PanelTextPlacement;

  silenceReason?: SilenceReason;
}

export function createEmptyTextContract(panelId: string): PanelTextContract {
  return {
    panelId,
    hasText: false,
    dialogues: [],
    narration: null,
    sfx: [],
    placement: {
      reserveTextArea: false,
      preferredAnchorZones: [],
      avoidFaces: true,
      overflowStrategy: "bubble_stack",
    },
    silenceReason: "silent_panel",
  };
}

export function createSilentTextContract(panelId: string, reason: SilenceReason): PanelTextContract {
  return {
    panelId,
    hasText: false,
    dialogues: [],
    narration: null,
    sfx: [],
    placement: {
      reserveTextArea: false,
      preferredAnchorZones: [],
      avoidFaces: true,
      overflowStrategy: "bubble_stack",
    },
    silenceReason: reason,
  };
}

export function createDialogueTextContract(
  panelId: string,
  dialogues: PanelDialogueEntry[],
  options?: {
    narration?: string | null;
    sfx?: PanelSfxEntry[];
    preferredAnchorZones?: string[];
  }
): PanelTextContract {
  const hasDialogues = dialogues.length > 0 && dialogues.some(d => d.text.trim().length > 0);
  const hasNarration = !!options?.narration?.trim();
  const hasSfx = (options?.sfx?.length ?? 0) > 0;

  return {
    panelId,
    hasText: hasDialogues || hasNarration || hasSfx,
    dialogues: dialogues.filter(d => d.text.trim().length > 0),
    narration: options?.narration ?? null,
    sfx: options?.sfx ?? [],
    placement: {
      reserveTextArea: hasDialogues || hasNarration || hasSfx,
      preferredAnchorZones: options?.preferredAnchorZones ?? [],
      avoidFaces: true,
      overflowStrategy: "bubble_stack",
    },
    silenceReason: null,
  };
}

export interface TextContractValidationResult {
  valid: boolean;
  issues: string[];
  warnings: string[];
}

export function validatePanelTextContract(
  contract: PanelTextContract,
  narrativeRole?: string
): TextContractValidationResult {
  const issues: string[] = [];
  const warnings: string[] = [];

  const hasDialogues = contract.dialogues.length > 0 && 
    contract.dialogues.some(d => d.text.trim().length > 0);
  const hasNarration = !!contract.narration?.trim();
  const hasSfx = contract.sfx.length > 0;
  const actualHasText = hasDialogues || hasNarration || hasSfx;

  if (contract.hasText && !actualHasText) {
    issues.push(`text_contract_has_text_but_empty:${contract.panelId}`);
  }

  if (!contract.hasText && actualHasText) {
    warnings.push(`text_contract_has_content_but_marked_empty:${contract.panelId}`);
  }

  if (contract.placement.reserveTextArea && !contract.hasText) {
    issues.push(`text_area_reserved_without_text:${contract.panelId}`);
  }

  if (narrativeRole === "dialogue" && !contract.hasText) {
    issues.push(`dialogue_panel_without_dialogue:${contract.panelId}`);
  }

  if (contract.hasText && !contract.placement.reserveTextArea) {
    issues.push(`text_without_reserved_area:${contract.panelId}`);
  }

  for (const dialogue of contract.dialogues) {
    if (!dialogue.text.trim()) {
      issues.push(`empty_dialogue_text:${contract.panelId}`);
    }
    if (!dialogue.speakerName?.trim()) {
      warnings.push(`dialogue_without_speaker_name:${contract.panelId}`);
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    warnings,
  };
}

export function assertValidPanelTextContract(
  contract: PanelTextContract,
  narrativeRole?: string
): void {
  const { valid, issues } = validatePanelTextContract(contract, narrativeRole);
  if (!valid) {
    throw new Error(`invalid_panel_text_contract:${issues.join(",")}`);
  }
}

export function mergeTextContracts(
  existing: PanelTextContract,
  update: Partial<PanelTextContract>
): PanelTextContract {
  const merged: PanelTextContract = {
    ...existing,
    ...update,
    dialogues: update.dialogues ?? existing.dialogues,
    sfx: update.sfx ?? existing.sfx,
    placement: {
      ...existing.placement,
      ...update.placement,
    },
  };

  const hasDialogues = merged.dialogues.length > 0 && 
    merged.dialogues.some(d => d.text.trim().length > 0);
  const hasNarration = !!merged.narration?.trim();
  const hasSfx = merged.sfx.length > 0;

  merged.hasText = hasDialogues || hasNarration || hasSfx;
  merged.placement.reserveTextArea = merged.hasText;

  return merged;
}

export function textContractToLegacyDialogue(contract: PanelTextContract): Array<{ speaker: string; text: string }> {
  return contract.dialogues.map(d => ({
    speaker: d.speakerName,
    text: d.text,
  }));
}

export function legacyDialogueToTextContract(
  panelId: string,
  dialogue: Array<{ speaker: string; text: string }> | string | null | undefined,
  narration?: string | null
): PanelTextContract {
  if (!dialogue && !narration) {
    return createSilentTextContract(panelId, "silent_panel");
  }

  const dialogues: PanelDialogueEntry[] = [];

  if (typeof dialogue === "string" && dialogue.trim()) {
    dialogues.push({
      speakerName: "Unknown",
      text: dialogue,
    });
  } else if (Array.isArray(dialogue)) {
    for (const d of dialogue) {
      if (d.text?.trim()) {
        dialogues.push({
          speakerName: d.speaker || "Unknown",
          text: d.text,
        });
      }
    }
  }

  return createDialogueTextContract(panelId, dialogues, { narration });
}

/** Ligne issue du writer premium (`line`) ou du blueprint / bundle (`speaker` + `text`). */
export type DialogueLineFragment =
  | { line: string; speakerLabel?: string | null; characterId?: string | null }
  | { speaker: string; text: string }
  /** Données legacy / DB où `speaker` peut être absent. */
  | { speaker?: string; text?: string };

function normalizeDialogueFragmentRows(
  rows: readonly DialogueLineFragment[] | null | undefined,
): Array<{ line: string; speakerLabel: string | null; characterId: string | null }> {
  if (!rows?.length) return [];
  const out: Array<{ line: string; speakerLabel: string | null; characterId: string | null }> = [];
  for (const d of rows) {
    if ("line" in d && typeof d.line === "string") {
      const line = d.line.trim();
      if (!line) continue;
      out.push({
        line,
        speakerLabel: d.speakerLabel?.trim() ? d.speakerLabel.trim() : null,
        characterId: d.characterId?.trim() ? d.characterId.trim() : null,
      });
      continue;
    }
    if ("text" in d) {
      const text = String((d as { text?: string }).text ?? "").trim();
      if (!text) continue;
      const speaker = String((d as { speaker?: string }).speaker ?? "").trim();
      out.push({ line: text, speakerLabel: speaker || null, characterId: null });
    }
  }
  return out;
}

/**
 * Normalise les fragments épars (blueprint / panel legacy / `panelTextBundle`) vers un `PanelTextContract`.
 *
 * Priorité dialogue : `dialogueLines` → sinon `panelTextBundle.dialogues` → sinon `dialogue[]` / string.
 * Narration / SFX : fusion de tous les champs fournis (blueprint + bundle).
 */
export function buildPanelTextContractFromFragments(input: {
  panelId?: string | null;
  dialogueLines?: readonly DialogueLineFragment[] | null;
  panelTextBundle?: Readonly<{
    dialogues?: ReadonlyArray<{ speaker: string; text: string }> | null;
    narration?: string | null;
    sfx?: readonly string[] | null;
  }> | null;
  dialogue?: readonly string[] | string | null;
  narration?: string | null;
  narrationLines?: readonly string[] | null;
  sfx?: readonly string[] | null;
}): PanelTextContract {
  const pid = (input.panelId && String(input.panelId).trim()) || "panel";
  const structuredPrimary = normalizeDialogueFragmentRows(input.dialogueLines);
  const structuredBundle = normalizeDialogueFragmentRows(input.panelTextBundle?.dialogues ?? null);
  const structured = structuredPrimary.length > 0 ? structuredPrimary : structuredBundle;
  if (structured.length > 0) {
    const dialogues: PanelDialogueEntry[] = structured.map((d) => ({
      speakerId: d.characterId ?? undefined,
      speakerName: (d.speakerLabel?.trim() || d.characterId || "Speaker").toString(),
      text: d.line.trim(),
    }));
    const narrationParts = [
      ...(typeof input.narration === "string" && input.narration.trim() ? [input.narration.trim()] : []),
      ...((input.narrationLines ?? []).map((t) => String(t).trim()).filter(Boolean)),
      ...(typeof input.panelTextBundle?.narration === "string" && input.panelTextBundle.narration.trim()
        ? [input.panelTextBundle.narration.trim()]
        : []),
    ];
    const narrationJoined = narrationParts.length > 0 ? narrationParts.join("\n") : null;
    const sfxRaw = [...(input.sfx ?? []), ...(input.panelTextBundle?.sfx ?? [])];
    const sfx: PanelSfxEntry[] = sfxRaw
      .map((t) => String(t).trim())
      .filter(Boolean)
      .map((text) => ({ text, kind: "ambient" as SfxKind }));
    return createDialogueTextContract(pid, dialogues, { narration: narrationJoined, sfx });
  }
  const narrationJoined = [
    ...(typeof input.narration === "string" && input.narration.trim() ? [input.narration.trim()] : []),
    ...((input.narrationLines ?? []).map((t) => String(t).trim()).filter(Boolean)),
    ...(typeof input.panelTextBundle?.narration === "string" && input.panelTextBundle.narration.trim()
      ? [input.panelTextBundle.narration.trim()]
      : []),
  ].join("\n") || null;

  const mergedSfx: PanelSfxEntry[] = [...(input.sfx ?? []), ...(input.panelTextBundle?.sfx ?? [])]
    .map((t) => String(t).trim())
    .filter(Boolean)
    .map((text) => ({ text, kind: "ambient" as SfxKind }));

  const rawLines: string[] = [];
  if (Array.isArray(input.dialogue)) {
    for (const line of input.dialogue) {
      const t = String(line).trim();
      if (t) rawLines.push(t);
    }
  } else if (typeof input.dialogue === "string" && input.dialogue.trim()) {
    rawLines.push(input.dialogue.trim());
  }

  if (rawLines.length === 0) {
    if (mergedSfx.length > 0 || narrationJoined?.trim()) {
      return createDialogueTextContract(pid, [], { narration: narrationJoined, sfx: mergedSfx });
    }
    return legacyDialogueToTextContract(pid, null, narrationJoined);
  }
  if (rawLines.length === 1) {
    return createDialogueTextContract(
      pid,
      [{ speakerName: "Unknown", text: rawLines[0]! }],
      { narration: narrationJoined, sfx: mergedSfx },
    );
  }
  const dialoguesFlat: PanelDialogueEntry[] = rawLines.map((text) => ({
    speakerName: "Character",
    text,
  }));
  return createDialogueTextContract(pid, dialoguesFlat, { narration: narrationJoined, sfx: mergedSfx });
}

/** Champs texte blueprint alignés sur `PanelBlueprintPremium` (sans importer narrative-facts). */
export type BlueprintTextFieldsLike = {
  panelId: string;
  dialogueLines?: ReadonlyArray<{ speaker?: string; text: string }> | null | undefined;
  narrationText?: string | null;
  sfxCues?: readonly string[] | null | undefined;
  panelTextBundle?: Readonly<{
    dialogues?: ReadonlyArray<{ speaker: string; text: string }> | null;
    narration?: string | null;
    sfx?: readonly string[] | null;
  }> | null;
};

/**
 * PR9 — Construit un `PanelTextContract` à partir des champs blueprint (source unique après merge).
 */
export function buildPanelTextContractFromBlueprintTextFields(
  fields: BlueprintTextFieldsLike,
): PanelTextContract {
  return buildPanelTextContractFromFragments({
    panelId: fields.panelId,
    dialogueLines: fields.dialogueLines ?? null,
    narration: fields.narrationText ?? null,
    sfx: fields.sfxCues ? [...fields.sfxCues] : null,
    panelTextBundle: fields.panelTextBundle ?? null,
  });
}
