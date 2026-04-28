/**
 * Utilitaires purs partagés par les modules `chapter/*` sans importer
 * `chapter-pipeline` (évite les cycles d’import).
 */

/** Normalise une chaîne pour comparaison / signatures (sans NFKD). */
export function normalizeChapterTextToken(value: string | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
