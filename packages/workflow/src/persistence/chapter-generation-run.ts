/**
 * P1.13–14 — Run de génération image V3 : nettoyage des images non validées
 * et corrélation Chapter.currentGenerationRunId ↔ SceneImage.generationRunId.
 */

import { randomUUID } from "node:crypto";
import { prisma } from "@manga-ai-studio/db";

/**
 * Supprime les SceneImage non validées pour un chapitre (régénération propre).
 * Les panels userValidatedAt sont conservés.
 */
export async function deleteUnvalidatedSceneImagesForChapter(
  chapterId: string,
): Promise<{ deletedCount: number }> {
  const result = await prisma.sceneImage.deleteMany({
    where: {
      userValidatedAt: null,
      scene: { chapterId },
    },
  });
  return { deletedCount: result.count };
}

/**
 * Démarre un nouveau run : met à jour le chapitre puis supprime les images
 * non validées du run précédent. Retourne le runId à passer à la persistance V3.
 */
export async function startChapterImageGenerationRun(
  chapterId: string,
): Promise<{ runId: string; deletedCount: number }> {
  const runId = randomUUID();
  const deletedCount = await prisma.$transaction(async (tx) => {
    await tx.chapter.update({
      where: { id: chapterId },
      data: { currentGenerationRunId: runId },
    });
    const del = await tx.sceneImage.deleteMany({
      where: {
        userValidatedAt: null,
        scene: { chapterId },
      },
    });
    return del.count;
  });
  return { runId, deletedCount };
}
