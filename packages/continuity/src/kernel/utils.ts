/**
 * Continuity — helpers utilitaires partagés.
 *
 * Extrait de continuity-persistence-kernel.ts. Pure : aucune dépendance externe
 * (hors types). Utilisé transversalement par les builders, validators, et
 * ledger appliers du module continuity.
 */

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function uniq(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter(Boolean) as string[])];
}

export function textHasAny(text: string, needles: string[]): boolean {
  const normalized = text.toLowerCase();
  return needles.some((needle) => normalized.includes(needle.toLowerCase()));
}

export function normalizeCharacterName(value: string): string {
  return value.trim().toLowerCase();
}

// BUG-18 : détecteur de violation structurelle tolérant à la négation.
// Les structuralProhibitions sont rédigées comme des noms/concepts ("magie",
// "résurrection"…). Un simple includes() trigger des faux positifs dès que
// la prose MENTIONNE le concept sans le VIOLER ("sans magie", "pas de
// résurrection ici"). On considère la prohibition comme violée uniquement
// si au moins une occurrence n'est pas précédée d'une négation proche.
const NEGATION_PATTERN =
  /\b(pas de|pas d'|sans|aucun[e]?s?|ni|jamais|interdit[e]?s?|no|without|never|forbidden|banned)\b/;

export function prohibitionIsViolated(text: string, rule: string): boolean {
  const normalized = text.toLowerCase();
  const needle = rule.toLowerCase().trim();
  if (!needle) return false;
  let searchFrom = 0;
  while (searchFrom < normalized.length) {
    const idx = normalized.indexOf(needle, searchFrom);
    if (idx < 0) return false;
    const windowStart = Math.max(0, idx - 40);
    const context = normalized.slice(windowStart, idx);
    if (!NEGATION_PATTERN.test(context)) {
      return true;
    }
    searchFrom = idx + needle.length;
  }
  return false;
}
