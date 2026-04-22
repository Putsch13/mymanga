/**
 * Feature flags pour la refonte de la pipeline en 3 étages (Story Architect
 * -> Manga Editor -> Panel Renderer).
 *
 * Usage : cf. run-full-chapter-pipeline.ts et les passes v3 (story-pass,
 * storyboard-pass, render-pass).
 *
 * On lit les variables à chaque appel (pas de cache module-level) pour
 * permettre l'override en runtime par les tests / par override job.
 */

function parseBoolEnv(name: string, fallback = false): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === null) return fallback;
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/**
 * Active la nouvelle pipeline v3 (story / storyboard / render).
 * Quand désactivée, on garde la pipeline legacy sans régression.
 */
export function isPipelineV3StoryboardEnabled(): boolean {
  return parseBoolEnv("PIPELINE_V3_STORYBOARD", false);
}

/**
 * Expose de manière structurée tous les flags connus.
 * Utile pour logs de diagnostic au démarrage du pipeline.
 */
export function getPipelineFeatureFlags() {
  return {
    pipelineV3Storyboard: isPipelineV3StoryboardEnabled(),
  } as const;
}
