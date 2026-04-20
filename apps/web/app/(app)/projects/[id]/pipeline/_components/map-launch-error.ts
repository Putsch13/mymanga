/**
 * P0.4 — Mapping UX unique pour les erreurs backend de lancement pipeline.
 * Regroupe tous les codes que le backend peut renvoyer en 422 :
 *   - `incomplete_plan` / `INCOMPLETE_PLAN` : panelBlueprints < minimumImages
 *   - `invalid_blueprints` / `INVALID_BLUEPRINTS` : blueprints non conformes
 *   - `premium_contract_incomplete` : champs obligatoires manquants
 *   - `SHOT_MONOTONY` : variété de plans insuffisante
 *   - fallback : message brut
 *
 * Les messages sont orientés action (quoi faire dans le studio) et pas
 * techniques (pas de code, pas de stack trace).
 */

export type LaunchErrorPayload = {
  error?: string;
  code?: string;
  message?: string;
  missing?: string[];
  panelBlueprintCount?: number;
  minimumImages?: number;
  varietyScore?: number;
  missingShots?: string[];
  totalInvalid?: number;
  ok?: boolean;
};

export function mapLaunchError(payload: LaunchErrorPayload | null | undefined): string {
  if (!payload) return "Erreur de lancement.";

  const code = typeof payload.code === "string" ? payload.code : null;
  const errorKey = typeof payload.error === "string" ? payload.error : null;

  if (code === "INCOMPLETE_PLAN" || errorKey === "incomplete_plan") {
    const count = typeof payload.panelBlueprintCount === "number" ? payload.panelBlueprintCount : null;
    const minimum = typeof payload.minimumImages === "number" ? payload.minimumImages : null;
    const ratio =
      count !== null && minimum !== null
        ? `${count} blueprints pour un minimum de ${minimum}`
        : "moins de blueprints que le minimum requis";
    return (
      `Le plan validé côté studio est incomplet : ${ratio}. ` +
      `Retourne à l'étape Plan et clique sur « Régénérer le plan » avant de relancer la génération.`
    );
  }

  if (code === "INVALID_BLUEPRINTS" || errorKey === "invalid_blueprints") {
    const total = typeof payload.totalInvalid === "number" ? payload.totalInvalid : null;
    const prefix = total !== null ? `${total} blueprint(s) invalide(s)` : "des blueprints invalides";
    return (
      `Le plan contient ${prefix}. Retourne à l'étape Plan et régénère le plan pour rétablir ` +
      `un contrat de génération valide.`
    );
  }

  if (code === "SHOT_MONOTONY") {
    const pct = typeof payload.varietyScore === "number"
      ? `${(payload.varietyScore * 100).toFixed(0)}%`
      : "trop basse";
    const missing = Array.isArray(payload.missingShots) && payload.missingShots.length > 0
      ? ` Plans manquants : ${payload.missingShots.join(", ")}.`
      : "";
    return `⚠️ Variété de plans insuffisante (${pct}).${missing} Retourne dans le studio et régénère le plan pour diversifier les shots.`;
  }

  if (errorKey === "premium_contract_incomplete" || code === "premium_contract_incomplete") {
    const missing = Array.isArray(payload.missing) && payload.missing.length > 0
      ? payload.missing.join(", ")
      : null;
    const detail = missing ? ` Éléments manquants : ${missing}.` : "";
    return (
      `Le plan du chapitre est incomplet.${detail} Retourne dans le studio, étape 3 « Plan », ` +
      `génère l'outline et le plan de production, puis reviens ici.`
    );
  }

  return payload.message ?? payload.error ?? "Erreur de lancement.";
}
