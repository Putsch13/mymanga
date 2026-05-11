/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Génère / résout (avec cache) l'URL d'un `SceneKeyframe`.
 *
 * Extrait depuis `image-generation-pass.ts` :
 *   - factory `createSceneKeyframeUrlResolver(deps)` qui retourne la fonction
 *     `ensureSceneKeyframeUrl(item)` partageant un cache local par instance.
 *   - le cache est local à un appel de `runImageGenerationPass` afin d'éviter
 *     toute fuite de promesses entre runs concurrents.
 */

import { runRoutedImageGeneration, getFalImageSizePreset, type StoryboardPanel } from "@manga-ai-studio/ai";
import { prisma, type Prisma } from "@manga-ai-studio/db";
import { type StableImageReference } from "@manga-ai-studio/core";
import { buildStableImageReference, resolveStableImageReferences } from "../../stable-image-refs";
import { persistImageIfNeeded } from "../../pipeline-image-persistence";
import { persistFalTrace } from "./fal-trace";

const STD_NEGATIVE =
  "blurry, deformed hands, extra limbs, wrong hair color, inconsistent outfit, bad anatomy, watermark, text overlay, low quality, duplicate character";

export interface PlannedImageLite {
  panel: StoryboardPanel;
  baseMetadata: Record<string, unknown>;
}

export interface SceneKeyframeResolverDeps {
  projectId: string;
  chapterId: string;
  intensityLayer: string;
  adultEngine: any;
  canonRefByName: Map<string, StableImageReference>;
  loraByCharName: Map<string, { url: string; triggerWord: string; scale: number }>;
}

export type EnsureSceneKeyframeUrl = (item: PlannedImageLite) => Promise<string | null>;

