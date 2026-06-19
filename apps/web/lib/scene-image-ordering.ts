/**
 * Ordre lecture manga : scène → panel → identité stable.
 * Utilisé par l’audit premium (pas de tri par CUID comme proxy temporel).
 */

import type { ChapterScene, SceneImage } from "@manga-ai-studio/db";

export type ChapterSceneWithImages = ChapterScene & {
  images: SceneImage[];
};

export type SceneImageWithSceneMeta = SceneImage & {
  sceneNumber: number;
  sceneId: string;
};

/** Tri déterministe dans une même scène. */
export function compareSceneImagesInScene(a: SceneImage, b: SceneImage): number {
  if (a.panelNumber !== b.panelNumber) {
    return a.panelNumber - b.panelNumber;
  }
  const extA = a.externalPanelId;
  const extB = b.externalPanelId;
  if (extA == null && extB == null) {
    return a.id.localeCompare(b.id);
  }
  if (extA == null) return 1;
  if (extB == null) return -1;
  const byExt = extA.localeCompare(extB);
  if (byExt !== 0) return byExt;
  return a.id.localeCompare(b.id);
}

/** Aplatit les images du chapitre dans l’ordre de lecture (scène puis panel). */
export function flattenSceneImagesReadingOrder(
  scenes: ChapterSceneWithImages[],
): SceneImageWithSceneMeta[] {
  return [...scenes]
    .sort((a, b) => a.sceneNumber - b.sceneNumber)
    .flatMap((scene) =>
      [...scene.images]
        .sort(compareSceneImagesInScene)
        .map((img) => ({
          ...img,
          sceneNumber: scene.sceneNumber,
          sceneId: scene.id,
        })),
    );
}

/**
 * Image « représentative » pour métadonnées globales du run (scores, hashes dupliqués sur les panels).
 * Préfère le dernier panel en ordre de lecture parmi les images du run courant ; sinon dernier avec métadonnées.
 */
export function pickRepresentativeImageForRunMetadata(
  ordered: SceneImageWithSceneMeta[],
  chapterCurrentRunId: string | null,
): SceneImageWithSceneMeta | undefined {
  const nonEmptyMeta = ordered.filter(
    (img) =>
      img.metadata != null &&
      typeof img.metadata === "object" &&
      Object.keys(img.metadata as object).length > 0,
  );
  if (nonEmptyMeta.length === 0) return undefined;

  const metaRun = (img: SceneImage) =>
    img.generationRunId ??
    ((img.metadata as Record<string, unknown>).generationRunId as string | undefined);

  if (chapterCurrentRunId) {
    const forRun = nonEmptyMeta.filter(
      (img) => metaRun(img) === chapterCurrentRunId,
    );
    if (forRun.length > 0) {
      return forRun[forRun.length - 1];
    }
  }

  return nonEmptyMeta[nonEmptyMeta.length - 1];
}

/**
 * Pour diagnostics « dernière écriture », après migration `createdAt` sur SceneImage.
 * Sinon ordre de lecture inverse comme repli.
 */
export function pickMostRecentlyPersistedImage(
  pool: SceneImageWithSceneMeta[],
): SceneImageWithSceneMeta | undefined {
  if (pool.length === 0) return undefined;
  const withCreated = pool.filter((img) => img.createdAt != null);
  if (withCreated.length === 0) {
    return pool[pool.length - 1];
  }
  return [...withCreated].sort(
    (a, b) => b.createdAt!.getTime() - a.createdAt!.getTime(),
  )[0];
}
