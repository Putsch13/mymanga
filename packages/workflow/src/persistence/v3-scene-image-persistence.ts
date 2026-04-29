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
 *   pour une page (ChapterScene + SceneImage + MediaAsset) sont dans une transaction.
 *   Les uploads Supabase (externes) restent en dehors de la transaction.
 */

import { prisma, type Prisma } from "@manga-ai-studio/db";
import {
  buildReaderPanelSlots,
  buildPanelTextContractFromFragments,
  type GenerationDebugSnapshot,
} from "@manga-ai-studio/core";
import type {
  FalRenderRoute,
  PanelRenderPanelTextPayload,
  PanelRenderSpec,
  StoryboardPlan,
  StoryboardPageV3 as StoryboardPage,
  StoryboardPanelV3 as StoryboardPanel,
} from "@manga-ai-studio/ai";
import { buildPanelRenderTextPayloadFromStoryboardPanel } from "../passes/enrich-panel-render-spec";
import { persistImageIfNeeded, type PersistedImageResult } from "../pipeline-image-persistence";
import { buildVisualQaInputFromRenderSpec, runVisualPanelQaWithOptionalVision } from "@manga-ai-studio/ai";
import type { VisualQaResult } from "@manga-ai-studio/ai";

function panelTextPayloadForPersist(panel: StoryboardPanel, spec: PanelRenderSpec): PanelRenderPanelTextPayload {
  return spec.panelTextPayload ?? buildPanelRenderTextPayloadFromStoryboardPanel(panel).panelTextPayload;
}

export type PanelFinalStatus =
  | "passed"
  | "passed_after_retry"
  | "manual_review_required"
  | "failed";

/** Historique des tentatives image + QA (persisté dans `SceneImage.metadata`). */
export interface V3PanelRenderAttemptLog {
  attemptNumber: number;
  prompt: string;
  negative: string;
  imageUrl: string | null;
  qaScore: number;
  qaReasons: string[];
  retryStrategy?: string;
  passed: boolean;
  createdAt: string;
}

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
  /** Statut livrable après génération + QA visuelle (render-pass v3). */
  finalStatus?: PanelFinalStatus | null;
  /** Renseigné par le render-pass v3 après QA (évite un second passage vision en persistance). */
  visualQa?: VisualQaResult | null;
  /** Chaque tentative FAL + résultat QA (ordre chronologique). */
  renderAttempts?: V3PanelRenderAttemptLog[];
}

