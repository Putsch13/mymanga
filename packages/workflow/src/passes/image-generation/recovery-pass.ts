/**
 * Image generation pass — recovery pass.
 *
 * Extrait de image-generation-pass.ts. Quand le nombre d'images générées est
 * inférieur au quota minimum (typiquement 75), on relance les panels en échec
 * en mode PANEL_DRAFT.
 *
 * P1-2 — Garde-fous de cohérence :
 *   - on recharge le prompt **composé** depuis la DB (look profile + scene
 *     anchor déjà injectés par le manga-prompt-composer à la 1re passe),
 *     au lieu de repartir du panel.prompt brut ;
 *   - on essaie de résoudre au moins une référence canon depuis les
 *     `referenceImageIds` persistés (évite le drift visuel total) ;
 *   - on bascule `hasCanonReferences` et `referencePolicy` selon la réalité
 *     des refs disponibles — plus de flag "NONE" en dur qui désactive le
 *     character lock même quand on a des refs valides.
 */

import { runRoutedImageGeneration, type StoryboardPanel } from "@manga-ai-studio/ai";
import { prisma, type Prisma } from "@manga-ai-studio/db";
import { persistImageIfNeeded } from "../../pipeline-image-persistence";
import { setJobProgress } from "../../pipeline-job";
import type { StableImageReference } from "@manga-ai-studio/core";
import { buildStableImageReference, resolveStableImageReferences } from "../../stable-image-refs";

type PlannedImage = {
  sceneImageId: string;
  panel: StoryboardPanel;
  sceneIndex: number;
  baseMetadata: Record<string, unknown>;
};

export interface RecoveryParams {
  jobId: string;
  projectId: string;
  chapterId: string;
  intensityLayer: string;
  failedShots: ReadonlyArray<{ id: string; item: PlannedImage }>;
  generatedCount: number;
  minimumImages: number;
}

export interface RecoveryResult {
  recoveredCount: number;
  attempted: number;
}

