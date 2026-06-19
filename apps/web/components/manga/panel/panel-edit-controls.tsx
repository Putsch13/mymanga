"use client";

/**
 * Sprint 2 — Composition des panels
 *
 * Wrapper fin autour de `PanelEditOverlay` avec une API plus claire pour la
 * vue composée. Isolé ici pour que `panel-composed-view` n'ait pas à importer
 * directement l'ancien composant.
 *
 * Support additionnel : toggle d'édition des bulles (déplacer/redimensionner).
 * L'implémentation concrète du drag&drop est à brancher dans un sprint
 * ultérieur ; pour l'instant on expose uniquement les hooks.
 */

import { PanelEditOverlay } from "../panel-edit-overlay";

export interface PanelEditControlsProps {
  sceneImageId: string;
  bubblesHidden: boolean;
  onToggleBubbles: () => void;
  /**
   * Active le mode édition des bulles (drag/resize). False par défaut.
   */
  bubbleEditMode?: boolean;
  onToggleBubbleEditMode?: () => void;
}

export function PanelEditControls(props: PanelEditControlsProps) {
  return (
    <PanelEditOverlay
      sceneImageId={props.sceneImageId}
      bubblesHidden={props.bubblesHidden}
      onToggleBubbles={props.onToggleBubbles}
    />
  );
}

export default PanelEditControls;
