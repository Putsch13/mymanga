/**
 * Sprint 1 — Reader refacto
 *
 * Source de vérité unique pour les formats de projet supportés.
 *
 * Produit : on ne supporte officiellement que `manga` et `webtoon`. Avant
 * ce sprint, `FORMAT_PRESETS` côté UI proposait aussi "roman graphique" mais
 * aucun chemin reader/pipeline dédié n'existait — ça tombait en manga par
 * défaut.
 *
 * DB : `Project.format` reste `String?` en Prisma (pas d'enum au niveau
 * schéma, pour ne pas casser les projets existants). Ce module définit la
 * whitelist côté app + un helper de normalisation qui ramène toute valeur
 * inconnue vers `"manga"` (fallback sûr).
 */

export const SUPPORTED_PROJECT_FORMATS = ["manga", "webtoon"] as const;

export type SupportedProjectFormat = (typeof SUPPORTED_PROJECT_FORMATS)[number];

/**
 * Normalise une valeur de format DB vers un format supporté. Toute valeur
 * non reconnue (`null`, `"roman graphique"`, valeur libre) retombe sur
 * `"manga"` — le mode de lecture par défaut.
 */
export function normalizeProjectFormat(
  raw: string | null | undefined,
): SupportedProjectFormat {
  if (raw === "webtoon") return "webtoon";
  return "manga";
}

/**
 * Type guard : est-ce que la valeur raw est un format supporté explicitement ?
 */
export function isSupportedProjectFormat(
  raw: string | null | undefined,
): raw is SupportedProjectFormat {
  return raw === "manga" || raw === "webtoon";
}