export interface V3SceneImagePersistInput {
  chapterId: string;
  storyboardPlan: StoryboardPlan;
  rendered: V3RenderedPanelRecord[];
  /** P1.14 — aligné sur Chapter.currentGenerationRunId pour filtrage QA / reader */
  generationRunId?: string | null;
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

interface PreparedPanelData {
  panel: StoryboardPanel;
  record: V3RenderedPanelRecord;
  panelNumber: number;
  durableImageUrl: string | null;
  storageMeta: { bucket: string | null; storageKey: string | null; mimeType: string | null };
  status: "completed" | "failed" | "pending";
  metadata: Prisma.InputJsonValue;
  routingDecision: Prisma.InputJsonValue;
  externalPanelId: string;
  panelBlueprintId: string | null;
  skipped: boolean;
  skipReason?: string;
}

/**
 * Phase 1: Prépare les données pour un panel (uploads externes).
 * Cette phase fait les appels à Supabase et calcule les metadata.
 */
async function preparePanelData(
  panel: StoryboardPanel,
  record: V3RenderedPanelRecord,
  page: StoryboardPage,
  projectId: string,
  chapterId: string,
): Promise<{
  prepared: PreparedPanelData;
  imagePersisted: boolean;
  imageAlreadyStable: boolean;
  storageFailed: boolean;
}> {
  const panelNumber = panel.panelNumberInPage;
  const providerImageUrl = record.imageUrl ?? null;

  let durableImageUrl: string | null = null;
  let storageMeta: { bucket: string | null; storageKey: string | null; mimeType: string | null } = {
    bucket: null,
    storageKey: null,
    mimeType: null,
  };
  let imagePersisted = false;
  let imageAlreadyStable = false;
  let storageFailed = false;

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
      imagePersisted = true;
    } else if (persistResult.ok && !persistResult.persisted) {
      durableImageUrl = persistResult.url;
      imageAlreadyStable = true;
    } else {
      storageFailed = true;
    }
  }

  const hasImage = !!durableImageUrl;
  const visualQaBlocksDeliverable =
    Boolean(record.visualQa && !record.visualQa.passed)
    || record.finalStatus === "manual_review_required"
    || record.finalStatus === "failed"
    || record.error === "visual_qa_failed";
  const pageSlots = buildReaderPanelSlots({
    template: page.layoutTemplate,
    readingDirection: "rtl",
    panelIds: page.panels.map((pagePanel) => pagePanel.panelId),
  });
  const panelSlot = pageSlots.find((slot) => slot.panelId === panel.panelId) ?? null;
  const status = record.error || visualQaBlocksDeliverable
    ? "failed"
    : hasImage
      ? "completed"
      : "pending";

  const panelTextForPersist = panelTextPayloadForPersist(panel, record.spec);

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
      dialogues: panelTextForPersist.dialogue ?? [],
      narration: panelTextForPersist.narration ?? null,
      sfx: panelTextForPersist.sfx ?? [],
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

  const reserveTextArea =
    (Array.isArray(panelTextForPersist.dialogue) && panelTextForPersist.dialogue.length > 0)
    || Boolean(panelTextForPersist.narration?.trim())
    || (Array.isArray(panelTextForPersist.sfx) && panelTextForPersist.sfx.length > 0);

  let visualQa: VisualQaResult | null = null;
  if (record.visualQa != null) {
    visualQa = record.visualQa;
  } else if (durableImageUrl && !record.error && !visualQaBlocksDeliverable) {
    const qaInput = buildVisualQaInputFromRenderSpec({
      panelId: panel.panelId,
      imageUrl: durableImageUrl,
      promptUsed: record.prompt.positive,
      attemptNumber: 1,
      panelPurpose: String(record.spec.panelPurpose),
      actionLine: record.spec.actionLine,
      shotType: String(record.spec.shotType),
      subjectFocus: String(record.spec.subjectFocus),
      cutawayType: String(record.spec.cutawayType),
      mustShowCharacterIds: [...(record.spec.constraints.mustShow ?? [])],
      reserveTextArea,
      textOverflowStrategy: panel.textPlacementHint?.overflowStrategy ?? null,
      visibleCharacters: record.spec.visibleCharacters.map((vc) => ({
        characterId: vc.characterId,
        name: vc.name,
        isProtagonist: vc.characterId === record.spec.heroCharacterId,
      })),
    });
    visualQa = await runVisualPanelQaWithOptionalVision(qaInput);
  }

  const visualQaForMetadata =
    visualQa == null ? null : (JSON.parse(JSON.stringify(visualQa)) as VisualQaResult);
  const renderAttemptsForMetadata = JSON.parse(JSON.stringify(record.renderAttempts ?? [])) as NonNullable<
    V3RenderedPanelRecord["renderAttempts"]
  >;

  const textContract = buildPanelTextContractFromFragments({
    panelId: panel.panelId,
    dialogueLines: panelTextForPersist.dialogue?.length ? panelTextForPersist.dialogue : null,
    narration: panelTextForPersist.narration ?? null,
    sfx: panelTextForPersist.sfx ?? null,
  });

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
    textContract,
    dialogue: panelTextForPersist.dialogue ?? [],
    narration: panelTextForPersist.narration ?? null,
    sfx: panelTextForPersist.sfx ?? [],
    textMeta: panel.textPlacementHint
      ? {
          preferredAnchorZones: panel.textPlacementHint.preferredAnchorZones ?? [],
          overflowStrategy: panel.textPlacementHint.overflowStrategy ?? "caption_strip",
          overlayReadingDirection: "rtl",
        }
      : null,
    readerLayout: generationDebugSnapshot.readerLayout,
    generationDebugSnapshot,
    visualQa: visualQaForMetadata,
    renderAttempts: renderAttemptsForMetadata,
  } as unknown as Prisma.InputJsonValue;

  const routingDecision = {
    modelId: record.route.modelId,
    referencePolicy: record.route.referencePolicy,
    panelCategory: record.route.panelCategory,
    sizePreset: record.route.sizePreset,
    retryPolicy: record.route.retryPolicy,
  } as unknown as Prisma.InputJsonValue;

  const externalPanelId = panel.panelId;
  const panelBlueprintId = (panel as unknown as { blueprintId?: string }).blueprintId ?? null;

  return {
    prepared: {
      panel,
      record,
      panelNumber,
      durableImageUrl,
      storageMeta,
      status,
      metadata,
      routingDecision,
      externalPanelId,
      panelBlueprintId,
      skipped: false,
    },
    imagePersisted,
    imageAlreadyStable,
    storageFailed,
  };
}

