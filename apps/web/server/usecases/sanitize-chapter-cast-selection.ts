/**
 * P2.1 — Usecase : convertit les libellés saisis (noms / displayName) en IDs
 * personnages catalogue stables, retire les noms non résolus, propose des
 * suggestions UX. À utiliser par toute route qui persiste un cast studio.
 */

import type {
  ChapterCharacterSelection,
  CharacterRefForResolution,
} from "@manga-ai-studio/core";
import {
  buildUnresolvedCharacterLabelsPayload,
  sanitizeChapterCharacterSelectionIds,
  type CharacterLabelSuggestion,
} from "@/lib/characters/resolve-character-labels";
import type { Usecase } from "./types";

export type SanitizeChapterCastSelectionInput = {
  selection: ChapterCharacterSelection;
  projectCharacters: readonly CharacterRefForResolution[];
  /** Libellés bruts supplémentaires (ex: hints wizard) à valider. */
  extraLabels?: readonly string[];
};

export type SanitizeChapterCastSelectionOutput = {
  selection: ChapterCharacterSelection;
  strippedLabels: string[];
  unresolvedLabels: string[];
  suggestions: CharacterLabelSuggestion[];
  /** `true` si tous les libellés ont été résolus en IDs catalogue. */
  fullyResolved: boolean;
};

export const sanitizeChapterCastSelectionUsecase: Usecase<
  SanitizeChapterCastSelectionInput,
  SanitizeChapterCastSelectionOutput
> = {
  name: "sanitizeChapterCastSelection",
  async execute(input) {
    const sanitized = sanitizeChapterCharacterSelectionIds(input.selection, input.projectCharacters);
    const allUnresolved = [
      ...sanitized.strippedLabels,
      ...(input.extraLabels?.filter((l): l is string => typeof l === "string" && l.trim().length > 0) ?? []),
    ];
    const labelSuggestions = buildUnresolvedCharacterLabelsPayload(
      allUnresolved,
      input.projectCharacters,
    );

    return {
      selection: sanitized.selection,
      strippedLabels: sanitized.strippedLabels,
      unresolvedLabels: labelSuggestions.unresolvedLabels,
      suggestions: labelSuggestions.suggestions,
      fullyResolved: labelSuggestions.unresolvedLabels.length === 0,
    };
  },
};
