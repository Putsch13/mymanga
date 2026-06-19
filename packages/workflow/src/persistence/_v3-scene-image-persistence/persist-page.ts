import type { Prisma } from "@manga-ai-studio/db";
import type { StoryboardPageV3 as StoryboardPage } from "@manga-ai-studio/ai";
import type { PreparedPanelData } from "./types";

export interface PersistPageResult {
  sceneCreated: boolean;
  sceneId: string;
  imagesUpserted: number;
  imagesSkipped: number;
  warnings: string[];
  persistedPanelIds: string[];
  skippedPanelIds: Array<{ panelId: string; reason: string }>;
}

/**
 * Phase 2: Persiste les données d'une page en transaction.
 * Toutes les opérations DB pour une page sont dans la même transaction afin
 * d'éviter les chapitres partiellement écrits.
 */
export async function persistPageInTransaction(
  tx: Prisma.TransactionClient,
  page: StoryboardPage,
  chapterId: string,
  projectId: string,
  preparedPanels: PreparedPanelData[],
  generationRunId: string | null,
): Promise<PersistPageResult> {
  const sceneNumber = page.pageNumber;
  const warnings: string[] = [];
  const persistedPanelIds: string[] = [];
  const skippedPanelIds: Array<{ panelId: string; reason: string }> = [];
  let imagesUpserted = 0;
  let imagesSkipped = 0;

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

  for (const prepared of preparedPanels) {
    if (prepared.skipped) {
      imagesSkipped += 1;
      const reason = prepared.skipReason ?? `skipped_unknown panelId=${prepared.panel.panelId}`;
      skippedPanelIds.push({ panelId: prepared.panel.panelId, reason });
      warnings.push(reason);
      continue;
    }

    const {
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
    } = prepared;

    // P1.7 — un MediaAsset par image persistée durablement
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

    const existingImage = await tx.sceneImage.findUnique({
      where: { sceneId_panelNumber: { sceneId, panelNumber } },
      select: { id: true, userValidatedAt: true, externalPanelId: true },
    });

    // P1.6 — si le panel a changé d'identité narrative et qu'il est validé,
    // ne pas réutiliser cette ligne pour un autre panel.
    const panelIdentityChanged =
      existingImage?.externalPanelId
      && existingImage.externalPanelId !== externalPanelId;

    if (existingImage?.userValidatedAt && panelIdentityChanged) {
      const reason =
        `skipped_validated_panel_identity_mismatch panelId=${panel.panelId} `
        + `slot=${panelNumber} existing=${existingImage.externalPanelId}`;
      warnings.push(reason);
      skippedPanelIds.push({ panelId: panel.panelId, reason });
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
        where: { sceneId_panelNumber: { sceneId, panelNumber } },
        create: { sceneId, panelNumber, ...data },
        update: data,
      });
    }
    imagesUpserted += 1;
    persistedPanelIds.push(panel.panelId);
  }

  return {
    sceneCreated,
    sceneId,
    imagesUpserted,
    imagesSkipped,
    warnings,
    persistedPanelIds,
    skippedPanelIds,
  };
}
