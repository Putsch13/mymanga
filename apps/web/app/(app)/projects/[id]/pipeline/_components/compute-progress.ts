/**
 * P5.5 — Calcul du progress% de la pipeline en cours.
 *
 * Pure function : aucun side-effect. Contrat strict préservé avec la
 * version inline historique (weights, fallbacks queued/running).
 */

import type { PipelineJobState } from "./pipeline-types";

const STEP_WEIGHTS: Record<string, number> = {
  build_context: 9,
  generate_bundle: 18,
  continuity_pass: 8,
  story_coherence_pass: 8,
  persist_chapter: 12,
  generate_anchors: 5,
  generate_images: 35,
  update_memory: 5,
};

export function computePipelineProgressValue(jobState: PipelineJobState): number | null {
  const steps = jobState?.output?.steps ?? [];
  if (!steps.length) {
    if (!jobState) return null;
    if (jobState.status === "queued") return 2;
    if (jobState.status === "running") return 6;
    return null;
  }
  const scoreFor = (status: string, weight: number): number => {
    if (status === "completed") return weight;
    if (status === "running" || status === "waiting_external") return Math.max(1, Math.round(weight * 0.55));
    return 0;
  };
  const total = steps.reduce((acc, step) => acc + (STEP_WEIGHTS[step.key] ?? 10), 0);
  const done = steps.reduce((acc, step) => acc + scoreFor(step.status, STEP_WEIGHTS[step.key] ?? 10), 0);
  return Math.max(0, Math.min(100, Math.round((done / Math.max(total, 1)) * 100)));
}

/**
 * Construit l'avertissement "mode dégradé" lu depuis le jobState.
 * Retourne null si aucun mode dégradé actif.
 */
export function buildPipelineDegradedWarning(jobState: PipelineJobState): string | null {
  const degradedModes = jobState?.output?.degradedModes ?? [];
  if (degradedModes.length === 0) return null;
  return [
    `Mode dégradé actif: ${degradedModes.join(", ")}.`,
    jobState?.output?.generationDiagnostics?.outline?.usedFallback
      ? `Outline fallback: ${jobState.output.generationDiagnostics.outline.fallbackReason ?? "raison non précisée"}.`
      : null,
    jobState?.output?.generationDiagnostics?.dialogue?.usedFallback
      ? `Dialogue fallback sur ${jobState.output.generationDiagnostics.dialogue.fallbackSceneIds?.length ?? 0} scène(s).`
      : null,
  ]
    .filter(Boolean)
    .join(" ");
}
