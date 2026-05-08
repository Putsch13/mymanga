/**
 * persist-planned-images — écrit en DB le batch de `SceneImage` préparés
 * par narrative-pass (prompt composition + FAL routing + panel cast).
 *
 * Contraintes historiques (préservées dans cette extraction) :
 *   - micro-transactions de 8 pour limiter la durée tx à <15s
 *   - ne JAMAIS écraser une image déjà validée par l'utilisateur
 *     (respecte `userValidatedAt`) — on ne touche alors qu'aux
 *     métadonnées (panelCast, debugTrace, baseMetadata)
 *   - upsert par clé composite `sceneId + panelNumber`
 *
 * Ce module est volontairement plat : il ne décide PLUS la composition
 * du prompt, il ne FAIT PLUS de routing FAL — c'est uniquement la
 * couche "écrire ce que narrative-pass a calculé". La refonte v3
 * (render-pass.ts) court-circuite totalement cette écriture.
 */

import { prisma, type Prisma } from "@manga-ai-studio/db";
import { SCENE_IMAGE_STATUS, stripLegacyPanelTextFieldsWhenContractPresent } from "@manga-ai-studio/core";
import type { getPremiumImageSize } from "@manga-ai-studio/ai";
import type {
  LegacyPendingImageWrite,
  LegacyPlannedImage,
} from "./planned-image-types";

type PanelDraftSize = ReturnType<typeof getPremiumImageSize>;

export interface PersistPlannedImagesInput {
  pendingImageWrites: LegacyPendingImageWrite[];
  panelDraftSize: PanelDraftSize;
}

/**
 * Écrit les images planifiées par narrative-pass et retourne les
 * `LegacyPlannedImage` correspondants (avec `sceneImageId`).
 *
 * Le batch est découpé en micro-transactions de 8 (cf. commentaire
 * historique C05 dans narrative-pass.ts).
 */
export async function persistPlannedImages(
  input: PersistPlannedImagesInput,
): Promise<LegacyPlannedImage[]> {
  const plannedImages: LegacyPlannedImage[] = [];
  const { pendingImageWrites, panelDraftSize } = input;

  for (let imgBatch = 0; imgBatch < pendingImageWrites.length; imgBatch += 8) {
    const imgSlice = pendingImageWrites.slice(imgBatch, imgBatch + 8);
    await prisma.$transaction(
      async (tx) => {
        for (const pi of imgSlice) {
          const panelDebugTraceData =
            (pi.baseMetadata as Record<string, unknown>).panelDebugTrace ?? null;
          const normalizedMetadata = stripLegacyPanelTextFieldsWhenContractPresent(
            pi.baseMetadata as Record<string, unknown>,
          );
          const metaJson = normalizedMetadata as unknown as Prisma.InputJsonValue;
          const imageData = {
            renderingMode: "PANEL_DRAFT" as const,
            sceneKeyframeId: pi.sceneKeyframeId,
            prompt: pi.composedPositive,
            negativePrompt: pi.composedNegative,
            status: SCENE_IMAGE_STATUS.PLANNED,
            width: panelDraftSize.width,
            height: panelDraftSize.height,
            referenceImageIds: pi.panelCanonRefs as unknown as Prisma.InputJsonValue,
            metadata: metaJson,
            panelCast: pi.panelCast as unknown as Prisma.InputJsonValue,
            debugTrace: (panelDebugTraceData ?? null) as unknown as Prisma.InputJsonValue,
          };

          const existingImage = await tx.sceneImage.findUnique({
            where: {
              sceneId_panelNumber: {
                sceneId: pi.sceneId,
                panelNumber: pi.panelNumber,
              },
            },
            select: { id: true, userValidatedAt: true },
          });

          let created: { id: string };
          if (existingImage?.userValidatedAt) {
            created = existingImage;
            await tx.sceneImage.update({
              where: { id: existingImage.id },
              data: {
                metadata: metaJson,
                panelCast: pi.panelCast as unknown as Prisma.InputJsonValue,
                debugTrace: (panelDebugTraceData ?? null) as unknown as Prisma.InputJsonValue,
              },
            });
          } else {
            created = await tx.sceneImage.upsert({
              where: {
                sceneId_panelNumber: {
                  sceneId: pi.sceneId,
                  panelNumber: pi.panelNumber,
                },
              },
              create: {
                sceneId: pi.sceneId,
                panelNumber: pi.panelNumber,
                ...imageData,
              },
              update: imageData,
            });
          }

          plannedImages.push({
            sceneImageId: created.id,
            panel: {
              ...pi.panel,
              prompt: pi.composedPositive ?? pi.panel.prompt,
              negativePrompt: pi.composedNegative ?? pi.panel.negativePrompt,
            },
            sceneIndex: pi.sceneIndex,
            baseMetadata: normalizedMetadata,
          });
        }
      },
      { timeout: 15_000 },
    );
  }

  return plannedImages;
}
