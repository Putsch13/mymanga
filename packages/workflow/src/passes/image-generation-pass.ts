/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  runRoutedImageGeneration,
  detectVisualDrift,
  validateGeneratedPanel,
  getFalImageSizePreset,
  computeFalSceneAssessment,
  validatePreflightPanel,
  runPanelQualityGate,
  getMaxRerolls,
  type StoryboardPanel,
  type RoutingContext,
} from "@manga-ai-studio/ai";
import {
  classifyPanelCriticality,
  getCharacterTierPolicy,
  resolveCharacterImportanceTier,
  resolveChapterLookProfile,
  validateShotCompliance,
  computePlannedCoverage,
  computeCoverageGaps,
  type StableImageReference,
  type PanelBlueprintPremium,
} from "@manga-ai-studio/core";
import { scoreVisualConsistency } from "@manga-ai-studio/visual-consistency";
import { type SceneBlueprint } from "@manga-ai-studio/world";
import { prisma, type Prisma } from "@manga-ai-studio/db";
import { buildRoutingContext } from "../pipeline-scene-builder";
import { buildStableImageReference, resolveStableImageReferences } from "../stable-image-refs";
import { persistImageIfNeeded } from "../pipeline-image-persistence";
import { setJobProgress } from "../pipeline-job";
import { computeChapterQualityReport } from "../pipeline-quality";
import {
  buildPersistedChapterRuntimeState,
  buildRuntimeDebugSummary,
  buildValidationDetails as buildSharedValidationDetails,
} from "../chapter-runtime-helpers";
import type { PipelineContext } from "../pipeline-types";

const STD_NEGATIVE =
  "blurry, deformed hands, extra limbs, wrong hair color, inconsistent outfit, bad anatomy, watermark, text overlay, low quality, duplicate character";


type PlannedImage = {
  sceneImageId: string;
  panel: StoryboardPanel;
  sceneIndex: number;
  baseMetadata: Record<string, unknown>;
};

