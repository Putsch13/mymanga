import type { FitResult, UniversalPanel } from "./types";

/**
 * Choisir le fit/position d'un panel en fonction de son slotType et renderMeta.
 * NE PLUS forcer cover arbitrairement basé uniquement sur la position dans la grille.
 */
export function pickPanelImageFit(panel: UniversalPanel): FitResult {
  if (panel.renderMeta?.cropMode) {
    const position = panel.renderMeta.focalPoint
      ? `${panel.renderMeta.focalPoint.x * 100}% ${panel.renderMeta.focalPoint.y * 100}%`
      : "center";
    return { fit: panel.renderMeta.cropMode, position };
  }

  const slotType = panel.layoutMeta?.slotType;
  if (slotType === "wide") {
    return { fit: "cover", position: "center top" };
  }
  if (slotType === "tall") {
    return { fit: "cover", position: "top" };
  }
  if (slotType === "closeup" || slotType === "dialogue") {
    return { fit: "contain", position: "center" };
  }

  // Fallback: CONTAIN par défaut pour éviter de couper cheveux/yeux. Quand la
  // composition finale sera propre, on pourra remettre du cover slot par slot
  // avec un focalPoint explicite.
  return { fit: "contain", position: "center" };
}
