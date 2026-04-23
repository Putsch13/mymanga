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
 *
 * COMMIT A — défaut bascule à `true`. La v3 est maintenant le chemin
 * produit par défaut. Un opérateur peut encore mettre `PIPELINE_V3_STORYBOARD=false`
 * en env pour rebasculer sur la legacy en cas d'incident prod, mais
 * ce n'est plus le défaut.
 */
export function isPipelineV3StoryboardEnabled(): boolean {
  return parseBoolEnv("PIPELINE_V3_STORYBOARD", true);
}

/**
 * Active l'appel FAL réel depuis le render-pass v3.
 *
 * COMMIT B — défaut bascule à `true`. Le render-pass v3 persiste
 * désormais `SceneImage` via `v3-scene-image-persistence` et peut
 * donc fournir le flux d'images premium tout seul. Un opérateur
 * peut couper l'appel FAL réel (`PIPELINE_V3_RENDER_FAL=false`)
 * pour rester en shadow — mais dans ce cas le premium ne rendra
 * plus rien depuis v3 et c'est le legacy qui reprend.
 */
export function isPipelineV3RenderFalEnabled(): boolean {
  return parseBoolEnv("PIPELINE_V3_RENDER_FAL", true);
}

/**
 * Active l'appel LLM réel du manga-editor-agent (IA2).
 *
 * COMMIT A — défaut bascule à `true`. Le stub déterministe n'est plus
 * la source premium : le storyboard passe par OpenAI quand `OPENAI_API_KEY`
 * est présent. Si la clé manque, l'agent LLM retombe sur le stub et loggue
 * un warning `manga_editor.llm.degraded=OPENAI_API_KEY_missing`.
 */
export function isPipelineV3MangaEditorLlmEnabled(): boolean {
  return parseBoolEnv("PIPELINE_V3_MANGA_EDITOR_LLM", true);
}

/**
 * Active l'appel LLM réel du story-architect-agent (IA1).
 *
 * COMMIT H — défaut `true`. Le stub générait 9 beats identiques pour
 * tous les chapitres ; on passe par un vrai agent LLM qui lit
 * l'intention + la continuité. Fallback stub si `OPENAI_API_KEY`
 * manquante (avec warning `story_architect.llm.degraded=…`).
 */
export function isPipelineV3StoryArchitectLlmEnabled(): boolean {
  return parseBoolEnv("PIPELINE_V3_STORY_ARCHITECT_LLM", true);
}

/**
 * Quand `true`, le premium passe UNIQUEMENT par la pipeline v3
 * (StoryPass → StoryboardPass → RenderPass). Les passes legacy
 * (narrative-pass + image-generation-pass) ne s'exécutent plus pour
 * le premium. Requiert `PIPELINE_V3_STORYBOARD=true` ET
 * `PIPELINE_V3_RENDER_FAL=true` (sinon pas de rendu image réel).
 *
 * COMMIT B — défaut bascule à `true`. Le render-pass v3 persiste
 * désormais `SceneImage` directement, ce qui ferme le dernier frein
 * au premium-only. Toute exception v3 fait échouer le job (aucun
 * fallback silencieux). Un opérateur peut encore désactiver
 * `PIPELINE_V3_PREMIUM_ONLY=false` pour conserver le filet legacy
 * pendant un incident, mais ce n'est plus le chemin par défaut.
 */
export function isPipelineV3PremiumOnlyEnabled(): boolean {
  return parseBoolEnv("PIPELINE_V3_PREMIUM_ONLY", true);
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
    pipelineV3StoryArchitectLlm: isPipelineV3StoryArchitectLlmEnabled(),
    pipelineV3PremiumOnly: isPipelineV3PremiumOnlyEnabled(),
  } as const;
}