export async function runImageGenerationPass(
  ctx: PipelineContext,
  input: {
    rawCharacters: any[];
    stylePacks: any[];
    chapter: any;
    project: any;
    intensityLayer: string;
    adultEngine: any;
    context: any;
    revisedBundle: any;
    studioSnapshot: any;
    productionSource: { source: string; fallbackUsed: boolean; legacyBridgeUsed: boolean };
    finalPanelBlueprints: any[];
    plannedImages: any[];
    chapterLookProfile: any;
    canonRefByName: Map<string, any>;
    loraByCharName: Map<string, any>;
    loraByCharId?: Map<string, any>;
    effectiveCreativeControls: any;
  },
) {
  const { jobId, chapterId, projectId, chapterNumber } = ctx;
  const {
    rawCharacters,
    stylePacks,
    chapter,
    project,
    intensityLayer,
    adultEngine,
    context,
    revisedBundle,
    studioSnapshot,
    productionSource,
    finalPanelBlueprints,
    plannedImages,
    chapterLookProfile,
    canonRefByName,
    loraByCharName,
    loraByCharId,
  } = input;

    await setJobProgress(
      jobId,
      { key: "generate_images", label: `Génération images (0/${plannedImages.length})` },
      "running",
    );

    let generatedCount = 0;
    let failedCount = 0;
    const failedShots: Array<{ id: string; item: PlannedImage }> = [];
    const sceneKeyframeUrlCache = new Map<string, Promise<string | null>>();

    async function persistFalTraceEntry(input: {
      sceneId: string;
      panelId?: string;
      sceneKeyframeId?: string;
      characterId?: string | null;
      provider: string;
      model: string;
      mode: "text2img" | "img2img" | "lora_training";
      status: "completed" | "failed";
      requestId?: string | null;
      jobId?: string | null;
      requestPayload: Record<string, unknown>;
      responsePayload: unknown;
      refsUsed?: string[];
      lorasUsed?: Array<{ url: string; triggerWord: string; scale?: number }>;
      timings?: Record<string, unknown>;
      error?: Record<string, unknown> | null;
    }) {
      return prisma.falTrace.create({
        data: {
          projectId,
          chapterId,
          sceneId: input.sceneId,
          panelId: input.panelId ?? null,
          sceneKeyframeId: input.sceneKeyframeId ?? null,
          characterId: input.characterId ?? null,
          provider: input.provider,
          model: input.model,
          mode: input.mode,
          status: input.status,
          requestId: input.requestId ?? null,
          jobId: input.jobId ?? null,
          requestPayload: input.requestPayload as Prisma.InputJsonValue,
          responsePayload: (input.responsePayload ?? {}) as Prisma.InputJsonValue,
          refsUsed: (input.refsUsed ?? []) as Prisma.InputJsonValue,
          lorasUsed: (input.lorasUsed ?? []) as Prisma.InputJsonValue,
          timings: (input.timings ?? {}) as Prisma.InputJsonValue,
          error: input.error ? (input.error as Prisma.InputJsonValue) : undefined,
        },
      });
    }

    async function ensureSceneKeyframeUrl(item: PlannedImage): Promise<string | null> {
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
          return null;
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
            storageProvider: persisted.persisted ? "supabase" : "fal",
            bucket: persisted.persisted ? (process.env.STORAGE_BUCKET ?? "mymanga-images") : null,
            publicUrl: persisted.url,
            storageKey: `scene-keyframes/${sceneKeyframeId}`,
            metadata: ({
              requestId: generation.result.requestId ?? null,
              jobId: generation.result.jobId ?? null,
              generationLog: generation.log,
            } as unknown) as Prisma.InputJsonValue,
          },
        });
        await prisma.sceneKeyframe.update({
          where: { id: sceneKeyframeId },
          data: {
            imageUrl: persisted.url,
            imageAssetId: mediaAsset.id,
            metadata: ({
              ...metadata,
              generatedAt: new Date().toISOString(),
              persisted: persisted.persisted,
            } as unknown) as Prisma.InputJsonValue,
          },
        });
        return persisted.url;
      })();

      sceneKeyframeUrlCache.set(sceneKeyframeId, promise);
      return promise;
    }

    // COST-2 : cache des décors purs (environment panels) pour éviter de regénérer le même décor
    const environmentImageCache = new Map<string, string>(); // key: location+mood → imageUrl

    // R08: Anti-repetition — track prompt hashes per scene to detect duplicate prompts
    const promptHashByScene = new Map<string, string>(); // key: sceneId → last prompt hash (truncated)

    async function processOneImage(item: PlannedImage): Promise<"ok" | "fail"> {
      const panelCharacterNames: string[] = item.panel.characters ?? [];
      const itemPanelCast = item.baseMetadata.panelCast as { focus?: { name: string } | null; supporting?: Array<{ name: string }> } | undefined;
      const castOrderedNames = itemPanelCast
        ? [itemPanelCast.focus?.name, ...(itemPanelCast.supporting ?? []).map((m) => m.name)].filter((n): n is string => Boolean(n))
        : panelCharacterNames;
      const canonRef = castOrderedNames.map((n) => canonRefByName.get(n)).find(Boolean) ?? null;
      const sceneKeyframeUrl = await ensureSceneKeyframeUrl(item);

      // R06: prefer loraByCharId (avoids homonym collision) with panelCast characterId, fallback to name
      const itemPanelCastFull = item.baseMetadata.panelCast as { focus?: { characterId?: string; name: string } | null; supporting?: Array<{ characterId?: string; name: string }> } | undefined;
      const panelLoras = (() => {
        if (loraByCharId && itemPanelCastFull) {
          const castMembers = [itemPanelCastFull.focus, ...(itemPanelCastFull.supporting ?? [])].filter(Boolean) as Array<{ characterId?: string; name: string }>;
          return castMembers
            .map((m) => (m.characterId ? loraByCharId.get(m.characterId) : loraByCharName.get(m.name)) ?? null)
            .filter((l): l is { url: string; triggerWord: string; scale: number } => Boolean(l))
            .slice(0, 2);
        }
        return castOrderedNames
          .map((n) => loraByCharName.get(n))
          .filter((l): l is { url: string; triggerWord: string; scale: number } => Boolean(l))
          .slice(0, 2);
      })();

      const sceneRefs: string[] = sceneKeyframeUrl ? [sceneKeyframeUrl] : [];
      const sceneReferenceTrace = sceneKeyframeUrl
        ? {
            requested: [{
              assetId: null,
              storageKey: null,
              sourceType: "scene_keyframe" as const,
              sourceUrl: sceneKeyframeUrl,
              resolvedUrl: sceneKeyframeUrl,
              checksum: null,
              ignoredReason: null,
            }],
            used: [{
              assetId: null,
              storageKey: null,
              sourceType: "scene_keyframe" as const,
              sourceUrl: sceneKeyframeUrl,
              resolvedUrl: sceneKeyframeUrl,
              checksum: null,
              ignoredReason: null,
            }],
            ignored: [],
          }
        : { requested: [], used: [], ignored: [] };
      const characterReferenceResolution = canonRef
        ? await resolveStableImageReferences([canonRef], { logPrefix: "[pipeline:canon-ref]" })
        : { urls: [], trace: { requested: [], used: [], ignored: [] } };
      const characterRefs = characterReferenceResolution.urls;
      const panelReferenceTrace = {
        requested: [...sceneReferenceTrace.requested, ...characterReferenceResolution.trace.requested],
        used: [...sceneReferenceTrace.used, ...characterReferenceResolution.trace.used],
        ignored: [...sceneReferenceTrace.ignored, ...characterReferenceResolution.trace.ignored],
      };
      const refs = [...sceneRefs, ...characterRefs];
      const hasCanonRef = characterRefs.length > 0 || panelLoras.length > 0;
      const panelContractMeta = item.baseMetadata.panelContract as {
        purpose?: string;
        shotType?: "wide" | "medium" | "closeup" | "extreme_closeup" | "over_shoulder";
        cameraAngle?: string;
        npcPresence?: string[];
        npcGroupPresence?: string[];
        creaturePresence?: string[];
        mustShowLocationSignals?: string[];
      } | undefined;
      const stylePackMeta = item.baseMetadata.stylePack as {
        renderFamily?: string | null;
        lineWeight?: string | null;
        shadingMode?: string | null;
        contrastProfile?: string | null;
        anatomyBias?: string | null;
        backgroundDensity?: string | null;
        cameraLanguage?: string | null;
        negativeConstraints?: string[];
      } | undefined;
      const panelCharDetails = panelCharacterNames.map((name) => {
        const c = rawCharacters.find((rc: any) => rc.name === name);
        return {
          name,
          gender: c?.gender ?? null,
          hairColor: c?.hairColor ?? null,
          eyeColor: c?.eyeColor ?? null,
          bodyDetails: c?.bodyDetails ?? null,
          appearance: c?.appearance ?? null,
          outfitDefault: c?.outfitDefault ?? null,
          wardrobeDetails: c?.wardrobeDetails ?? null,
          canonSignatureText: c?.canonSignatureText ?? null,
          forbiddenVisualDrift:
            Array.isArray(c?.forbiddenVisualDrift)
              ? c.forbiddenVisualDrift.filter((item: any): item is string => typeof item === "string")
              : null,
          canonicalReferenceAvailable: Boolean(c?.canonicalReference || c?.canonicalImageUrl),
          paletteSignature:
            c?.visualProfile && typeof c.visualProfile === "object" && "paletteSignature" in c.visualProfile
              ? String(c.visualProfile.paletteSignature ?? "")
              : null,
          accessorySignature:
            c?.wardrobeProfile && typeof c.wardrobeProfile === "object" && "accessories" in c.wardrobeProfile
              ? String(c.wardrobeProfile.accessories ?? "")
              : null,
        };
      });
      const charactersWithFingerprints = panelCharacterNames
        .map((name) => {
          const c = rawCharacters.find((rc: any) => rc.name === name);
          if (!c) return null;
          const fingerprintRaw = (c as { characterFingerprint?: unknown }).characterFingerprint;
          const fingerprint = fingerprintRaw && typeof fingerprintRaw === "object"
            ? fingerprintRaw as Record<string, unknown>
            : null;
          if (!fingerprint || Object.keys(fingerprint).length === 0) return null;
          return {
            characterId: c.id,
            characterName: c.name,
            fingerprint: fingerprint as never,
          };
        })
        .filter((c): c is NonNullable<typeof c> => c !== null);
      const panelCharacterRoles = panelCharacterNames
        .map((name) => {
          const c = rawCharacters.find((rc: any) => rc.name === name);
          return typeof c?.roleType === "string" ? c.roleType : null;
        })
        .filter((role): role is string => Boolean(role));
      const panelCharacterIds = panelCharacterNames
        .map((name) => rawCharacters.find((rc: any) => rc.name === name)?.id ?? null)
        .filter((characterId): characterId is string => Boolean(characterId));
      const panelCharacterTiers = panelCharacterNames.map((name) => {
        const character = rawCharacters.find((rc: any) => rc.name === name);
        return resolveCharacterImportanceTier({
          roleType: typeof character?.roleType === "string" ? character.roleType : null,
          recurrencePolicy: typeof character?.recurrencePolicy === "string" ? character.recurrencePolicy : null,
        });
      });
      const panelRequiresStrictQa = panelCharacterTiers.some((tier) => getCharacterTierPolicy(tier).qaExpectation === "strict");

      try {
        const preflight = validatePreflightPanel({
          panelId: item.sceneImageId,
          positivePrompt: item.panel.prompt,
          negativePrompt: item.panel.negativePrompt,
          shotType: typeof (item.baseMetadata.panelContract as Record<string, unknown> | undefined)?.shotType === "string"
            ? String((item.baseMetadata.panelContract as Record<string, unknown>).shotType)
            : null,
          purpose: typeof (item.baseMetadata.panelContract as Record<string, unknown> | undefined)?.purpose === "string"
            ? String((item.baseMetadata.panelContract as Record<string, unknown>).purpose)
            : null,
          mustShow: Array.isArray((item.baseMetadata.panelContract as Record<string, unknown> | undefined)?.mustShow)
            ? ((item.baseMetadata.panelContract as Record<string, unknown>).mustShow as string[])
            : [],
          backgroundExtras: Array.isArray((item.baseMetadata.panelContract as Record<string, unknown> | undefined)?.backgroundExtras)
            ? ((item.baseMetadata.panelContract as Record<string, unknown>).backgroundExtras as string[])
            : [],
          hasSceneKeyframe: Boolean(sceneKeyframeUrl),
          hasCharacterLock: hasCanonRef,
          characterCount: panelCharacterNames.length,
        });
        if (!preflight.ok) {
          await prisma.sceneImage.update({
            where: { id: item.sceneImageId },
            data: {
              status: "blocked",
              metadata: ({
                ...item.baseMetadata,
                preflight,
                blockedReason: preflight.reasons.join(","),
                referenceTrace: panelReferenceTrace,
              } as unknown) as Prisma.InputJsonValue,
            },
          });
          return "fail";
        }
        const itemIntentCardMeta = item.baseMetadata.intentCard as { beatEventType?: string } | undefined;
        const blueprintMeta = item.baseMetadata.premiumBlueprint as Record<string, unknown> | undefined;
        const routingCtx = buildRoutingContext(
          intensityLayer,
          item.panel,
          panelContractMeta,
          stylePackMeta,
          hasCanonRef,
          adultEngine,
          panelCharacterRoles,
          panelCharacterTiers,
          typeof item.baseMetadata.chapterLookProfileMode === "string" ? item.baseMetadata.chapterLookProfileMode : chapterLookProfile.mode,
          itemIntentCardMeta?.beatEventType ?? null,
          (blueprintMeta?.subjectFocus as RoutingContext["subjectFocus"]) ?? null,
        );
        const strategy = computeFalSceneAssessment(routingCtx);
        const panelCriticality = classifyPanelCriticality({
          shotType: panelContractMeta?.shotType,
          purpose: panelContractMeta?.purpose,
          panelCategory: strategy.panelCategory,
          pageNumber: typeof item.baseMetadata.pageNumber === "number" ? item.baseMetadata.pageNumber : null,
          panelNumber: item.panel.panelNumber,
          pagePanelCount: typeof item.baseMetadata.pagePanelCount === "number" ? item.baseMetadata.pagePanelCount : null,
          characterIds: panelCharacterIds,
          characterTiers: panelCharacterTiers,
          visualPriority:
            typeof item.baseMetadata.visualPriority === "string"
              ? item.baseMetadata.visualPriority
              : panelRequiresStrictQa
                ? "critical"
                : null,
        });

        // COST-2 : réutiliser les décors purs déjà générés dans ce chapitre (économie ~15%)
        const panelCategoryStr = strategy.panelCategory as string | null;
        const isEnvironmentPanel =
          panelCategoryStr === "ESTABLISHING_ENVIRONMENT" ||
          panelCategoryStr === "ENVIRONMENT_ONLY" ||
          (panelContractMeta?.purpose === "environment" && (panelCharacterNames.length === 0));
        if (isEnvironmentPanel) {
          const envLocation = typeof (item.baseMetadata.panelContract as Record<string, unknown> | undefined)?.environmentPrimary === "string"
            ? String((item.baseMetadata.panelContract as Record<string, unknown>).environmentPrimary)
            : (item.panel.prompt.split(" ").slice(0, 3).join("_") ?? "generic");
          const envMood = item.panel.mood ?? "neutral";
          const envCacheKey = `${envLocation}_${envMood}`.toLowerCase().replace(/\s+/g, "_");
          const cachedEnvUrl = environmentImageCache.get(envCacheKey);
          if (cachedEnvUrl) {
            await prisma.sceneImage.update({
              where: { id: item.sceneImageId },
              data: {
                status: "completed",
                imageUrl: cachedEnvUrl,
                persistedUrl: cachedEnvUrl,
                provider: "cache",
                failureReason: null,
                metadata: ({ ...item.baseMetadata, cachedFrom: envCacheKey } as unknown) as Prisma.InputJsonValue,
              },
            });
            console.log(`[pipeline] env_cache_hit sceneImageId=${item.sceneImageId} key=${envCacheKey}`);
            return "ok";
          }
        }

        const isEnvironmentSufficientForNarrativePanel = (validation: Awaited<ReturnType<typeof validateGeneratedPanel>>) => {
          if (strategy.panelCategory === "CHARACTER_LOCK" || strategy.panelCategory === "LOCAL_FIX") return true;
          const scores = validation.qualityScores;
          if (!scores) return false;
          const schoolScene = /school|lycée|lycee|école|ecole|campus|cour du lycée/i.test(item.panel.prompt);
          const visionFindings = validation.visionAnalysis?.findings.join(" | ").toLowerCase() ?? "";
          return !(
            scores.backgroundPresenceScore < 0.62
            || scores.environmentReadabilityScore < 0.6
            || (strategy.interactionCritical && scores.interactionScore < 0.58 && scores.visionScore !== null)
            || (schoolScene && /missing school architecture|generic background|fond vide/.test(visionFindings))
          );
        };

        const pickRerollKind = (
          validation: Awaited<ReturnType<typeof validateGeneratedPanel>>,
          driftPass: boolean,
        ): "REROLL_ENVIRONMENT" | "REROLL_CHARACTER_FIDELITY" | "REROLL_INTERACTION" | "REROLL_STYLE" | "REROLL_COMPOSITION" => {
          const scores = validation.qualityScores;
          if (!scores) return "REROLL_COMPOSITION";
          if (scores.backgroundPresenceScore < 0.62 || scores.environmentReadabilityScore < 0.6) return "REROLL_ENVIRONMENT";
          if (strategy.interactionCritical && scores.interactionScore < 0.58 && scores.visionScore !== null) return "REROLL_INTERACTION";
          if (!driftPass || validation.issues.some((issue) => issue.type === "missing_character" || issue.type === "wrong_hair" || issue.type === "wrong_outfit")) {
            return "REROLL_CHARACTER_FIDELITY";
          }
          if (validation.issues.some((issue) => issue.type === "style_drift")) return "REROLL_STYLE";
          return "REROLL_COMPOSITION";
        };

        const rankCandidate = (
          validation: Awaited<ReturnType<typeof validateGeneratedPanel>>,
          drift: ReturnType<typeof detectVisualDrift>,
        ) => {
          const scores = validation.qualityScores;
          const release = scores?.releaseScore ?? validation.score;
          return release
            + (scores?.backgroundPresenceScore ?? 0) * 0.2
            + (scores?.interactionScore ?? 0) * 0.15
            + (drift.pass ? 0.05 : -0.08);
        };

        const generateAttempt = async (params: {
          scenePass: "scene_base" | "character_reinforcement" | "reroll";
          referencePolicy: "NONE" | "LIGHT" | "STRONG";
          positivePrompt: string;
          negativePrompt: string;
          sizePreset: "character_ref" | "panel_story" | "panel_establishing" | "reroll_local" | "reroll_scene";
          rerollKind?: "REROLL_ENVIRONMENT" | "REROLL_CHARACTER_FIDELITY" | "REROLL_INTERACTION" | "REROLL_STYLE" | "REROLL_COMPOSITION";
          seed?: number;
        }) => {
          const size = getFalImageSizePreset(params.sizePreset);
          const requestPayload = {
            positivePrompt: params.positivePrompt,
            negativePrompt: params.negativePrompt,
            width: size.width,
            height: size.height,
            loras: params.referencePolicy === "NONE" ? [] : panelLoras,
            referenceImageUrls:
              params.referencePolicy === "NONE"
                ? sceneRefs
                : refs,
            referenceTrace: panelReferenceTrace,
            providerParams: {
              contentIntensityLayer: intensityLayer,
              mode: "PANEL_DRAFT",
              seed: params.seed,
              referencePolicy: params.referencePolicy,
              panelCategory: strategy.panelCategory,
              scenePass: params.scenePass,
              rerollKind: params.rerollKind,
              // COST-1 : injecter la criticité pour le choix schnell vs dev
              panelCriticality: panelCriticality.level,
            },
          };
          const generation = await runRoutedImageGeneration(routingCtx, {
            mode: "PANEL_DRAFT",
            positivePrompt: params.positivePrompt,
            negativePrompt: params.negativePrompt,
            width: size.width,
            height: size.height,
            loras: params.referencePolicy === "NONE" ? undefined : (panelLoras.length > 0 ? panelLoras : undefined),
            referenceImageUrls:
              params.referencePolicy === "NONE"
                ? (sceneRefs.length > 0 ? sceneRefs : undefined)
                : (refs.length > 0 ? refs : undefined),
            providerParams: requestPayload.providerParams,
          });
          await persistFalTraceEntry({
            sceneId: String(item.baseMetadata.sceneId ?? ""),
            panelId: item.sceneImageId,
            sceneKeyframeId: typeof item.baseMetadata.sceneKeyframeId === "string" ? item.baseMetadata.sceneKeyframeId : undefined,
            characterId: charactersWithFingerprints[0]?.characterId ?? undefined,
            provider: generation.ok ? generation.result.provider : "fal",
            model: generation.ok ? generation.result.model : String(routingCtx.mode),
            mode: params.referencePolicy === "NONE" && panelLoras.length === 0 ? "text2img" : "img2img",
            status: generation.ok ? "completed" : "failed",
            requestId: generation.ok ? generation.result.requestId ?? null : null,
            jobId: generation.ok ? generation.result.jobId ?? null : null,
            requestPayload,
            responsePayload: generation.ok ? (generation.result.raw ?? generation.log) : generation.log,
            refsUsed: requestPayload.referenceImageUrls as string[],
            lorasUsed: requestPayload.loras as Array<{ url: string; triggerWord: string; scale?: number }>,
            timings: generation.ok ? generation.result.timings : undefined,
            error: generation.ok ? null : { reason: generation.reason },
          });
          return generation;
        };

        const validateAttempt = async (
          generation: Awaited<ReturnType<typeof generateAttempt>>,
          referencePolicy: "NONE" | "LIGHT" | "STRONG",
        ) => {
          if (!generation.ok) return null;
          const validation = await validateGeneratedPanel({
            panelId: item.sceneImageId,
            imageUrl: generation.result.imageUrl,
            requiredCharacters: charactersWithFingerprints,
            metadata: {
              prompt: item.panel.prompt,
              negativePrompt: item.panel.negativePrompt,
              model: generation.result.model,
              sceneBlueprint: item.baseMetadata.sceneBlueprint as SceneBlueprint,
              panelContract: item.baseMetadata.panelContract as {
                shotType?: string;
                purpose?: string;
                mustShow?: string[];
                backgroundExtras?: string[];
              },
              stylePack: stylePackMeta,
              panelQa: {
                pageNumber: typeof item.baseMetadata.pageNumber === "number" ? item.baseMetadata.pageNumber : null,
                panelNumber: item.panel.panelNumber,
                pagePanelCount: typeof item.baseMetadata.pagePanelCount === "number" ? item.baseMetadata.pagePanelCount : null,
                panelCategory: strategy.panelCategory,
                visualPriority: typeof item.baseMetadata.visualPriority === "string" ? item.baseMetadata.visualPriority : null,
                characterRoles: panelCharacterRoles,
                characterIds: panelCharacterIds,
                explicitCriticality: panelCriticality,
              },
            },
          });
          const panelItemLookProfile = typeof (item.baseMetadata.chapterLookProfileMode) === "string"
            ? resolveChapterLookProfile(item.baseMetadata.chapterLookProfileMode as Parameters<typeof resolveChapterLookProfile>[0])
            : chapterLookProfile;
          const panelItemIntentCard = item.baseMetadata.intentCard as Parameters<typeof detectVisualDrift>[0]["intentCard"] | undefined;
          const panelItemSceneAnchor = item.baseMetadata.sceneAnchor as Parameters<typeof detectVisualDrift>[0]["sceneAnchor"] | undefined;
          const panelCharDetailsWithTraits = panelCharDetails.map((charDetail) => {
            const raw = rawCharacters.find((rc: any) => rc.name === charDetail.name);
            const fp = raw?.characterFingerprint && typeof raw.characterFingerprint === "object"
              ? raw.characterFingerprint as Record<string, unknown>
              : null;
            return {
              ...charDetail,
              hardTraits: Array.isArray(fp?.hardTraits)
                ? (fp!.hardTraits as string[]).filter((t): t is string => typeof t === "string")
                : null,
              softTraits: Array.isArray(fp?.softTraits)
                ? (fp!.softTraits as string[]).filter((t): t is string => typeof t === "string")
                : null,
            };
          });
          const drift = detectVisualDrift({
            prompt: item.panel.prompt,
            characters: panelCharDetailsWithTraits,
            usedLoras: referencePolicy !== "NONE" && panelLoras.length > 0,
            usedRefs: referencePolicy !== "NONE" && characterRefs.length > 0,
            panelCategory: strategy.panelCategory ?? null,
            beatEventType: panelItemIntentCard?.beatEventType ?? (typeof (item.baseMetadata.panelContract as Record<string, unknown> | undefined)?.purpose === "string"
              ? String((item.baseMetadata.panelContract as Record<string, unknown>).purpose)
              : null),
            chapterLookProfile: panelItemLookProfile,
            sceneAnchor: panelItemSceneAnchor ?? null,
            intentCard: panelItemIntentCard ?? null,
          });
          return {
            generation,
            validation,
            drift,
            validationScore: validation.score,
            validationDetails: buildSharedValidationDetails(validation),
            rerollKind: pickRerollKind(validation, drift.pass),
          };
        };

        const baseReferencePolicy = strategy.panelCategory === "ESTABLISHING_ENVIRONMENT" ? "NONE" : (strategy.referencePolicy ?? "LIGHT");

        // R08: Anti-repetition — detect identical consecutive prompts within a scene
        let effectivePrompt = item.panel.prompt;
        let antiRepeatSeed: number | undefined;
        const promptHash = (effectivePrompt ?? "").slice(0, 200);
        const sceneId = String(item.baseMetadata.sceneId ?? "");
        const prevHash = promptHashByScene.get(sceneId);
        if (prevHash && prevHash === promptHash && promptHash.length > 0) {
          antiRepeatSeed = Math.floor(Math.random() * 2147483647);
          const shotVariation = item.baseMetadata.panelDebugTrace && typeof (item.baseMetadata.panelDebugTrace as Record<string, unknown>).shotPlan === "object"
            ? `, ${((item.baseMetadata.panelDebugTrace as Record<string, unknown>).shotPlan as Record<string, unknown>)?.cameraAngle ?? "different angle"}`
            : ", slightly different camera angle";
          effectivePrompt = (effectivePrompt ?? "") + shotVariation;
          console.log(`[pipeline:anti-repeat] panel ${item.panel.panelNumber} hash collision with previous in scene ${sceneId}, applying seed=${antiRepeatSeed}`);
        }
        promptHashByScene.set(sceneId, promptHash);

        let bestAttempt = await validateAttempt(
          await generateAttempt({
            scenePass: strategy.panelCategory === "ESTABLISHING_ENVIRONMENT" ? "scene_base" : "character_reinforcement",
            referencePolicy: baseReferencePolicy,
            positivePrompt: effectivePrompt,
            negativePrompt: item.panel.negativePrompt,
            sizePreset: strategy.sizePreset,
            seed: antiRepeatSeed,
          }),
          baseReferencePolicy,
        );

        if (!bestAttempt) {
          await prisma.sceneImage.update({
            where: { id: item.sceneImageId },
            data: {
              status: "blocked",
              failureReason: "initial_generation_failed",
              metadata: ({
                ...item.baseMetadata,
                blockedReason: "initial_generation_failed",
                referenceTrace: panelReferenceTrace,
              } as unknown) as Prisma.InputJsonValue,
            },
          });
          return "fail";
        }

        const sceneFirstEligible =
          strategy.panelCategory === "ESTABLISHING_ENVIRONMENT"
          || strategy.crowdCritical
          || strategy.interactionCritical;
        let rerollCount = 0;

        if (
          sceneFirstEligible
          && strategy.continuityCritical
          && hasCanonRef
          && isEnvironmentSufficientForNarrativePanel(bestAttempt.validation)
        ) {
          const reinforcementAttempt = await validateAttempt(
            await generateAttempt({
              scenePass: "character_reinforcement",
              referencePolicy: "LIGHT",
              positivePrompt: `${item.panel.prompt}, preserve character continuity while keeping full scene composition and readable environment`,
              negativePrompt: item.panel.negativePrompt,
              sizePreset: "reroll_scene",
            }),
            "LIGHT",
          );
          if (
            reinforcementAttempt
            && rankCandidate(reinforcementAttempt.validation, reinforcementAttempt.drift) >= rankCandidate(bestAttempt.validation, bestAttempt.drift) - 0.04
          ) {
            bestAttempt = reinforcementAttempt;
            rerollCount++;
          }
        }

        // B1-2 : MAX_REROLL basé sur la criticité du panel (pas hardcodé)
        const MAX_REROLL = getMaxRerolls(panelCriticality.level, strategy.retryPolicy);
        const shouldReroll =
          bestAttempt.validation.requiredReroll
          || !bestAttempt.drift.pass
          || !isEnvironmentSufficientForNarrativePanel(bestAttempt.validation);

        if (shouldReroll && MAX_REROLL > 0) {
          console.warn(`[pipeline] reroll required panel=${item.sceneImageId} kind=${bestAttempt.rerollKind} score=${bestAttempt.validationScore.toFixed(2)}`);
          for (let attempt = 0; attempt < MAX_REROLL; attempt++) {
            const strongerEnvironmentPrompt =
              bestAttempt.rerollKind === "REROLL_ENVIRONMENT" || bestAttempt.rerollKind === "REROLL_COMPOSITION"
                ? [
                    "wide manga panel with readable environment",
                    "clear foreground midground background separation",
                    ...(Array.isArray((item.baseMetadata.panelContract as Record<string, unknown> | undefined)?.mustShow)
                      ? ((item.baseMetadata.panelContract as Record<string, unknown>).mustShow as string[])
                      : []
                    ).slice(0, 5),
                  ].join(", ")
                : "";
            const strongerInteractionPrompt =
              bestAttempt.rerollKind === "REROLL_INTERACTION"
                ? "social interaction must be obvious, body language and environment reaction clearly readable"
                : "";
            const strongerCharacterPrompt =
              bestAttempt.rerollKind === "REROLL_CHARACTER_FIDELITY"
                ? "same hero face, same hair, same outfit, same silhouette, preserve character continuity"
                : "";
            const rerollPolicy =
              bestAttempt.rerollKind === "REROLL_CHARACTER_FIDELITY"
                ? "STRONG"
                : bestAttempt.rerollKind === "REROLL_ENVIRONMENT" || bestAttempt.rerollKind === "REROLL_COMPOSITION"
                  ? "NONE"
                  : "LIGHT";
            const rerollAttempt = await validateAttempt(
              await generateAttempt({
                scenePass: "reroll",
                referencePolicy: rerollPolicy,
                positivePrompt: [item.panel.prompt, strongerEnvironmentPrompt, strongerInteractionPrompt, strongerCharacterPrompt].filter(Boolean).join(", "),
                negativePrompt: [
                  item.panel.negativePrompt,
                  bestAttempt.rerollKind === "REROLL_ENVIRONMENT" ? "empty background, studio backdrop, flat grey backdrop, blurry environment" : "",
                  bestAttempt.rerollKind === "REROLL_INTERACTION" ? "weak social interaction, disconnected characters" : "",
                  bestAttempt.rerollKind === "REROLL_CHARACTER_FIDELITY" ? "wrong hair color, wrong outfit, inconsistent face" : "",
                ].filter(Boolean).join(", "),
                sizePreset:
                  bestAttempt.rerollKind === "REROLL_ENVIRONMENT" || bestAttempt.rerollKind === "REROLL_COMPOSITION"
                    ? "reroll_scene"
                    : "reroll_local",
                rerollKind: bestAttempt.rerollKind,
                seed: Date.now() + attempt,
              }),
              rerollPolicy,
            );
            rerollCount++;
            if (rerollAttempt && rankCandidate(rerollAttempt.validation, rerollAttempt.drift) > rankCandidate(bestAttempt.validation, bestAttempt.drift)) {
              bestAttempt = rerollAttempt;
              if (!bestAttempt.validation.requiredReroll && bestAttempt.drift.pass && isEnvironmentSufficientForNarrativePanel(bestAttempt.validation)) {
                break;
              }
            }
          }
        }

        // ── Shot compliance — vérifier que le panel respecte son blueprint ──
        const panelBlueprint = finalPanelBlueprints.find(
          (bp: any) => bp.panelId === (item.baseMetadata.panelId as string | undefined)
             || bp.beatId === (item.baseMetadata.beatId as string | undefined),
        );

        if (panelBlueprint && rerollCount < MAX_REROLL) {
          const qScores = bestAttempt.validation.qualityScores as { backgroundPresenceScore?: number } | undefined;
          const renderedAnalysis = {
            detectedSubjects: [
              ...(bestAttempt.validation.issues ?? []).map((i: { type: string }) => i.type),
              ...((qScores?.backgroundPresenceScore ?? 0) > 0.5 ? ["environment"] : ["hero"]),
            ],
            hasVisibleEnvironment: qScores ? (qScores.backgroundPresenceScore ?? 0) > 0.5 : undefined,
            dominantSubject: (qScores?.backgroundPresenceScore ?? 0) < 0.4 ? "hero" : "environment",
          };

          const shotCompliance = validateShotCompliance(
            item.sceneImageId,
            panelBlueprint,
            renderedAnalysis,
          );

          if (!shotCompliance.passed) {
            console.warn(
              `[pipeline:shot-compliance] panel=${item.sceneImageId} failures=${shotCompliance.failures.join(", ")}`,
            );
            const needsEnemyReroll = shotCompliance.failures.includes("enemy_required_but_not_detected");
            const missingSubjects = shotCompliance.failures
              .filter(f => f.startsWith("missing_required_subject:"))
              .map(f => f.replace("missing_required_subject:", ""));

            if (needsEnemyReroll || missingSubjects.length > 0) {
              const extraPositive = [
                needsEnemyReroll
                  ? "REQUIRED: enemy/adversary/guard clearly present and readable. Do not replace with hero portrait."
                  : "",
                missingSubjects.length > 0
                  ? `REQUIRED subjects visible: ${missingSubjects.join(", ")}`
                  : "",
              ].filter(Boolean).join(", ");

              const complianceAttempt = await validateAttempt(
                await generateAttempt({
                  scenePass: "reroll",
                  referencePolicy: "LIGHT",
                  positivePrompt: [item.panel.prompt, extraPositive].filter(Boolean).join(", "),
                  negativePrompt: item.panel.negativePrompt,
                  sizePreset: "reroll_local",
                  rerollKind: "REROLL_COMPOSITION",
                  seed: Date.now() + 999,
                }),
                "LIGHT",
              );
              rerollCount++;

              if (
                complianceAttempt &&
                rankCandidate(complianceAttempt.validation, complianceAttempt.drift) >=
                  rankCandidate(bestAttempt.validation, bestAttempt.drift) - 0.05
              ) {
                bestAttempt = complianceAttempt;
                console.log(`[pipeline:shot-compliance] compliance reroll accepted panel=${item.sceneImageId}`);
              }
            }
          }
        }
        // ── Fin shot compliance ───────────────────────────────────────────────

        const persisted = await persistImageIfNeeded({
          imageUrl: bestAttempt.generation.result.imageUrl,
          projectId,
          chapterId,
          sceneImageId: item.sceneImageId,
        });

        if (!persisted.ok) {
          const persistError = (persisted as { error?: string }).error ?? "persist_failed";
          await prisma.sceneImage.update({
            where: { id: item.sceneImageId },
            data: {
              status: "failed",
              failureReason: `persist_failed: ${persistError}`,
              metadata: ({
                ...item.baseMetadata,
                error: persistError,
                sourceUrl: bestAttempt.generation.result.imageUrl,
                generationLog: bestAttempt.generation.log,
                referenceTrace: panelReferenceTrace,
              } as unknown) as Prisma.InputJsonValue,
            },
          });
          return "fail";
        }

        const finalLog = bestAttempt.generation.log;
        const finalRouting = bestAttempt.generation.routing;
        const finalProvider = bestAttempt.generation.result.provider;
        const finalModel = bestAttempt.generation.result.model;
        const primaryCharacterId =
          charactersWithFingerprints[0]?.characterId
          ?? rawCharacters.find((character: any) => character.name === item.panel.characters[0])?.id;
        const visualConsistency =
          primaryCharacterId
            ? await scoreVisualConsistency(prisma, {
                imageId: item.sceneImageId,
                characterId: primaryCharacterId,
                generatedMetadata: {
                  prompt: item.panel.prompt,
                },
              })
            : null;
        const combinedConsistencyScore =
          bestAttempt.validationDetails?.qualityScores?.releaseScore != null
            ? visualConsistency
              ? (bestAttempt.validationDetails.qualityScores.releaseScore + visualConsistency.overall) / 2
              : bestAttempt.validationDetails.qualityScores.releaseScore
            : bestAttempt.drift.score;
        const shouldBlockForReview =
          bestAttempt.validation.requiredReroll
          || (bestAttempt.validation.qaWasRequired === true && bestAttempt.validation.qaWasExecuted !== true);

        const existingDebugTrace = (item.baseMetadata as Record<string, unknown>).panelDebugTrace as Record<string, unknown> | undefined;
        const enrichedDebugTrace = existingDebugTrace ? {
          ...existingDebugTrace,
          refsUsed: characterRefs.map((r: any) => r.resolvedUrl ?? r.url ?? "").filter(Boolean),
          lorasUsed: panelLoras.map((l: any) => ({ url: l.url, triggerWord: l.triggerWord, scale: l.scale })),
          qualityGateResult: {
            driftScore: bestAttempt.drift.score,
            driftPass: bestAttempt.drift.pass,
            validationScore: bestAttempt.validationScore,
          },
          rerollHistory: rerollCount > 0 ? [{ count: rerollCount, kind: bestAttempt.rerollKind ?? null }] : [],
        } : null;

        await prisma.sceneImage.update({
          where: { id: item.sceneImageId },
          data: {
            imageUrl: persisted.url,
            persistedUrl: persisted.persisted ? persisted.url : null,
            provider: finalProvider,
            model: finalModel,
            status: shouldBlockForReview ? "blocked" : "completed",
            consistencyScore: combinedConsistencyScore,
            routingDecision: finalRouting as unknown as Prisma.InputJsonValue,
            ...(enrichedDebugTrace ? { debugTrace: enrichedDebugTrace as unknown as Prisma.InputJsonValue } : {}),
            metadata: ({
              ...item.baseMetadata,
              generationLog: finalLog,
              falStrategy: finalRouting,
              persisted: persisted.persisted,
              temporary: "temporary" in persisted ? (persisted.temporary as boolean) : undefined,
              storageWarning: "warning" in persisted ? (persisted.warning as string) : undefined,
              sourceUrl: bestAttempt.generation.result.imageUrl,
              requestedCanonicalRef: canonRef?.sourceUrl ?? canonRef?.publicUrl ?? canonRef?.signedUrl ?? canonRef?.falCdnUrl ?? null,
              canonRefUsed: characterReferenceResolution.trace.used[0]?.resolvedUrl ?? null,
              referenceTrace: panelReferenceTrace,
              driftScore: bestAttempt.drift.score,
              driftPass: bestAttempt.drift.pass,
              driftSeverity: bestAttempt.drift.severity,
              driftIssues: bestAttempt.drift.issues.slice(0, 5),
              driftReasons: bestAttempt.drift.reasons.slice(0, 8),
              driftMissingTraits: bestAttempt.drift.missingTraits.slice(0, 6),
              driftConflictingTraits: bestAttempt.drift.conflictingTraits.slice(0, 6),
              // Phase 8 : sous-scores drift 2.0
              styleDriftScore: bestAttempt.drift.styleDriftScore,
              characterDriftScore: bestAttempt.drift.characterDriftScore,
              beatAlignmentScore: bestAttempt.drift.beatAlignmentScore,
              sceneContinuityScore: bestAttempt.drift.sceneContinuityScore,
              chapterLookMismatch: bestAttempt.drift.chapterLookMismatch,
              driftRecommendedAction: bestAttempt.drift.recommendedAction,
              driftConfidence: bestAttempt.drift.confidence,
              // Phase 12 : panel quality gate
              panelQualityGate: (() => {
                const intentMeta = item.baseMetadata.intentCard as { beatEventType?: string; motionLevel?: number; sfxForbiddenTypes?: string[]; mustShow?: string[] } | undefined;
                const panelSfxRaw = Array.isArray(item.baseMetadata.sfx) ? item.baseMetadata.sfx as string[] : (typeof item.baseMetadata.sfx === "string" ? [item.baseMetadata.sfx] : null);
                return runPanelQualityGate({
                  panelPrompt: item.panel.prompt,
                  beatEventType: intentMeta?.beatEventType ?? null,
                  motionLevel: intentMeta?.motionLevel ?? undefined,
                  sfx: panelSfxRaw,
                  chapterLookProfileMode: chapterLookProfile.mode,
                  sfxForbiddenTypes: intentMeta?.sfxForbiddenTypes ?? null,
                  mustShow: intentMeta?.mustShow ?? null,
                });
              })(),
              promptVisualConsistency: visualConsistency,
              validationScore: bestAttempt.validationScore,
              validationDetails: bestAttempt.validationDetails,
              panelCriticality: bestAttempt.validation.panelCriticality,
              qaWasRequired: bestAttempt.validation.qaWasRequired,
              qaWasExecuted: bestAttempt.validation.qaWasExecuted,
              qaFailureReason: bestAttempt.validation.qaFailureReason,
              qaBypassReason: bestAttempt.validation.qaBypassReason,
              criticalQaBlocked: shouldBlockForReview,
              panelCharacterRoles,
              characterIds: panelCharacterIds,
              rerollCount,
              rerollKind: bestAttempt.rerollKind,
              scenePass: finalRouting.panelCategory === "ESTABLISHING_ENVIRONMENT" ? "scene_first" : "single_or_light_ref",
            } as unknown) as Prisma.InputJsonValue,
          },
        });

        // COST-2 : stocker dans le cache si c'est un environment panel réussi
        if (isEnvironmentPanel && persisted.url) {
          const envLocation = typeof (item.baseMetadata.panelContract as Record<string, unknown> | undefined)?.environmentPrimary === "string"
            ? String((item.baseMetadata.panelContract as Record<string, unknown>).environmentPrimary)
            : (item.panel.prompt.split(" ").slice(0, 3).join("_") ?? "generic");
          const envMood = item.panel.mood ?? "neutral";
          const envCacheKey = `${envLocation}_${envMood}`.toLowerCase().replace(/\s+/g, "_");
          environmentImageCache.set(envCacheKey, persisted.url);
        }

        return "ok";
      } catch (imgError) {
        const msg = imgError instanceof Error ? imgError.message : "image_error";
        console.error(`[pipeline] image failed sceneImageId=${item.sceneImageId} error=${msg}`);
        await prisma.sceneImage.update({
          where: { id: item.sceneImageId },
          data: {
            status: "failed",
            failureReason: msg,
            retryCount: { increment: 1 },
            metadata: ({
              ...item.baseMetadata,
              error: msg,
            } as unknown) as Prisma.InputJsonValue,
          },
        });
        return "fail";
      }
    }

    // Round-robin : séquentiel intra-scène, parallèle inter-scènes.
    // IMPORTANT: FAL limite à 10 requêtes concurrentes; on reste bien en dessous
    // pour éviter les 429 + cascades de timeouts/aborts.
    const maxParallelImageGenerations = Math.max(
      1,
      Number.parseInt(process.env.IMAGE_GEN_MAX_PARALLEL ?? "4", 10) || 4,
    );
    const imagesByScene = new Map<number, PlannedImage[]>();
    for (const img of plannedImages) {
      const arr = imagesByScene.get(img.sceneIndex) ?? [];
      arr.push(img);
      imagesByScene.set(img.sceneIndex, arr);
    }
    const sceneIndexes = [...imagesByScene.keys()].sort((a, b) => a - b);
    const maxPanelsPerScene = Math.max(...sceneIndexes.map((s) => imagesByScene.get(s)?.length ?? 0), 0);

    for (let round = 0; round < maxPanelsPerScene; round++) {
      const roundBatch: PlannedImage[] = [];
      for (const scIdx of sceneIndexes) {
        const sceneImages = imagesByScene.get(scIdx);
        if (sceneImages && round < sceneImages.length) {
          roundBatch.push(sceneImages[round]!);
        }
      }
      if (roundBatch.length === 0) continue;

      for (let start = 0; start < roundBatch.length; start += maxParallelImageGenerations) {
        const chunk = roundBatch.slice(start, start + maxParallelImageGenerations);
        const results = await Promise.all(chunk.map(processOneImage));
        for (let ri = 0; ri < results.length; ri++) {
          if (results[ri] === "ok") generatedCount++;
          else {
            failedCount++;
            failedShots.push({ id: chunk[ri]!.sceneImageId, item: chunk[ri]! });
          }
        }
      }
      await setJobProgress(
        jobId,
        {
          key: "generate_images",
          label: `Génération images (${generatedCount}/${plannedImages.length})`,
          detail: failedCount > 0 ? `${failedCount} échec(s)` : undefined,
        },
        "running",
      );
    }

    await setJobProgress(
      jobId,
      {
        key: "generate_images",
        label: `Images générées (${generatedCount}/${plannedImages.length})`,
        detail: failedCount > 0 ? `${failedCount} échec(s)` : undefined,
      },
      failedCount === plannedImages.length ? "failed" : "completed",
    );

    // ── Recovery pass — garantir le quota minimal d'images ──────────────────
    const minimumImages = (typeof (chapter as Record<string, unknown>).minimumImages === "number"
      ? (chapter as Record<string, unknown>).minimumImages as number
      : 75);
    const missingCount = minimumImages - generatedCount;
    let recoveredCount = 0;

    if (missingCount > 0 && failedShots.length > 0) {
      console.log(`[pipeline:recovery] ${missingCount} images manquantes — relance de ${Math.min(missingCount, failedShots.length)} shots en mode dégradé`);
      await setJobProgress(jobId, { key: "recovery_pass", label: `Récupération ${missingCount} images manquantes...` }, "running");

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

      console.log(`[pipeline:recovery] recovered=${recoveredCount}/${missingCount} failedShots=${failedShots.length}`);
      await setJobProgress(jobId, { key: "recovery_pass", label: `${recoveredCount} images récupérées` }, "completed");

      generatedCount += recoveredCount;
      failedCount = Math.max(0, failedCount - recoveredCount);
    }

    console.log(`[pipeline:chapter-summary] ${JSON.stringify({
      chapterId,
      targetImages: minimumImages,
      plannedShots: plannedImages.length,
      attemptedShots: plannedImages.length,
      succeededShots: generatedCount - recoveredCount,
      recoveredShots: recoveredCount,
      failedShots: failedCount,
      finalImages: generatedCount,
      status: generatedCount >= minimumImages ? "COMPLETED" : "FAILED_INCOMPLETE",
    })}`);

    // ── Couverture planifiée vs rendue ────────────────────────────────────
    const plannedCoverage = computePlannedCoverage(finalPanelBlueprints as any);
    const renderedBps = plannedImages
      .map((img: any) =>
        finalPanelBlueprints.find(
          (bp: any) => bp.panelId === (img.baseMetadata.panelId as string | undefined)
             || bp.beatId === (img.baseMetadata.beatId as string | undefined),
        )
      )
      .filter((bp: any): bp is PanelBlueprintPremium => bp !== undefined);
    const renderedCoverage = computePlannedCoverage(renderedBps);
    const coverageGaps = computeCoverageGaps(plannedCoverage, renderedCoverage);
    const criticalGaps = coverageGaps.filter(g => g.severity === "critical");
    if (criticalGaps.length > 0) {
      console.warn(
        `[pipeline:coverage-gaps] ${criticalGaps
          .map(g => `${g.metric}: planned=${(g.planned * 100).toFixed(0)}% rendered=${(g.rendered * 100).toFixed(0)}%`)
          .join(" | ")}`,
      );
    } else {
      console.log(`[pipeline:coverage] OK enemy=${(renderedCoverage.enemyCoverage * 100).toFixed(0)}% npc=${(renderedCoverage.npcCoverage * 100).toFixed(0)}% cutaway=${(renderedCoverage.cutawayCoverage * 100).toFixed(0)}%`);
    }
    // ── Fin couverture ────────────────────────────────────────────────────

    // ── Couverture de chapitre (hero shot) ────────────────────────────────
    let coverUrl: string | null = null;
    try {
      const { composeCoverPrompt, inferCoverMood } = await import("@manga-ai-studio/ai");
      const coverMood = inferCoverMood(context.project.tone ?? "dramatique", context.project.primaryGenre ?? "fantasy");
      const coverPrompt = composeCoverPrompt({
        chapterTitle: revisedBundle.outline.chapter_title ?? `Chapitre ${chapterNumber}`,
        chapterNumber,
        chapterSummary: revisedBundle.memory.narrativeSummary,
        cliffhanger: revisedBundle.outline.cliffhanger,
        genre: context.project.primaryGenre ?? "fantasy",
        tone: context.project.tone ?? "dramatique",
        visualStyle: context.project.visualStyle ?? "manga",
        mood: coverMood,
        characters: rawCharacters.slice(0, 2).map((c: any) => ({
          name: c.name,
          gender: c.gender,
          appearance: c.appearance,
          hairColor: c.hairColor,
          eyeColor: c.eyeColor,
          outfitDefault: c.outfitDefault,
        })),
        stylePack: stylePacks[0] ? { name: stylePacks[0].renderFamily, visualStyle: project?.visualStyle ?? null } : null,
        contentIntensityLayer: intensityLayer,
      });

      const coverResult = await runRoutedImageGeneration(
        { mode: "PANEL_DRAFT", contentIntensityLayer: intensityLayer, isNewCharacter: false, hasCanonReferences: false, characterCountInScene: 2, needsInpaint: false, needsPoseVariation: false, preferPhotorealCover: false, explicitBlocked: false, goreStylizedMature: false },
        { mode: "PANEL_DRAFT", positivePrompt: coverPrompt.positive, negativePrompt: coverPrompt.negative, width: coverPrompt.width, height: coverPrompt.height, providerParams: { contentIntensityLayer: intensityLayer, mode: "COVER_ART" } },
      );
      if (coverResult.ok) {
        const persisted = await persistImageIfNeeded({ imageUrl: coverResult.result.imageUrl, projectId, chapterId, sceneImageId: `cover_${chapterId}` });
        if (persisted.ok) {
          coverUrl = persisted.url;
          await prisma.chapter.update({ where: { id: chapterId }, data: { coverImageUrl: coverUrl } });
        }
      }
    } catch (e) {
      console.warn("[pipeline] cover generation skipped:", e instanceof Error ? e.message : e);
    }

    const chapterQualityRows = await prisma.sceneImage.findMany({
      where: {
        scene: {
          chapterId,
        },
      },
      select: {
        consistencyScore: true,
        metadata: true,
      },
    });
    const chapterQualityReport = computeChapterQualityReport(chapterQualityRows);
    console.log(
      `[pipeline] quality average=${chapterQualityReport.averageReleaseScore.toFixed(2)} accepted=${chapterQualityReport.premiumReleaseAccepted} weakPanels=${chapterQualityReport.weakPanels.length}`
    );
    const persistedRuntime = buildPersistedChapterRuntimeState({
      studioSnapshot,
      chapterId,
      chapterNumber,
      jobId,
      totalPlannedImages: plannedImages.length,
      generatedCount,
      failedCount,
      qualityReport: chapterQualityReport,
    });
    const generationRunSummary = buildRuntimeDebugSummary({
      generationRunSummary: persistedRuntime.generationRunSummary,
      productionSource,
    });

    // Mettre à jour le statut du chapitre
    await prisma.chapter.update({
      where: { id: chapterId },
      data: {
        status: persistedRuntime.persistedChapterStatus,
        ...(persistedRuntime.structuredRuntimeFields
          ? {
              studioStatus: persistedRuntime.structuredRuntimeFields.studioStatus,
              studioCurrentStep: persistedRuntime.structuredRuntimeFields.studioCurrentStep,
              studioUpdatedAt: persistedRuntime.structuredRuntimeFields.studioUpdatedAt
                ? new Date(persistedRuntime.structuredRuntimeFields.studioUpdatedAt)
                : null,
              studioAutosaveVersion: persistedRuntime.structuredRuntimeFields.studioAutosaveVersion,
              minimumImages: persistedRuntime.structuredRuntimeFields.minimumImages,
              generatedImages: persistedRuntime.structuredRuntimeFields.generatedImages,
              acceptedImages: persistedRuntime.structuredRuntimeFields.acceptedImages,
              rejectedImages: persistedRuntime.structuredRuntimeFields.rejectedImages,
              missingImages: persistedRuntime.structuredRuntimeFields.missingImages,
              criticalPanelsCount: persistedRuntime.structuredRuntimeFields.criticalPanelsCount,
              criticalPanelsBlocked: persistedRuntime.structuredRuntimeFields.criticalPanelsBlocked,
              criticalPanelsMissingQa: persistedRuntime.structuredRuntimeFields.criticalPanelsMissingQa,
              reviewBlockedReason: persistedRuntime.structuredRuntimeFields.reviewBlockedReason,
            }
          : {}),
        outline: ({
          ...revisedBundle.outline,
          operationalStatus: revisedBundle.generationDiagnostics.operationalStatus,
          degradedModes: revisedBundle.generationDiagnostics.degradedModes,
          generationDiagnostics: revisedBundle.generationDiagnostics.outline,
          generationRunSummary,
          imageStats: {
            total: plannedImages.length,
            generated: generatedCount,
            failed: failedCount,
            accepted: chapterQualityReport.acceptedImages,
            rejected: chapterQualityReport.rejectedImages,
            minimumAcceptedImages: chapterQualityReport.minimumAcceptedImages,
            missingImages: chapterQualityReport.missingImages,
          },
          runtimeSources: {
            outlineSource: productionSource.source,
            fallbackUsed: productionSource.fallbackUsed,
            legacyBridgeUsed: productionSource.legacyBridgeUsed,
          },
          qualityReport: chapterQualityReport,
        } as unknown) as Prisma.InputJsonValue,
        script: ({
          ...revisedBundle.script,
          operationalStatus: revisedBundle.generationDiagnostics.operationalStatus,
          degradedModes: revisedBundle.generationDiagnostics.degradedModes,
          generationDiagnostics: revisedBundle.generationDiagnostics.dialogue,
          generationRunSummary,
          imageStats: {
            total: plannedImages.length,
            generated: generatedCount,
            failed: failedCount,
            accepted: chapterQualityReport.acceptedImages,
            rejected: chapterQualityReport.rejectedImages,
            minimumAcceptedImages: chapterQualityReport.minimumAcceptedImages,
            missingImages: chapterQualityReport.missingImages,
          },
          runtimeSources: {
            outlineSource: productionSource.source,
            fallbackUsed: productionSource.fallbackUsed,
            legacyBridgeUsed: productionSource.legacyBridgeUsed,
          },
          qualityReport: chapterQualityReport,
        } as unknown) as Prisma.InputJsonValue,
      },
    });

    return {
      generatedCount,
      failedCount,
      chapterQualityReport,
      generationRunSummary,
    };
}
