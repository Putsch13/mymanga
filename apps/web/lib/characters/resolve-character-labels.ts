/**
 * P0.3 — Résolution des libellés / noms affichés vers des IDs personnages projet.
 * Les listes studio (`activeCharacterIds`, etc.) ne doivent contenir que des IDs stables.
 */

import type { ChapterCharacterSelection, CharacterRefForResolution } from "@manga-ai-studio/core";
import { resolveCharacterRefsToIds } from "@manga-ai-studio/core";

export type ProjectCharacterForLabelResolution = CharacterRefForResolution;

export type ResolveCharacterLabelsInput = {
  labels: readonly string[];
  projectCharacters: readonly ProjectCharacterForLabelResolution[];
};

export type CharacterLabelSuggestion = {
  label: string;
  possibleCharacterIds: string[];
};

function norm(s: string): string {
  return s.trim().toLowerCase();
}

function suggestionsForLabel(
  label: string,
  characters: readonly ProjectCharacterForLabelResolution[],
): string[] {
  const nk = norm(label);
  if (nk.length < 1) return [];

  const out: string[] = [];
  for (const c of characters) {
    const n = typeof c.name === "string" ? norm(c.name) : "";
    const d = typeof c.displayName === "string" ? norm(c.displayName) : "";
    if (!n && !d) continue;
    if (
      nk === n ||
      nk === d ||
      n.includes(nk) ||
      nk.includes(n) ||
      (d && (d.includes(nk) || nk.includes(d)))
    ) {
      out.push(c.id);
    }
    if (out.length >= 8) break;
  }
  return [...new Set(out)];
}

/**
 * Résout une liste de libellés (noms, displayName) ou d’IDs déjà valides vers des IDs catalogue.
 */
export function resolveCharacterLabelsToIds(input: ResolveCharacterLabelsInput): {
  resolvedIds: string[];
  unresolvedLabels: string[];
  suggestions: CharacterLabelSuggestion[];
} {
  const labels = input.labels
    .filter((l): l is string => typeof l === "string" && l.trim().length > 0)
    .map((l) => l.trim());
  const r = resolveCharacterRefsToIds(labels, [...input.projectCharacters]);
  const suggestions = r.unresolved.map((label) => ({
    label,
    possibleCharacterIds: suggestionsForLabel(label, input.projectCharacters),
  }));
  return {
    resolvedIds: r.ids,
    unresolvedLabels: r.unresolved,
    suggestions,
  };
}

/**
 * Mappe chaque entrée (ID ou nom) vers un ID ; conserve l’ordre, déduplique les IDs consécutifs identiques.
 */
export function mapCharacterLabelsToIdsSequential(
  entries: readonly string[],
  projectCharacters: readonly ProjectCharacterForLabelResolution[],
): { sanitizedIds: string[]; unresolvedLabels: string[]; suggestions: CharacterLabelSuggestion[] } {
  const sanitizedIds: string[] = [];
  const unresolvedLabels: string[] = [];
  for (const raw of entries) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    const r = resolveCharacterRefsToIds([raw.trim()], [...projectCharacters]);
    if (r.ids.length > 0) {
      sanitizedIds.push(r.ids[0]!);
    } else {
      unresolvedLabels.push(raw.trim());
    }
  }
  const uniqueUnresolved = [...new Set(unresolvedLabels)];
  const suggestions = uniqueUnresolved.map((label) => ({
    label,
    possibleCharacterIds: suggestionsForLabel(label, projectCharacters),
  }));
  return {
    sanitizedIds: [...new Set(sanitizedIds)],
    unresolvedLabels: uniqueUnresolved,
    suggestions,
  };
}

/**
 * Agrège les libellés non résolus et regénère les suggestions (une entrée par libellé unique).
 */
export function buildUnresolvedCharacterLabelsPayload(
  unresolvedLabels: readonly string[],
  projectCharacters: readonly ProjectCharacterForLabelResolution[],
): { unresolvedLabels: string[]; suggestions: CharacterLabelSuggestion[] } {
  const unique = [...new Set(unresolvedLabels.map((x) => x.trim()).filter(Boolean))];
  return resolveCharacterLabelsToIds({ labels: unique, projectCharacters });
}

/**
 * P0.3 — À la sauvegarde studio : ne persiste que des IDs catalogue dans le cast.
 * Les libellés non résolus sont retirés des listes (log côté route si besoin).
 */
export function sanitizeChapterCharacterSelectionIds(
  selection: ChapterCharacterSelection,
  projectCharacters: readonly ProjectCharacterForLabelResolution[],
): { selection: ChapterCharacterSelection; strippedLabels: string[] } {
  const stripped: string[] = [];
  const refs = [...projectCharacters];

  const resolveOne = (v: string | null | undefined): string | null | undefined => {
    if (typeof v !== "string" || !v.trim()) return v === null ? null : undefined;
    const r = resolveCharacterRefsToIds([v.trim()], refs);
    if (r.unresolved.length > 0) {
      stripped.push(...r.unresolved);
      return null;
    }
    return r.ids[0] ?? null;
  };

  const mergeArr = (arr: string[] | undefined | null): string[] => {
    const m = mapCharacterLabelsToIdsSequential(arr ?? [], refs);
    stripped.push(...m.unresolvedLabels);
    return m.sanitizedIds;
  };

  return {
    selection: {
      ...selection,
      heroCharacterId: resolveOne(selection.heroCharacterId) ?? null,
      secondaryHeroCharacterId: resolveOne(selection.secondaryHeroCharacterId) ?? null,
      deuteragonistCharacterId: resolveOne(selection.deuteragonistCharacterId) ?? null,
      coreCastCharacterIds: mergeArr(selection.coreCastCharacterIds),
      activeCharacterIds: mergeArr(selection.activeCharacterIds),
      lockedCharacterIds: mergeArr(selection.lockedCharacterIds),
      speakingCharacterIds: mergeArr(selection.speakingCharacterIds),
      evolvingCharacterIds: mergeArr(selection.evolvingCharacterIds),
      antagonistCharacterIds: mergeArr(selection.antagonistCharacterIds),
      recurringNpcIds: mergeArr(selection.recurringNpcIds),
    },
    strippedLabels: [...new Set(stripped)],
  };
}
