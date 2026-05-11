/**
 * Filtres communs sur les `SceneImage` lus depuis la DB pour les routes
 * chapter (`route.ts`, `qa-report/route.ts`, etc.).
 *
 * Source de vérité unique : avant, deux copies de cette logique vivaient
 * dans les deux routes — toute évolution devait être appliquée deux fois,
 * avec un risque de drift silencieux.
 */

import { SCENE_IMAGE_STATUS, type SceneImageStatus } from "@manga-ai-studio/core";

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

/**
 * FIX-31 (MOD) — Pour le RENDU final lecteur (manga-book-reader),
 * on ne veut pas afficher les panels qui ont échoué QA visuel ou qui
 * sont bloqués : ils n'ont pas d'image utilisable, ou pire ils ont une
 * image clairement cassée. Avant ce TODO ils étaient comptabilisés dans
 * la couverture du chapitre et apparaissaient comme cases vides.
 *
 * Cette fonction est un filtre PLUS strict que celui ci-dessus :
 *   - Garde les `COMPLETED` (rendu validé pipeline)
 *   - Garde les images explicitement validées par l'utilisateur même
 *     si elles sont en FAILED (override manuel)
 *   - Exclut FAILED / BLOCKED / GENERATING / PENDING / PLANNED
 */
export function sceneImageVisibleToReader(image: {
  status?: SceneImageStatus | string | null;
  userValidatedAt?: Date | null;
}): boolean {
  if (image.userValidatedAt) return true;
  if (image.status === SCENE_IMAGE_STATUS.COMPLETED) return true;
  return false;
}
