/**
 * Compare une nouvelle signature visuelle à un NpcVisualProfile existant
 * et retourne un diagnostic de drift. Utilisé AVANT d'écraser les champs
 * d'un profil récurrent : si la tenue ou la silhouette change brutalement
 * sur un PNJ "locked" ou "promoted", on alerte plutôt que de laisser le
 * pipeline le redessiner différemment à chaque apparition.
 */
export function detectNpcVisualDrift(input: {
  existingOutfit?: string | null;
  existingSilhouette?: string | null;
  existingPromotionStatus?: string | null;
  nextOutfit?: string | null;
  nextSilhouette?: string | null;
}): { drifted: boolean; severity: "none" | "soft" | "hard"; reasons: string[] } {
  const reasons: string[] = [];
  const outfitChanged = Boolean(
    input.existingOutfit
      && input.nextOutfit
      && input.existingOutfit.trim().toLowerCase()
        !== input.nextOutfit.trim().toLowerCase(),
  );
  const silhouetteChanged = Boolean(
    input.existingSilhouette
      && input.nextSilhouette
      && input.existingSilhouette.trim().toLowerCase()
        !== input.nextSilhouette.trim().toLowerCase(),
  );
  if (outfitChanged) {
    reasons.push(`outfit drift: "${input.existingOutfit}" → "${input.nextOutfit}"`);
  }
  if (silhouetteChanged) {
    reasons.push(
      `silhouette drift: "${input.existingSilhouette}" → "${input.nextSilhouette}"`,
    );
  }

  const locked =
    input.existingPromotionStatus === "locked"
    || input.existingPromotionStatus === "promoted";
  const drifted = outfitChanged || silhouetteChanged;
  const severity = !drifted ? "none" : locked ? "hard" : "soft";
  return { drifted, severity, reasons };
}