export async function runRecoveryPass(params: RecoveryParams): Promise<RecoveryResult> {
  const { jobId, projectId, chapterId, intensityLayer, failedShots, generatedCount, minimumImages } = params;
  const missingCount = minimumImages - generatedCount;
  let recoveredCount = 0;

  if (missingCount <= 0 || failedShots.length === 0) {
    return { recoveredCount: 0, attempted: 0 };
  }

  const attempted = Math.min(missingCount, failedShots.length);
  console.log(
    `[pipeline:recovery] ${missingCount} images manquantes — relance de ${attempted} shots en mode dégradé`,
  );
  await setJobProgress(
    jobId,
    { key: "recovery_pass", label: `Récupération ${missingCount} images manquantes...` },
    "running",
  );

  // P1-2 : précharger les sceneImage pour obtenir les prompts composés + refs
  // persistées à la première passe. Ça évite de repartir d'un prompt brut sans
  // look profile ni scene anchor.
  const sceneImageIds = failedShots.slice(0, missingCount).map((fs) => fs.id);
  const persistedRows = await prisma.sceneImage.findMany({
    where: { id: { in: sceneImageIds } },
    select: { id: true, prompt: true, negativePrompt: true, referenceImageIds: true },
  });
  const persistedById = new Map(persistedRows.map((row) => [row.id, row]));

  const collectRefIds = (raw: unknown): string[] => {
    if (!Array.isArray(raw)) return [];
    const ids: string[] = [];
    for (const entry of raw) {
      if (typeof entry === "string" && entry.trim().length > 0) ids.push(entry);
    }
    return ids;
  };

  for (const failedShot of failedShots.slice(0, missingCount)) {
    try {
      const persistedRow = persistedById.get(failedShot.id);
      const composedPrompt = persistedRow?.prompt?.trim() || failedShot.item.panel.prompt;
      const composedNegative = persistedRow?.negativePrompt?.trim() || failedShot.item.panel.negativePrompt;

      // P1-2 : résoudre les refs canon stockées (MediaAsset.storageKey / publicUrl)
      const refAssetIds = collectRefIds(persistedRow?.referenceImageIds);
      let recoveryRefUrls: string[] = [];
      if (refAssetIds.length > 0) {
        const mediaAssets = await prisma.mediaAsset.findMany({
          where: { id: { in: refAssetIds.slice(0, 3) } },
          select: { id: true, bucket: true, storageKey: true, publicUrl: true, signedUrl: true, falCdnUrl: true },
        });
        const refs = mediaAssets
          .map((a): StableImageReference | null =>
            buildStableImageReference({
              assetId: a.id,
              bucket: a.bucket ?? (a.storageKey ? (process.env.STORAGE_BUCKET ?? "MyManga") : null),
              storageKey: a.storageKey ?? null,
              publicUrl: a.publicUrl ?? null,
              signedUrl: a.signedUrl ?? null,
              falCdnUrl: a.falCdnUrl ?? null,
              sourceType: a.storageKey ? "media_asset" : "legacy_url",
            }),
          )
          .filter((ref): ref is StableImageReference => ref !== null);
        if (refs.length > 0) {
          const resolved = await resolveStableImageReferences(refs, { logPrefix: "[pipeline:recovery:ref]" });
          recoveryRefUrls = resolved.urls.slice(0, 2);
        }
      }

      const hasCanonReferences = recoveryRefUrls.length > 0;
      const recoveryResult = await runRoutedImageGeneration(
        {
          mode: "PANEL_DRAFT",
          contentIntensityLayer: intensityLayer,
          isNewCharacter: false,
          hasCanonReferences,
          characterCountInScene: failedShot.item.panel.characters?.length ?? 1,
          needsInpaint: false,
          needsPoseVariation: false,
          preferPhotorealCover: false,
          explicitBlocked: false,
          goreStylizedMature: false,
        },
        {
          mode: "PANEL_DRAFT",
          positivePrompt: composedPrompt,
          negativePrompt: composedNegative,
          width: 768,
          height: 1024,
          referenceImageUrls: recoveryRefUrls,
          providerParams: {
            contentIntensityLayer: intensityLayer,
            mode: "PANEL_DRAFT",
            referencePolicy: hasCanonReferences ? "CANON_ONLY" : "NONE",
            panelCategory: "CHARACTER_IN_SCENE",
            scenePass: "single_pass",
            panelCriticality: "low",
          },
        },
      );

      if (recoveryResult.ok) {
        const persisted = await persistImageIfNeeded({
          imageUrl: recoveryResult.result.imageUrl,
          projectId,
          chapterId,
          sceneImageId: failedShot.id,
        });
        if (persisted.ok) {
          recoveredCount++;
          await prisma.sceneImage.update({
            where: { id: failedShot.id },
            data: {
              status: "completed",
              imageUrl: persisted.url,
              persistedUrl: persisted.persisted ? persisted.url : null,
              provider: recoveryResult.result.provider,
              model: recoveryResult.result.model,
              failureReason: null,
              metadata: ({
                ...failedShot.item.baseMetadata,
                recoveryPass: true,
                recoveryRefsUsed: recoveryRefUrls.length,
                recoveryHasComposedPrompt: !!persistedRow?.prompt,
                sourceUrl: recoveryResult.result.imageUrl,
              } as unknown) as Prisma.InputJsonValue,
            },
          });
        }
      }
    } catch {
      console.warn(`[pipeline:recovery] shot recovery failed for ${failedShot.id}`);
    }
  }

  console.log(
    `[pipeline:recovery] recovered=${recoveredCount}/${missingCount} failedShots=${failedShots.length}`,
  );
  await setJobProgress(
    jobId,
    { key: "recovery_pass", label: `${recoveredCount} images récupérées` },
    "completed",
  );

  return { recoveredCount, attempted };
}
