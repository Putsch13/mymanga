/**
 * Sprint 1 — Reader refacto
 *
 * Règles de choix de layout pour une page déjà découpée (N panels, 1 <= N <= 6).
 * Le moteur de pagination découpe les panels en groupes de 1 à 6, puis appelle
 * `pickLayoutForPage` pour choisir un layout cohérent avec l'importance des
 * panels du groupe.
 */

import type { MangaPageLayoutId } from "./page-layout-types";
import type { PanelImportance } from "./panel-importance";

export interface PanelLayoutHint {
  importance: PanelImportance;
}

/**
 * Choisit un layout pour une page de N panels (1..6).
 * N = 5 n'est JAMAIS passé ici — le paginator le découpe en 3+2 ou 2+3.
 */
export function pickLayoutForPage(panels: ReadonlyArray<PanelLayoutHint>): MangaPageLayoutId {
  const count = panels.length;
  if (count <= 0) {
    throw new Error("pickLayoutForPage: page vide (0 panel) — le paginator ne doit jamais émettre de page vide");
  }

  if (count === 1) return "splash";
  if (count === 2) return "double_spread";

  const hasMajor = panels.some((p) => p.importance === "splash" || p.importance === "major");

  if (count === 3) {
    return hasMajor ? "asymmetric_hero" : "cinematic_bar";
  }

  if (count === 4) return "grid_2x2";

  // count === 6 : action_strip si un panel dominant, sinon grid_2x3 régulier.
  if (count === 6) return hasMajor ? "action_strip" : "grid_2x3";

  throw new Error(
    `pickLayoutForPage: nombre de panels non supporté (count=${count}). ` +
    `Le paginator doit émettre uniquement des pages de 1, 2, 3, 4 ou 6 panels.`,
  );
}

/**
 * Découpe N panels en tailles de pages valides (sans jamais produire une
 * page de 5 — pas de layout adapté dans `PAGE_LAYOUT_CONFIGS`).
 *
 * Règles d'équilibrage (voir tests) :
 *   - on évite de terminer par un panel isolé si c'est possible (ex. 7 → 4+3 et pas 6+1)
 *   - on évite les pages de 5 (ex. 5 → 3+2, 11 → 6+3+2)
 *   - un `splash` récupère toujours sa propre page (traité en amont par le paginator)
 */
export function computePageSizes(totalPanels: number): number[] {
  if (totalPanels <= 0) return [];

  const sizes: number[] = [];
  let remaining = totalPanels;

  while (remaining > 0) {
    let take: number;

    if (remaining <= 4) {
      take = remaining;
    } else if (remaining === 5) {
      take = 3;
    } else if (remaining === 6) {
      take = 6;
    } else if (remaining === 7) {
      take = 4;
    } else if (remaining === 8) {
      take = 4;
    } else if (remaining === 9) {
      take = 6;
    } else if (remaining === 10) {
      take = 6;
    } else if (remaining === 11) {
      take = 6;
    } else {
      take = 6;
    }

    sizes.push(take);
    remaining -= take;
  }

  return sizes;
}
