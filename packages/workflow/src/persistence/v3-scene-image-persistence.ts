/**
 * v3-scene-image-persistence — persist rendered panels (v3 render-pass)
 * sous la forme attendue par le reader : ChapterScene (une par page)
 * + SceneImage (une par panel).
 *
 * COMMIT B — le render-pass v3 ne se contentait plus de persister un
 * summary dans `outline.renderResultV2`. Désormais il crée réellement
 * les `SceneImage` consommés par le reader, ce qui permet de couper
 * la pipeline legacy `narrative-pass` + `image-generation-pass` pour
 * le premium.
 *
 * Règles :
 *   - une `ChapterScene` par `StoryboardPage` (upsert par (chapterId, sceneNumber))
 *   - une `SceneImage` par panel (upsert par (sceneId, panelNumber))
 *   - on respecte `userValidatedAt` du legacy : jamais d'écrasement
 *     d'une image validée par l'utilisateur
 *   - on stocke le prompt + négatif + providers + route FAL pour traçabilité
 *   - status : "completed" si imageUrl présent, "failed" sinon
 *
 * P1.8 — Transactions Prisma par page
 *   Pour éviter les chapitres partiellement écrits, toutes les opérations DB
 *   pour une page (ChapterScene + SceneImage + MediaAsset) sont dans une
 *   transaction. Les uploads Supabase (externes) restent en dehors.
 *
 * Implémentation découpée dans `_v3-scene-image-persistence/`.
 */

import type { Prisma } from "@manga-ai-studio/db";
import { prisma } from "@manga-ai-studio/db";
import { SCENE_IMAGE_STATUS } from "@manga-ai-studio/core";
import { persistPageInTransaction } from "./_v3-scene-image-persistence/persist-page";
import { preparePanelData } from "./_v3-scene-image-persistence/prepare-panel";
import type {
  PreparedPanelData,
  V3RenderedPanelRecord,
  V3SceneImagePersistInput,
  V3SceneImagePersistResult,
} from "./_v3-scene-image-persistence/types";

export type {
  PanelFinalStatus,
  PreparedPanelData,
  V3PanelRenderAttemptLog,
  V3RenderedPanelRecord,
  V3SceneImagePersistInput,
  V3SceneImagePersistResult,
} from "./_v3-scene-image-persistence/types";

/**
 * Persiste les panels rendus par le render-pass v3 en DB.
 *
 * Idempotent : si une scène / image existe déjà pour ce
 * (chapterId, sceneNumber, panelNumber), on la met à jour.
 *
 * P1.8 — Utilise des transactions par page pour éviter les chapitres
 * partiellement écrits en cas d'erreur.
 */
export async function persistV3RenderedPanels(
  input: V3SceneImagePersistInput,
): Promise<V3SceneImagePersistResult> {
  const { chapterId, storyboardPlan, rendered } = input;
  const generationRunId = input.generationRunId ?? null;

  let scenesCreated = 0;
  let scenesReused = 0;
  let imagesUpserted = 0;
  let imagesSkipped = 0;
  let imagesPersisted = 0;
  let imagesAlreadyStable = 0;
  let imagesStorageFailed = 0;
  const warnings: string[] = [];
  const persistedPanelIds: string[] = [];
  const skippedPanelIds: Array<{ panelId: string; reason: string }> = [];

  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    select: { projectId: true },
  });
  const projectId = chapter?.projectId ?? "unknown";

  const renderedByPanelId = new Map<string, V3RenderedPanelRecord>();
  for (const record of rendered) {
    renderedByPanelId.set(record.spec.panelId, record);
  }

  for (const page of storyboardPlan.pages) {
    const preparedPanels: PreparedPanelData[] = [];

    for (const panel of page.panels) {
      const record = renderedByPanelId.get(panel.panelId);
      if (!record) {
        preparedPanels.push({
          panel,
          record: null as unknown as V3RenderedPanelRecord,
          panelNumber: panel.panelNumberInPage,
          durableImageUrl: null,
          storageMeta: { bucket: null, storageKey: null, mimeType: null },
          status: SCENE_IMAGE_STATUS.PENDING,
          metadata: {} as Prisma.InputJsonValue,
          routingDecision: {} as Prisma.InputJsonValue,
          externalPanelId: panel.panelId,
          panelBlueprintId: null,
          skipped: true,
          skipReason: `panel_not_rendered panelId=${panel.panelId} page=${page.pageNumber}`,
        });
        continue;
      }

      const { prepared, imagePersisted, imageAlreadyStable, storageFailed } = await preparePanelData(
        panel,
        record,
        page,
        projectId,
        chapterId,
      );

      if (imagePersisted) imagesPersisted += 1;
      if (imageAlreadyStable) imagesAlreadyStable += 1;
      if (storageFailed) {
        imagesStorageFailed += 1;
        prepared.skipped = true;
        prepared.skipReason = `storage_failed panelId=${panel.panelId} — URL provider NON persistée`;
      }

      preparedPanels.push(prepared);
    }

    const result = await prisma.$transaction(async (tx) =>
      persistPageInTransaction(tx, page, chapterId, projectId, preparedPanels, generationRunId),
    );

    if (result.sceneCreated) {
      scenesCreated += 1;
    } else {
      scenesReused += 1;
    }
    imagesUpserted += result.imagesUpserted;
    imagesSkipped += result.imagesSkipped;
    warnings.push(...result.warnings);
    persistedPanelIds.push(...result.persistedPanelIds);
    skippedPanelIds.push(...result.skippedPanelIds);
  }

  return {
    scenesCreated,
    scenesReused,
    imagesUpserted,
    imagesSkipped,
    imagesPersisted,
    imagesAlreadyStable,
    imagesStorageFailed,
    warnings,
    persistedPanelIds,
    skippedPanelIds,
  };
}
