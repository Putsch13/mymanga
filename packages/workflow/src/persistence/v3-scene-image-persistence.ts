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
 */

import { prisma, type Prisma } from "@manga-ai-studio/db";
import type {
  FalRenderRoute,
  PanelRenderSpec,
  StoryboardPlan,
} from "@manga-ai-studio/ai";

export interface V3RenderedPanelRecord {
  spec: PanelRenderSpec;
  prompt: { positive: string; negative: string };
  route: FalRenderRoute;
  imageUrl?: string | null;
  provider?: string | null;
  model?: string | null;
  seed?: number | null;
  error?: string | null;
}

export interface V3SceneImagePersistInput {
  chapterId: string;
  storyboardPlan: StoryboardPlan;
  rendered: V3RenderedPanelRecord[];
}

export interface V3SceneImagePersistResult {
  scenesCreated: number;
  scenesReused: number;
  imagesUpserted: number;
  imagesSkipped: number;
  warnings: string[];
}

/**
 * Persiste les panels rendus par le render-pass v3 en DB.
 *
 * Idempotent : si une scène / image existe déjà pour ce (chapterId,
 * sceneNumber, panelNumber), on la met à jour. On ne recrée pas.
 */
export async function persistV3RenderedPanels(
  input: V3SceneImagePersistInput,
): Promise<V3SceneImagePersistResult> {
  const { chapterId, storyboardPlan, rendered } = input;
  let scenesCreated = 0;
  let scenesReused = 0;
  let imagesUpserted = 0;
  let imagesSkipped = 0;
  const warnings: string[] = [];

  const renderedByPanelId = new Map<string, V3RenderedPanelRecord>();
  for (const r of rendered) {
    renderedByPanelId.set(r.spec.panelId, r);
  }

  for (const page of storyboardPlan.pages) {
    const sceneNumber = page.pageNumber;
    const existingScene = await prisma.chapterScene.findFirst({
      where: { chapterId, sceneNumber },
      select: { id: true },
    });
    let sceneId: string;
    if (existingScene) {
      sceneId = existingScene.id;
      scenesReused += 1;
    } else {
      const createdScene = await prisma.chapterScene.create({
        data: {
          chapterId,
          sceneNumber,
          title: `Page ${sceneNumber}`,
          summary: page.dramaticRole ?? null,
          metadata: {
            v3: true,
            layoutTemplate: page.layoutTemplate,
            dramaticRole: page.dramaticRole,
            beatIds: page.beatIds,
          } as unknown as Prisma.InputJsonValue,
          pageLayoutTemplate: page.layoutTemplate,
        },
        select: { id: true },
      });
      sceneId = createdScene.id;
      scenesCreated += 1;
    }

    for (const panel of page.panels) {
      const record = renderedByPanelId.get(panel.panelId);
      if (!record) {
        imagesSkipped += 1;
        warnings.push(
          `panel_not_rendered panelId=${panel.panelId} page=${page.pageNumber}`,
        );
        continue;
      }

      const panelNumber = panel.panelNumberInPage;
      const imageUrl = record.imageUrl ?? null;
      const hasImage = !!imageUrl;
      const status = record.error
        ? "failed"
        : hasImage
          ? "completed"
          : "pending";

      const metadata = {
        v3: true,
        panelId: panel.panelId,
        globalPanelIndex: panel.globalPanelIndex,
        panelPurpose: record.spec.panelPurpose,
        renderMode: record.spec.renderMode,
        shotType: record.spec.shotType,
        cameraAngle: record.spec.cameraAngle,
        subjectFocus: record.spec.subjectFocus,
        sourceBeatId: panel.sourceBeatId,
        locationName: record.spec.locationName,
        actionLine: record.spec.actionLine,
        emotionLine: record.spec.emotionLine,
      } as unknown as Prisma.InputJsonValue;

      const routingDecision = {
        modelId: record.route.modelId,
        referencePolicy: record.route.referencePolicy,
        panelCategory: record.route.panelCategory,
        sizePreset: record.route.sizePreset,
        retryPolicy: record.route.retryPolicy,
      } as unknown as Prisma.InputJsonValue;

      const data = {
        renderingMode: "PANEL_DRAFT" as const,
        prompt: record.prompt.positive,
        negativePrompt: record.prompt.negative,
        provider: record.provider ?? null,
        model: record.model ?? null,
        status,
        imageUrl,
        persistedUrl: imageUrl,
        routingDecision,
        metadata,
        failureReason: record.error ?? null,
      };

      const existingImage = await prisma.sceneImage.findUnique({
        where: {
          sceneId_panelNumber: { sceneId, panelNumber },
        },
        select: { id: true, userValidatedAt: true },
      });

      if (existingImage?.userValidatedAt) {
        await prisma.sceneImage.update({
          where: { id: existingImage.id },
          data: { metadata, routingDecision },
        });
      } else {
        await prisma.sceneImage.upsert({
          where: {
            sceneId_panelNumber: { sceneId, panelNumber },
          },
          create: { sceneId, panelNumber, ...data },
          update: data,
        });
      }
      imagesUpserted += 1;
    }
  }

  return { scenesCreated, scenesReused, imagesUpserted, imagesSkipped, warnings };
}
