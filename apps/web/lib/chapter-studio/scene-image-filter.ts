/**
 * Filtres communs sur les `SceneImage` lus depuis la DB pour les routes
 * chapter (`route.ts`, `qa-report/route.ts`, etc.).
 *
 * Source de vérité unique : avant, deux copies de cette logique vivaient
 * dans les deux routes — toute évolution devait être appliquée deux fois,
 * avec un risque de drift silencieux.
 */

/**
 * P1.14 — Exclure l'historique hors run courant (sauf panels déjà validés
 * utilisateur).
 *
 * Règle :
 *   - Si le chapitre n'a pas de `currentGenerationRunId`, on inclut tout
 *     (mode legacy / pas encore de run).
 *   - Si l'image porte un `userValidatedAt`, on l'inclut toujours (un panel
 *     validé manuellement reste affichable même si le run a été remplacé).
 *   - Sinon, on garde uniquement les images dont le `generationRunId`
 *     correspond au run courant.
 */
export function sceneImageIncludedInCurrentRunReport(
  image: { generationRunId?: string | null; userValidatedAt?: Date | null },
  chapter: { currentGenerationRunId?: string | null },
): boolean {
  if (!chapter.currentGenerationRunId) return true;
  if (image.userValidatedAt) return true;
  return image.generationRunId === chapter.currentGenerationRunId;
}
