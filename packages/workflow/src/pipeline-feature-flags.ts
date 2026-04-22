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
 * Active l'appel FAL réel depuis le render-pass v3.
 * Quand désactivé, le render-pass ne fait que persister specs + prompts
 * (shadow mode) — c'est la pipeline legacy qui fait le vrai rendu image.
 * À activer UNIQUEMENT après validation QA des prompts/routes en shadow.
 * Requiert PIPELINE_V3_STORYBOARD=true également.
 */
export function isPipelineV3RenderFalEnabled(): boolean {
  return parseBoolEnv("PIPELINE_V3_RENDER_FAL", false);
}

/**
 * Active l'appel LLM réel du manga-editor-agent (IA2).
 * Par défaut, l'agent utilise un stub déterministe qui produit un
 * StoryboardPlan structurellement valide mais non créatif. Activer le
 * flag branche un appel OpenAI avec JSON strict (requiert OPENAI_API_KEY).
 */
export function isPipelineV3MangaEditorLlmEnabled(): boolean {
  return parseBoolEnv("PIPELINE_V3_MANGA_EDITOR_LLM", false);
}

/**
 * Expose de manière structurée tous les flags connus.
 * Utile pour logs de diagnostic au démarrage du pipeline.
 */
export function getPipelineFeatureFlags() {
  return {
    pipelineV3Storyboard: isPipelineV3StoryboardEnabled(),
    pipelineV3RenderFal: isPipelineV3RenderFalEnabled(),
    pipelineV3MangaEditorLlm: isPipelineV3MangaEditorLlmEnabled(),
  } as const;
}
