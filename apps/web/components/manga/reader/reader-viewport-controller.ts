/**
 * Sprint 1 — Reader refacto
 *
 * Contrôleur de viewport pour le reader manga. Remplace les comportements
 * implicites de `object-cover` / `aspectRatio: "3/4"` qui cropaient les
 * pages en mode full-page et détruisaient la lecture.
 *
 * Trois modes explicites :
 *   - `fit-page`    : la page entière est visible, pas de crop (manga par défaut)
 *   - `fit-width`   : largeur pleine, scroll vertical (lecture rapprochée)
 *   - `panel-focus` : un seul panel à la fois, zoomé
 *
 * Une fonction utilitaire renvoie les styles CSS à appliquer au conteneur
 * de page et à l'image/canvas interne. Tout le reader doit consommer ces
 * helpers — plus d'`object-cover` / `aspectRatio` codés en dur dans les
 * sous-composants.
 */

import type { CSSProperties } from "react";

export type ReaderViewportMode = "fit-page" | "fit-width" | "panel-focus";

export const READER_VIEWPORT_MODES: readonly ReaderViewportMode[] = ["fit-page", "fit-width", "panel-focus"] as const;

export const DEFAULT_VIEWPORT_MODE: ReaderViewportMode = "fit-page";

export interface ViewportStyle {
  /** Styles appliqués au conteneur externe (le "viewport"). */
  container: CSSProperties;
  /** Styles appliqués à la page/image/canvas enfants. */
  content: CSSProperties;
}

/**
 * Retourne les styles CSS pour un mode donné.
 *
 * En `fit-page` on utilise `object-fit: contain` (pas `cover`) et on laisse
 * la page trouver son propre ratio. C'est le fix du bug "full-page croppe
 * le haut de la page" : la cause était `object-cover` + ratio figé.
 */
export function getViewportStyle(mode: ReaderViewportMode): ViewportStyle {
  switch (mode) {
    case "fit-page":
      return {
        container: {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          overflow: "hidden",
        },
        content: {
          maxWidth: "100%",
          maxHeight: "100%",
          width: "auto",
          height: "auto",
          objectFit: "contain",
        },
      };
    case "fit-width":
      return {
        container: {
          width: "100%",
          height: "100%",
          overflowY: "auto",
          overflowX: "hidden",
        },
        content: {
          width: "100%",
          height: "auto",
          objectFit: "contain",
        },
      };
    case "panel-focus":
      return {
        container: {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          overflow: "hidden",
        },
        content: {
          maxWidth: "95%",
          maxHeight: "95%",
          width: "auto",
          height: "auto",
          objectFit: "contain",
        },
      };
  }
}

/**
 * Next/previous mode cycling (utile pour un bouton toolbar qui cycle).
 */
export function cycleViewportMode(current: ReaderViewportMode): ReaderViewportMode {
  const idx = READER_VIEWPORT_MODES.indexOf(current);
  const next = (idx + 1) % READER_VIEWPORT_MODES.length;
  return READER_VIEWPORT_MODES[next]!;
}

/**
 * Label utilisateur pour un mode donné (FR, puisque le produit est FR).
 */
export function getViewportModeLabel(mode: ReaderViewportMode): string {
  switch (mode) {
    case "fit-page":
      return "Page entière";
    case "fit-width":
      return "Largeur pleine";
    case "panel-focus":
      return "Panel zoom";
  }
}