/**
 * Phase 2: Persiste les données d'une page en transaction.
 * Cette phase fait toutes les opérations DB en une seule transaction.
 */
async function persistPageInTransaction(
  tx: Prisma.TransactionClient,
  page: StoryboardPage,
  chapterId: string,
  projectId: string,
  preparedPanels: PreparedPanelData[],
  generationRunId: string | null,
): Promise<{
  sceneCreated: boolean;
  sceneId: string;
  imagesUpserted: number;
  imagesSkipped: number;
  warnings: string[];
}> {
  const sceneNumber = page.pageNumber;
  const warnings: string[] = [];
  let imagesUpserted = 0;
  let imagesSkipped = 0;

  // 1. Upsert ChapterScene
  const existingScene = await tx.chapterScene.findFirst({
    where: { chapterId, sceneNumber },
    select: { id: true },
  });

  let sceneId: string;
  let sceneCreated = false;

  if (existingScene) {
    sceneId = existingScene.id;
  } else {
    const createdScene = await tx.chapterScene.create({
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
    sceneCreated = true;
  }

  // 2. Pour chaque panel préparé
  for (const prepared of preparedPanels) {
    if (prepared.skipped) {
      imagesSkipped += 1;
      if (prepared.skipReason) warnings.push(prepared.skipReason);
      continue;
    }

    const { panel, record, panelNumber, durableImageUrl, storageMeta, status, metadata, routingDecision, externalPanelId, panelBlueprintId } = prepared;

    // P1.7 — Créer un MediaAsset pour chaque image persistée
    let mediaAssetId: string | null = null;
    if (durableImageUrl && storageMeta.bucket && storageMeta.storageKey) {
      const mediaAsset = await tx.mediaAsset.create({
        data: {
          projectId,
          chapterId,
          sceneId,
          type: "panel_output",
          origin: "fal_output",
          storageProvider: "supabase",
          bucket: storageMeta.bucket,
          storageKey: storageMeta.storageKey,
          publicUrl: durableImageUrl,
          mimeType: storageMeta.mimeType,
          metadata: {
            panelId: panel.panelId,
            pageNumber: page.pageNumber,
            panelNumberInPage: panel.panelNumberInPage,
            renderMode: record.spec.renderMode,
            provider: record.provider,
            model: record.model,
          } as unknown as Prisma.InputJsonValue,
        },
        select: { id: true },
      });
      mediaAssetId = mediaAsset.id;
    }

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
      mediaAssetId,
      generationRunId,
    };

    // Vérifier l'image existante
    const existingImage = await tx.sceneImage.findUnique({
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
      warnings.push(
        `skipped_validated_panel_identity_mismatch panelId=${panel.panelId} ` +
        `slot=${panelNumber} existing=${existingImage.externalPanelId}`,
      );
      imagesSkipped += 1;
      continue;
    }

    if (existingImage?.userValidatedAt && !panelIdentityChanged) {
      await tx.sceneImage.update({
        where: { id: existingImage.id },
        data: {
          metadata,
          routingDecision,
          externalPanelId,
          panelBlueprintId,
          ...(generationRunId ? { generationRunId } : {}),
        },
      });
    } else {
      await tx.sceneImage.upsert({
        where: {
          sceneId_panelNumber: { sceneId, panelNumber },
        },
        create: { sceneId, panelNumber, ...data },
        update: data,
      });
    }
    imagesUpserted += 1;
  }

  return { sceneCreated, sceneId, imagesUpserted, imagesSkipped, warnings };
}

/**
 * Persiste les panels rendus par le render-pass v3 en DB.
 *
 * Idempotent : si une scène / image existe déjà pour ce (chapterId,
 * sceneNumber, panelNumber), on la met à jour. On ne recrée pas.
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
    // Phase 1: Préparer toutes les données (uploads externes)
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
          status: "pending",
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

    // Phase 2: Persister en transaction
    const result = await prisma.$transaction(async (tx) => {
      return persistPageInTransaction(tx, page, chapterId, projectId, preparedPanels, generationRunId);
    });

    if (result.sceneCreated) {
      scenesCreated += 1;
    } else {
      scenesReused += 1;
    }
    imagesUpserted += result.imagesUpserted;
    imagesSkipped += result.imagesSkipped;
    warnings.push(...result.warnings);
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
