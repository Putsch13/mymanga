/**
 * Image generation pass — recovery pass.
 *
 * Extrait de image-generation-pass.ts. Quand le nombre d'images générées est
 * inférieur au quota minimum (typiquement 75), on relance les panels en échec
 * en **mode dégradé** (PANEL_DRAFT sans refs, sans LoRA, prompts tels quels).
 * Retourne `recoveredCount` pour mettre à jour generatedCount/failedCount.
 */

import { runRoutedImageGeneration, type StoryboardPanel } from "@manga-ai-studio/ai";
import { prisma, type Prisma } from "@manga-ai-studio/db";
import { persistImageIfNeeded } from "../../pipeline-image-persistence";
import { setJobProgress } from "../../pipeline-job";

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

  for (const failedShot of failedShots.slice(0, missingCount)) {
    try {
      const recoveryResult = await runRoutedImageGeneration(
        {
          mode: "PANEL_DRAFT",
          contentIntensityLayer: intensityLayer,
          isNewCharacter: false,
          hasCanonReferences: false,
          characterCountInScene: failedShot.item.panel.characters?.length ?? 1,
          needsInpaint: false,
          needsPoseVariation: false,
          preferPhotorealCover: false,
          explicitBlocked: false,
          goreStylizedMature: false,
        },
        {
          mode: "PANEL_DRAFT",
          positivePrompt: failedShot.item.panel.prompt,
          negativePrompt: failedShot.item.panel.negativePrompt,
          width: 768,
          height: 1024,
          referenceImageUrls: [],
          providerParams: {
            contentIntensityLayer: intensityLayer,
            mode: "PANEL_DRAFT",
            referencePolicy: "NONE",
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
