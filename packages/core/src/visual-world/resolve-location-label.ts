/**
 * FIX-17 (MAJEUR) — Helper unifié pour résoudre le nom d'une VisualWorld
 * location.
 *
 * Le schema définit `label` comme champ canonique, mais beaucoup de
 * consumers historiques cherchent encore `canonicalName` ou `name`. On
 * centralise ici la logique de fallback pour éviter qu'un changement de
 * convention silencieux casse la QA d'intention (qui croit alors qu'aucun
 * lieu VW n'existe).
 *
 * Long terme : standardiser sur `label` partout et supprimer cette
 * tolérance — pour l'instant on stabilise la lecture.
 */

export interface VisualWorldLocationLabelLike {
  id?: string;
  label?: string | null;
  canonicalName?: string | null;
  name?: string | null;
}

export function resolveVisualWorldLocationLabel(
  loc: VisualWorldLocationLabelLike | null | undefined,
): string {
  if (!loc) return "";
  return loc.label ?? loc.canonicalName ?? loc.name ?? "";
}

export function resolveVisualWorldLocationLabels(
  locs: ReadonlyArray<VisualWorldLocationLabelLike | null | undefined> | null | undefined,
): string[] {
  if (!locs) return [];
  return locs.map(resolveVisualWorldLocationLabel).filter((s) => s.length > 0);
}
