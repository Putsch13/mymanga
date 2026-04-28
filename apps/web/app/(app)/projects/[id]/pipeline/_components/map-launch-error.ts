/**
 * P0.4 — Mapping UX unique pour les erreurs backend de lancement pipeline.
 * Regroupe tous les codes que le backend peut renvoyer en 422 :
 *   - `incomplete_plan` / `INCOMPLETE_PLAN` : panelBlueprints < minimumImages
 *   - `invalid_blueprints` / `INVALID_BLUEPRINTS` : blueprints non conformes
 *   - `premium_contract_incomplete` : champs obligatoires manquants
 *   - `PRODUCTION_PLAN_STRUCTURAL_QA_FAILED` : QA structurelle sur blueprints persistés
 *   - `PREMIUM_AI_READINESS_FAILED` : moteurs IA / env serveur insuffisants (premium-only)
 *   - `PREMIUM_CONTINUITY_PREFLIGHT_FAILED` : panels critiques sans DNA visuel personnage
 *   - `SHOT_MONOTONY` : variété de plans insuffisante
 *   - fallback : message brut
 *
 * Les messages sont orientés action (quoi faire dans le studio) et pas
 * techniques (pas de code, pas de stack trace).
 */

import { PRODUCTION_RULES, type ProductionMetrics, type ProductionQaResult } from "@manga-ai-studio/core";

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
  structuralQa?: ProductionQaResult;
  structuralMetrics?: ProductionMetrics;
  aiReadiness?: unknown;
  premiumBlockingReasons?: string[];
  continuityBlockers?: string[];
};

/** Indique si l’UI doit proposer le CTA « régénérer le plan premium » (studio chapitre). */
export function isStructuralProductionPlanLaunchFailure(
  payload: LaunchErrorPayload | null | undefined,
): boolean {
  if (!payload) return false;
  const code = typeof payload.code === "string" ? payload.code : null;
  const errorKey = typeof payload.error === "string" ? payload.error : null;
  return (
    code === "PRODUCTION_PLAN_STRUCTURAL_QA_FAILED" || errorKey === "production_plan_structural_qa_failed"
  );
}

function formatStructuralQaMetricsBlock(metrics: ProductionMetrics | undefined): string {
  if (!metrics) return "";
  const cut = (metrics.cutawayRatio * 100).toFixed(1);
  const act = (metrics.actorDrivenRatio * 100).toFixed(1);
  const maxCut = (PRODUCTION_RULES.cutaway.maxRatio * 100).toFixed(0);
  const minAct = (PRODUCTION_RULES.actorDriven.minRatio * 100).toFixed(0);
  const maxStreak = PRODUCTION_RULES.cutaway.maxConsecutive;
  const streak = metrics.maxConsecutiveCutaways;
  return (
    `Ratios actuels : cutaways ${cut}% (max ${maxCut}%), panels avec personnages visibles ${act}% (min ${minAct}%). ` +
    `Enchaînement max de cutaways : ${streak} (limite ${maxStreak}).`
  );
}

function extractAbsentCharactersHint(errors: string[] | undefined): string | null {
  if (!errors?.length) return null;
  for (const line of errors) {
    const m = line.match(/absent from panels:\s*(.+)$/i);
    if (m?.[1]) {
      return `Personnages requis par les temps mais absents visuellement du plan : ${m[1].trim()}.`;
    }
  }
  return null;
}

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

  if (errorKey === "premium_only_launch_route_required") {
    return (
      "La génération premium se lance depuis le studio chapitre. " +
      "Ouvre ton projet → le chapitre concerné → étape « Génération & review », puis « Lancer la génération »."
    );
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

  if (code === "PRODUCTION_PLAN_STRUCTURAL_QA_FAILED" || errorKey === "production_plan_structural_qa_failed") {
    const metricsLine = formatStructuralQaMetricsBlock(payload.structuralMetrics);
    const absentHint = extractAbsentCharactersHint(payload.structuralQa?.errors);
    const detailErrors =
      Array.isArray(payload.structuralQa?.errors) && payload.structuralQa.errors.length > 0
        ? ` Détail : ${payload.structuralQa.errors.slice(0, 4).join(" — ")}${payload.structuralQa.errors.length > 4 ? " …" : ""}`
        : "";
    const base =
      "Le plan final contient trop de panels décor ou objets par rapport aux panels avec personnages visibles, " +
      "ou ne respecte pas une autre règle structurelle premium. Relance l’estimation du chapitre depuis le studio " +
      "pour régénérer le plan premium, puis valide à nouveau avant de lancer.";
    const parts = [base, metricsLine || null, absentHint, detailErrors || null].filter(Boolean);
    return parts.join(" ");
  }

  if (code === "PREMIUM_AI_READINESS_FAILED" || errorKey === "premium_ai_readiness_failed") {
    const lines = Array.isArray(payload.premiumBlockingReasons) && payload.premiumBlockingReasons.length > 0
      ? payload.premiumBlockingReasons.slice(0, 6).join(" · ")
      : "configuration serveur incomplète (LLM, provider image, stockage ou QA vision).";
    return (
      "Les moteurs IA requis pour le lancement premium ne sont pas prêts sur ce serveur. " +
      `Détail : ${lines} ` +
      "Vérifie les variables d’environnement (OPENAI_API_KEY, FAL_KEY, Supabase, QA vision) ou contacte l’administrateur."
    );
  }

  if (code === "PREMIUM_CONTINUITY_PREFLIGHT_FAILED" || errorKey === "premium_continuity_preflight_failed") {
    const blockers = Array.isArray(payload.continuityBlockers) ? payload.continuityBlockers : [];
    const detail = blockers.length > 0 ? blockers.slice(0, 4).join(" · ") : "panels critiques sans DNA visuel.";
    return (
      "Le plan contient des panels critiques pour lesquels les verrous visuels personnages (characterVisualDna) ne sont pas renseignés. " +
      `Détail : ${detail} Retourne au studio, complète les DNA / références, puis régénère ou valide à nouveau le plan premium.`
    );
  }

  return payload.message ?? payload.error ?? "Erreur de lancement.";
}