export function createSceneKeyframeUrlResolver(deps: SceneKeyframeResolverDeps): EnsureSceneKeyframeUrl {
  const { projectId, chapterId, intensityLayer, adultEngine, canonRefByName, loraByCharName } = deps;
  const sceneKeyframeUrlCache = new Map<string, Promise<string | null>>();

  const persistFalTraceEntry = (entry: Omit<Parameters<typeof persistFalTrace>[0], "projectId" | "chapterId">) =>
    persistFalTrace({ ...entry, projectId, chapterId });

  return async function ensureSceneKeyframeUrl(item: PlannedImageLite): Promise<string | null> {
    const sceneKeyframeId =
      typeof item.baseMetadata.sceneKeyframeId === "string"
        ? item.baseMetadata.sceneKeyframeId
        : null;
    if (!sceneKeyframeId) return null;

    const existingPromise = sceneKeyframeUrlCache.get(sceneKeyframeId);
    if (existingPromise) return existingPromise;

    const promise = (async () => {
      const keyframe = await prisma.sceneKeyframe.findUnique({
        where: { id: sceneKeyframeId },
        include: {
          imageAsset: {
            select: {
              id: true,
              storageProvider: true,
              bucket: true,
              storageKey: true,
              publicUrl: true,
              signedUrl: true,
              falCdnUrl: true,
              sha256: true,
            },
          },
        },
      });
      if (!keyframe) return null;

      if (keyframe.imageUrl) {
        const existingKeyframeRef = buildStableImageReference({
          assetId: keyframe.imageAsset?.id ?? keyframe.imageAssetId ?? null,
          storageProvider: keyframe.imageAsset?.storageProvider ?? null,
          bucket: keyframe.imageAsset?.bucket ?? null,
          storageKey: keyframe.imageAsset?.storageKey ?? null,
          publicUrl: keyframe.imageAsset?.publicUrl ?? keyframe.imageUrl,
          signedUrl: keyframe.imageAsset?.signedUrl ?? null,
          falCdnUrl: keyframe.imageAsset?.falCdnUrl ?? null,
          sourceUrl: keyframe.imageUrl,
          sourceType: keyframe.imageAssetId ? "media_asset" : "scene_keyframe",
          checksum: keyframe.imageAsset?.sha256 ?? null,
        });
        if (!existingKeyframeRef) return keyframe.imageUrl;
        const existingResolution = await resolveStableImageReferences([existingKeyframeRef], {
          logPrefix: "[pipeline:keyframe-existing]",
        });
        return existingResolution.urls[0] ?? keyframe.imageUrl;
      }

      const metadata =
        keyframe.metadata && typeof keyframe.metadata === "object"
          ? (keyframe.metadata as Record<string, unknown>)
          : {};
      const sceneCharacterNames = Array.isArray(metadata.involvedCharacterNames)
        ? metadata.involvedCharacterNames.filter((value): value is string => typeof value === "string")
        : [];
      const keyframeReferenceResolution = await resolveStableImageReferences(
        sceneCharacterNames
          .map((name) => canonRefByName.get(name))
          .filter((value): value is StableImageReference => Boolean(value))
          .slice(0, 2),
        { logPrefix: "[pipeline:keyframe-ref]" },
      );
      const keyframeRefs = keyframeReferenceResolution.urls;
      const keyframeLoras = sceneCharacterNames
        .map((name) => loraByCharName.get(name))
        .filter((value): value is { url: string; triggerWord: string; scale: number } => Boolean(value))
        .slice(0, 2);
      const size = getFalImageSizePreset("panel_establishing");
      const generation = await runRoutedImageGeneration(
        {
          mode: "SCENE_KEYFRAME",
          contentIntensityLayer: intensityLayer,
          adultEngine,
          isNewCharacter: false,
          hasCanonReferences: keyframeRefs.length > 0 || keyframeLoras.length > 0,
          characterCountInScene: sceneCharacterNames.length,
          purpose: "establishing",
          shotType: "wide",
          environmentPriority: "high",
          locationComplexity: 80,
          environmentDensityRequired: "high",
          continuityWeight: 85,
          scenePurpose: "scene_keyframe",
          needsInpaint: false,
          needsPoseVariation: false,
          preferPhotorealCover: false,
          explicitBlocked: intensityLayer === "RESTRICTED_BLOCKED_VISUAL",
          goreStylizedMature:
            intensityLayer === "MATURE_DRAMA" ||
            intensityLayer === "MATURE_VISUAL" ||
            intensityLayer === "ADULT_EXPLICIT",
        },
        {
          mode: "SCENE_KEYFRAME",
          positivePrompt: typeof metadata.positivePrompt === "string" ? metadata.positivePrompt : item.panel.prompt,
          negativePrompt: typeof metadata.negativePrompt === "string" ? metadata.negativePrompt : STD_NEGATIVE,
          width: size.width,
          height: size.height,
          referenceImageUrls: keyframeRefs.length > 0 ? keyframeRefs : undefined,
          loras: keyframeLoras.length > 0 ? keyframeLoras : undefined,
          providerParams: {
            contentIntensityLayer: intensityLayer,
            mode: "SCENE_KEYFRAME",
            referencePolicy: keyframeRefs.length > 0 || keyframeLoras.length > 0 ? "LIGHT" : "NONE",
            panelCategory: "ESTABLISHING_ENVIRONMENT",
            scenePass: "scene_base",
          },
        },
      );

      if (!generation.ok) {
        await persistFalTraceEntry({
          sceneId: keyframe.sceneId,
          sceneKeyframeId,
          provider: "fal",
          model: "fal-ai/flux/dev",
          mode: keyframeRefs.length > 0 || keyframeLoras.length > 0 ? "img2img" : "text2img",
          status: "failed",
          requestId: null,
          jobId: null,
          requestPayload: {
            positivePrompt: typeof metadata.positivePrompt === "string" ? metadata.positivePrompt : item.panel.prompt,
            negativePrompt: typeof metadata.negativePrompt === "string" ? metadata.negativePrompt : STD_NEGATIVE,
            width: size.width,
            height: size.height,
            referenceTrace: keyframeReferenceResolution.trace,
          },
          responsePayload: generation.log,
          refsUsed: keyframeRefs,
          lorasUsed: keyframeLoras,
          error: { reason: generation.reason },
        });
        return null;
      }

      await persistFalTraceEntry({
        sceneId: keyframe.sceneId,
        sceneKeyframeId,
        provider: generation.result.provider,
        model: generation.result.model,
        mode: keyframeRefs.length > 0 || keyframeLoras.length > 0 ? "img2img" : "text2img",
        status: "completed",
        requestId: generation.result.requestId ?? null,
        jobId: generation.result.jobId ?? null,
        requestPayload: {
          positivePrompt: typeof metadata.positivePrompt === "string" ? metadata.positivePrompt : item.panel.prompt,
          negativePrompt: typeof metadata.negativePrompt === "string" ? metadata.negativePrompt : STD_NEGATIVE,
          width: size.width,
          height: size.height,
          referenceTrace: keyframeReferenceResolution.trace,
        },
        responsePayload: generation.result.raw ?? generation.log,
        refsUsed: keyframeRefs,
        lorasUsed: keyframeLoras,
        timings: generation.result.timings,
      });

      const persisted = await persistImageIfNeeded({
        imageUrl: generation.result.imageUrl,
        projectId,
        chapterId,
        sceneImageId: `scene_keyframe_${sceneKeyframeId}`,
      });
      if (!persisted.ok) {
        console.warn(
          `[pipeline:keyframe] persist failed sceneKeyframeId=${sceneKeyframeId} reason=${persisted.reason} — skipping keyframe`,
        );
        return null;
      }

      // P0.1 — on refuse de créer un MediaAsset canonique avec une URL non
      // persistée (FAL/BFL signée/temporaire). Le keyframe reste sans image
      // pour ce round — il sera retenté au prochain appel.
      if (!persisted.persisted) {
        console.warn(
          `[pipeline:keyframe] skipping non-persisted keyframe sceneKeyframeId=${sceneKeyframeId} (url already stable but no canonical storageKey)`,
        );
        return persisted.url;
      }

      const mediaAsset = await prisma.mediaAsset.create({
        data: {
          projectId,
          chapterId,
          sceneId: keyframe.sceneId,
          type: "scene_keyframe",
          origin: "generated",
          ownerType: "scene_keyframe",
          ownerId: sceneKeyframeId,
          storageProvider: "supabase",
          // P0.2 — bucket/storageKey reflètent EXACTEMENT l'upload côté
          // persistence, sans fallback reconstruit à la main.
          bucket: persisted.bucket,
          publicUrl: persisted.url,
          storageKey: persisted.storageKey,
          metadata: {
            requestId: generation.result.requestId ?? null,
            jobId: generation.result.jobId ?? null,
            // Persiste le seed FAL pour rejouer la génération du keyframe à
            // l'identique si un retry déterministe est demandé (cohérence
            // inter-panels d'une même scène).
            seed: generation.result.seed ?? null,
            generationLog: generation.log,
          } as unknown as Prisma.InputJsonValue,
        },
      });

      await prisma.sceneKeyframe.update({
        where: { id: sceneKeyframeId },
        data: {
          imageUrl: persisted.url,
          imageAssetId: mediaAsset.id,
          metadata: {
            ...metadata,
            generatedAt: new Date().toISOString(),
            persisted: persisted.persisted,
          } as unknown as Prisma.InputJsonValue,
        },
      });
      return persisted.url;
    })();

    sceneKeyframeUrlCache.set(sceneKeyframeId, promise);
    return promise;
  };
}
