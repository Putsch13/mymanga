import { isPipelineV3PremiumOnlyEnabled } from "@manga-ai-studio/core";

/**
 * En production + premium-only, les routes alternatives de lancement de
 * chapitre complet doivent être bloquées pour forcer le chemin unique
 * `POST .../chapters/[chapterId]/launch`.
 */
export function isPremiumStrictProductionDuplicateLaunchBlocked(): boolean {
  return process.env.NODE_ENV === "production" && isPipelineV3PremiumOnlyEnabled();
}
