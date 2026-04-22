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

/**
 * AUDIT COMMIT 9 — le choix de layout ne peut plus se faire uniquement sur
 * le nombre de panels + la présence d'un "major". On étend `PanelLayoutHint`
 * avec :
 *   - `dominantSubject` : qui porte le panel visuellement
 *   - `beatRole`        : à quelle fonction narrative le panel appartient
 *   - `dialogueDensity` : combien de texte le panel est censé absorber
 *
 * Ces champs sont optionnels pour ne pas casser les appelants legacy, mais
 * quand ils sont présents, `pickLayoutForPage` choisit un layout plus
 * lisible (asymmetric_hero pour une revelation, cinematic_bar pour un
 * environment establishing, etc.).
 */
export type PanelDominantSubject =
  | "hero"
  | "npc"
  | "group"
  | "environment"
  | "prop"
  | "reaction";

export type PanelBeatRole =
  | "setup"
  | "escalation"
  | "revelation"
  | "confrontation"
  | "aftermath"
  | "cliffhanger";

export type PanelDialogueDensity = "low" | "medium" | "high";

export interface PanelLayoutHint {
  importance: PanelImportance;
  dominantSubject?: PanelDominantSubject;
  beatRole?: PanelBeatRole;
  dialogueDensity?: PanelDialogueDensity;
}

/**
 * Options pour `pickLayoutForPage` / `computePageSizes`.
 *
 * Phase 4 : `allowFivePanel` active les layouts natifs à 5 panneaux.
 * Par défaut off pour préserver la compatibilité avec le paginator legacy
 * (qui splittait 5 en 3+2).
 */
export interface PaginatorOptions {
  allowFivePanel?: boolean;
}

/**
 * Choisit un layout pour une page de N panels.
 * Legacy : N=5 n'est pas supporté et le paginator le découpe en 3+2.
 * Phase 4 : si `options.allowFivePanel`, les 5 panneaux utilisent `grid_1_2_2` par défaut.
 */
export function pickLayoutForPage(
  panels: ReadonlyArray<PanelLayoutHint>,
  options: PaginatorOptions = {},
): MangaPageLayoutId {
  const count = panels.length;
  if (count <= 0) {
    throw new Error("pickLayoutForPage: page vide (0 panel) — le paginator ne doit jamais émettre de page vide");
  }

  if (count === 1) return "splash";
  if (count === 2) return "double_spread";

  const hasMajor = panels.some((p) => p.importance === "splash" || p.importance === "major");

  // AUDIT COMMIT 9 — agrégats content-aware (ignorés si les hints ne sont pas
  // fournis par l'appelant, pour ne pas casser le comportement legacy).
  const hasRevelationOrCliffhanger = panels.some(
    (p) => p.beatRole === "revelation" || p.beatRole === "cliffhanger",
  );
  const environmentCount = panels.filter((p) => p.dominantSubject === "environment").length;
  const reactionOrHighDialogueCount = panels.filter(
    (p) => p.dominantSubject === "reaction" || p.dialogueDensity === "high",
  ).length;
  const heroOrImportantReactionCount = panels.filter((p) => {
    if (p.dominantSubject === "hero") return true;
    // "reaction" compte comme important tant que le panel n'est pas un simple
    // insert (le type PanelImportance = "splash" | "major" | "normal" | "insert").
    if (p.dominantSubject === "reaction" && p.importance !== "insert") return true;
    return false;
  }).length;

  if (count === 3) {
    // revelation/cliffhanger => asymmetric_hero même si aucun panel "major"
    if (hasRevelationOrCliffhanger) return "asymmetric_hero";
    // environment dominant => cinematic_bar (lecture horizontale décor)
    if (environmentCount >= 2) return "cinematic_bar";
    return hasMajor ? "asymmetric_hero" : "cinematic_bar";
  }

  if (count === 4) {
    // grid_2x2 reste le défaut lisible pour dialogue/réaction denses
    return "grid_2x2";
  }

  if (count === 5) {
    if (!options.allowFivePanel) {
      throw new Error(
        "pickLayoutForPage: page de 5 panels sans allowFivePanel — le paginator legacy doit la découper en 3+2.",
      );
    }
    if (hasRevelationOrCliffhanger) return "hero_top_2_2";
    if (environmentCount >= 3) return "grid_1_2_2";
    return hasMajor ? "hero_top_2_2" : "grid_1_2_2";
  }

  if (count === 6) {
    // AUDIT COMMIT 9 — un panel hero ou réaction importante déclenche
    // action_strip, mais une page "full inserts / environment" bascule en
    // grid_2x3 (pas d'action_strip sur du décor pur).
    if (environmentCount >= 4 && heroOrImportantReactionCount === 0) {
      return "grid_2x3";
    }
    if (heroOrImportantReactionCount >= 1) return "action_strip";
    if (reactionOrHighDialogueCount >= 3) return "grid_2x3";
    return hasMajor ? "action_strip" : "grid_2x3";
  }

  throw new Error(
    `pickLayoutForPage: nombre de panels non supporté (count=${count}). ` +
    `Le paginator doit émettre uniquement des pages de 1, 2, 3, 4, 5 ou 6 panels.`,
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
/**
 * AUDIT COMMIT 9 — pour l'instant `computePageSizes` n'utilise pas encore
 * les hints (beatRole, dominantSubject, dialogueDensity). Un futur overload
 * `computePageSizesFromHints(panels, options)` pourra regrouper les panels
 * selon le rythme narratif (ex. isoler un cliffhanger sur sa propre page,
 * grouper les aftermaths). On garde le découpage par count pour ne pas
 * changer le comportement du paginator en une seule passe.
 */
export function computePageSizes(
  totalPanels: number,
  options: PaginatorOptions = {},
): number[] {
  if (totalPanels <= 0) return [];

  const allowFive = Boolean(options.allowFivePanel);
  const sizes: number[] = [];
  let remaining = totalPanels;

  while (remaining > 0) {
    let take: number;

    if (remaining <= 4) {
      take = remaining;
    } else if (remaining === 5) {
      take = allowFive ? 5 : 3;
    } else if (remaining === 6) {
      take = 6;
    } else if (remaining === 7) {
      take = 4;
    } else if (remaining === 8) {
      take = 4;
    } else if (remaining === 9) {
      take = 6;
    } else if (remaining === 10) {
      // 10 → 5+5 si 5 autorisé, sinon 6+4.
      take = allowFive ? 5 : 6;
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
