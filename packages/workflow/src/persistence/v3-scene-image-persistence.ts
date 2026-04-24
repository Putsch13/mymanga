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
import {
  buildReaderPanelSlots,
  type GenerationDebugSnapshot,
} from "@manga-ai-studio/core";
import type {
  FalRenderRoute,
  PanelRenderSpec,
  StoryboardPlan,
} from "@manga-ai-studio/ai";
import { persistImageIfNeeded, type PersistedImageResult } from "../pipeline-image-persistence";

export interface V3RenderedPanelRecord {
  spec: PanelRenderSpec;
  prompt: { positive: string; negative: string };
  route: FalRenderRoute;
  imageUrl?: string | null;
  provider?: string | null;
  model?: string | null;
  seed?: number | null;
  error?: string | null;
  renderFailure?: unknown;
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
  imagesPersisted: number;
  imagesAlreadyStable: number;
  imagesStorageFailed: number;
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
  let imagesPersisted = 0;
  let imagesAlreadyStable = 0;
  let imagesStorageFailed = 0;
  const warnings: string[] = [];

  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    select: { projectId: true },
  });
  const projectId = chapter?.projectId ?? "unknown";

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
      const providerImageUrl = record.imageUrl ?? null;

      // P0.3 — Ne jamais persister d'URL provider temporaire
      // On copie vers Supabase avant de stocker en DB
      let durableImageUrl: string | null = null;
      let storageMeta: { bucket: string | null; storageKey: string | null; mimeType: string | null } = {
        bucket: null,
        storageKey: null,
        mimeType: null,
      };

      if (providerImageUrl) {
        const persistResult: PersistedImageResult = await persistImageIfNeeded({
          imageUrl: providerImageUrl,
          projectId,
          chapterId,
          sceneImageId: panel.panelId,
          logContext: `v3-persist:${panel.panelId}`,
        });

        if (persistResult.ok && persistResult.persisted) {
          durableImageUrl = persistResult.url;
          storageMeta = {
            bucket: persistResult.bucket,
            storageKey: persistResult.storageKey,
            mimeType: persistResult.mimeType,
          };
          imagesPersisted += 1;
        } else if (persistResult.ok && !persistResult.persisted) {
          // URL déjà stable (Supabase), pas besoin de copier
          durableImageUrl = persistResult.url;
          imagesAlreadyStable += 1;
        } else {
          // Échec de persistance — on refuse de stocker l'URL provider
          warnings.push(
            `storage_failed panelId=${panel.panelId} reason=${persistResult.reason} — URL provider NON persistée`,
          );
          imagesStorageFailed += 1;
        }
      }

      const hasImage = !!durableImageUrl;
      const pageSlots = buildReaderPanelSlots({
        template: page.layoutTemplate,
        readingDirection: "rtl",
        panelIds: page.panels.map((pagePanel) => pagePanel.panelId),
      });
      const panelSlot = pageSlots.find((slot) => slot.panelId === panel.panelId) ?? null;
      const status = record.error
        ? "failed"
        : hasImage
          ? "completed"
          : "pending";

      const generationDebugSnapshot: GenerationDebugSnapshot = {
        version: "v2",
        panelId: panel.panelId,
        pageNumber: page.pageNumber,
        panelNumberInPage: panel.panelNumberInPage,
        readerLayout: {
          templateId: panel.readerTemplateId ?? `${page.layoutTemplate}_rtl`,
          readingDirection: "rtl",
          panelSlotArea: panelSlot?.area ?? null,
          panelSlotOrder: panelSlot?.order ?? null,
        },
        roster: [
          ...panel.characters.map((characterId) => ({
            entityId: characterId,
            entityType: "character" as const,
            displayName:
              record.spec.visibleCharacters.find((character) => character.characterId === characterId)?.name
              ?? characterId,
            presence: "must_show" as const,
            continuityNotes: panel.continuityNotes,
          })),
          ...(panel.npcs ?? []).map((npc) => ({
            entityId: npc.continuityId ?? npc.displayName ?? "npc",
            entityType: npc.category === "antagonist_enemy" ? ("enemy" as const) : ("npc" as const),
            displayName: npc.displayName ?? npc.continuityId ?? null,
            presence: "support" as const,
            continuityNotes: panel.continuityNotes,
          })),
        ],
        characterVisualDna: panel.characterVisualDna ?? [],
        npcVisualDna: panel.npcVisualDna ?? [],
        environmentVisualDna:
          panel.environmentVisualDna
          ?? {
            locationName: record.spec.locationName,
            anchorId: panel.visualAnchors.environmentAnchorId ?? null,
            forbiddenDrift: record.spec.constraints.forbiddenDrift ?? [],
          },
        continuity: panel.continuityState ?? {
          previousPanelId: panel.visualAnchors.previousPanelAnchorId ?? null,
          previousEnvironmentAnchorId: panel.visualAnchors.environmentAnchorId ?? null,
          notes: panel.continuityNotes,
          mustPersist: panel.mustShow,
          mustAvoid: panel.mustNotShow,
        },
        text: {
          dialogues: panel.dialogue,
          narration: panel.narration ?? null,
          sfx: panel.sfx ?? [],
          reservedZones: [],
          preferredAnchorZones: panel.textPlacementHint?.preferredAnchorZones ?? [],
          overflowStrategy: panel.textPlacementHint?.overflowStrategy ?? "caption_strip",
        },
        prompt: {
          positive: record.prompt.positive,
          negative: record.prompt.negative,
          provider: record.provider ?? null,
          model: record.model ?? null,
          routeModelId: record.route.modelId,
          referencePolicy: record.route.referencePolicy,
          seed: record.seed ?? null,
        },
        result: {
          status: status as "completed" | "failed" | "pending",
          imageUrl: durableImageUrl,
          providerImageUrl,
          storageBucket: storageMeta.bucket,
          storageKey: storageMeta.storageKey,
          error: record.error ?? null,
        },
      };

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
        dialogue: panel.dialogue,
        narration: panel.narration ?? null,
        sfx: panel.sfx ?? [],
        textMeta: panel.textPlacementHint
          ? {
              preferredAnchorZones: panel.textPlacementHint.preferredAnchorZones ?? [],
              overflowStrategy: panel.textPlacementHint.overflowStrategy ?? "caption_strip",
              overlayReadingDirection: "rtl",
            }
          : null,
        readerLayout: generationDebugSnapshot.readerLayout,
        generationDebugSnapshot,
      } as unknown as Prisma.InputJsonValue;

      const routingDecision = {
        modelId: record.route.modelId,
        referencePolicy: record.route.referencePolicy,
        panelCategory: record.route.panelCategory,
        sizePreset: record.route.sizePreset,
        retryPolicy: record.route.retryPolicy,
      } as unknown as Prisma.InputJsonValue;

      // P1.6 — Identité stable du panel pour éviter corruption
      const externalPanelId = panel.panelId;
      const panelBlueprintId = (panel as unknown as { blueprintId?: string }).blueprintId ?? null;

      const data = {
        renderingMode: "PANEL_DRAFT" as const,
        prompt: record.prompt.positive,
        negativePrompt: record.prompt.negative,
        provider: record.provider ?? null,
        model: record.model ?? null,
        status,
        imageUrl: durableImageUrl,
        persistedUrl: durableImageUrl,
        routingDecision,
        metadata,
        failureReason: record.error ?? null,
        externalPanelId,
        panelBlueprintId,
      };

      const existingImage = await prisma.sceneImage.findUnique({
        where: {
          sceneId_panelNumber: { sceneId, panelNumber },
        },
        select: { id: true, userValidatedAt: true, externalPanelId: true },
      });

      // P1.6 — Si le panel a changé d'identité narrative et qu'il est validé,
      // ne pas réutiliser cette ligne pour un autre panel
      const panelIdentityChanged = existingImage?.externalPanelId &&
        existingImage.externalPanelId !== externalPanelId;

      if (existingImage?.userValidatedAt && panelIdentityChanged) {
        // Le panel à cette position a une identité différente et est validé
        // → On ne touche pas à cette image, on signale un warning
        warnings.push(
          `skipped_validated_panel_identity_mismatch panelId=${panel.panelId} ` +
          `slot=${panelNumber} existing=${existingImage.externalPanelId}`,
        );
        imagesSkipped += 1;
        continue;
      }

      if (existingImage?.userValidatedAt && !panelIdentityChanged) {
        // Même identité, juste mise à jour des metadata
        await prisma.sceneImage.update({
          where: { id: existingImage.id },
          data: { metadata, routingDecision, externalPanelId, panelBlueprintId },
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

  return {
    scenesCreated,
    scenesReused,
    imagesUpserted,
    imagesSkipped,
    imagesPersisted,
    imagesAlreadyStable,
    imagesStorageFailed,
    warnings,
  };
}
