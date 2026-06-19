/**
 * P1.5 — Normalisation stricte des noms de lieu pour tout matching côté
 * pipeline : on retire les diacritiques (NFD), on passe en minuscules, on
 * trim, et on compresse les espaces multiples. Objectif : que "École Tōkai",
 * "ecole tokai" et "ÉCOLE  tokai" matchent strictement.
 *
 * À utiliser partout où l'on compare des noms de lieu (knownLocations lookup,
 * continuity checks, Scene → Location attribution, etc.).
 */

export function normalizeLocationName(input: string | null | undefined): string {
  if (!input || typeof input !== "string") return "";
  return input
    .normalize("NFD")
    // eslint-disable-next-line no-misleading-character-class
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function locationNamesEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeLocationName(a);
  const nb = normalizeLocationName(b);
  return na.length > 0 && na === nb;
}
