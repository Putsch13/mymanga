/**
 * P1-1 — Garde de contrat premium côté pipeline backend.
 *
 * Complément défensif à `assertPremiumContract` (apps/web) : les routes
 * `launch` et `pipeline` valident déjà le contrat avant de créer le job,
 * mais un job peut aussi être rejoué via `run-now`, relancé après un
 * retry, ou créé par un flow interne qui court-circuite la garde web.
 *
 * On vérifie ici les invariants minimaux qui rendraient la pipeline
 * incapable de produire un chapitre cohérent :
 *   - approvedOutline.beats (ou productionOutline.beats) non vide
 *   - productionPlan.panelBlueprints non vide
 *   - productionPlan.minimumImages > 0
 *
 * En cas d'échec, le job est marqué `failed` avec un message exploitable
 * par l'UI et aucun coût d'IA n'est engagé.
 */

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export interface PremiumContractGuardResult {
  ok: boolean;
  missing: string[];
  warnings: string[];
}

/**
 * Valide les invariants critiques d'un contrat premium stocké dans
 * `chapter.outline` (studio snapshot + legacy approvedOutline). Ne lève
 * jamais d'exception, renvoie une liste d'erreurs/avertissements.
 */
export function assertPremiumContractFromChapter(
  chapterOutline: unknown,
  minimumImagesFromChapter: number | null | undefined,
): PremiumContractGuardResult {
  const missing: string[] = [];
  const warnings: string[] = [];

  const outlineRecord = asRecord(chapterOutline);
  const studio = asRecord(outlineRecord.studio);
  const studioData = asRecord(studio.data);

  const productionOutline = asRecord(studioData.productionOutline);
  const productionPlan = asRecord(studioData.productionPlan);
  const approvedOutline = asRecord(outlineRecord.approvedOutline);

  const approvedBeats = Array.isArray(approvedOutline.beats) ? approvedOutline.beats : [];
  const productionBeats = Array.isArray(productionOutline.beats) ? productionOutline.beats : [];

  if (approvedBeats.length === 0 && productionBeats.length === 0) {
    missing.push("approvedOutline.beats | productionOutline.beats (aucun beat validé)");
  }

  const panelBlueprints = Array.isArray(productionPlan.panelBlueprints)
    ? productionPlan.panelBlueprints
    : [];
  if (panelBlueprints.length === 0) {
    missing.push("productionPlan.panelBlueprints (blueprints manquants — studio incomplet)");
  }

  const minimumImages = typeof productionPlan.minimumImages === "number"
    ? productionPlan.minimumImages
    : (typeof minimumImagesFromChapter === "number" ? minimumImagesFromChapter : null);
  if (minimumImages === null || minimumImages <= 0) {
    missing.push("productionPlan.minimumImages (cible premium non définie)");
  }

  if (panelBlueprints.length > 0 && typeof minimumImages === "number" && minimumImages > 0) {
    if (panelBlueprints.length < minimumImages) {
      warnings.push(
        `panelBlueprints (${panelBlueprints.length}) < minimumImages (${minimumImages}) — la génération produira moins de cases que promis`,
      );
    }
  }

  return { ok: missing.length === 0, missing, warnings };
}
