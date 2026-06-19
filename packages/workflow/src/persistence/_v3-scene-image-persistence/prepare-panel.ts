import { SCENE_IMAGE_STATUS, type SceneImageStatus } from "@manga-ai-studio/core";
import type {
  StoryboardPageV3 as StoryboardPage,
  StoryboardPanelV3 as StoryboardPanel,
} from "@manga-ai-studio/ai";
import { buildPanelMetadata, buildRoutingDecision } from "./build-metadata";
import { buildPanelDebugSnapshot } from "./debug-snapshot";
import { persistPanelImageIfAny } from "./persist-image";
import { resolvePanelTextContract } from "./text-contract";
import { resolvePanelVisualQa } from "./visual-qa";
import type { PreparedPanelData, V3RenderedPanelRecord } from "./types";

export interface PreparePanelOutcome {
  prepared: PreparedPanelData;
  imagePersisted: boolean;
  imageAlreadyStable: boolean;
  storageFailed: boolean;
}

/**
 * Phase 1: prépare les données pour un panel (uploads externes + QA visuelle).
 * Cette phase fait les appels Supabase / vision QA et calcule les metadata.
 */
export async function preparePanelData(
  panel: StoryboardPanel,
  record: V3RenderedPanelRecord,
  page: StoryboardPage,
  projectId: string,
  chapterId: string,
): Promise<PreparePanelOutcome> {
  const panelNumber = panel.panelNumberInPage;
  const providerImageUrl = record.imageUrl ?? null;

  const imageOutcome = await persistPanelImageIfAny({
    providerImageUrl,
    projectId,
    chapterId,
    panelId: panel.panelId,
  });

  const { durableImageUrl, storageMeta } = imageOutcome;
  const hasImage = Boolean(durableImageUrl);
  const visualQaBlocksDeliverable =
    Boolean(record.visualQa && !record.visualQa.passed)
    || record.finalStatus === "manual_review_required"
    || record.finalStatus === "failed"
    || record.error === "visual_qa_failed";

  const status: Extract<SceneImageStatus, "completed" | "failed" | "pending"> =
    record.error || visualQaBlocksDeliverable
      ? SCENE_IMAGE_STATUS.FAILED
      : hasImage
        ? SCENE_IMAGE_STATUS.COMPLETED
        : SCENE_IMAGE_STATUS.PENDING;

  const text = resolvePanelTextContract(panel, record);
  const reserveTextArea = text.textContract.hasText;

  const generationDebugSnapshot = buildPanelDebugSnapshot({
    panel,
    page,
    record,
    status,
    durableImageUrl,
    providerImageUrl,
    storageMeta,
    text,
  });

  const visualQa = await resolvePanelVisualQa({
    panel,
    record,
    durableImageUrl,
    visualQaBlocksDeliverable,
    reserveTextArea,
  });

  const metadata = buildPanelMetadata({
    panel,
    record,
    text,
    generationDebugSnapshot,
    visualQa,
  });

  const routingDecision = buildRoutingDecision(record);

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
    imagePersisted: imageOutcome.imagePersisted,
    imageAlreadyStable: imageOutcome.imageAlreadyStable,
    storageFailed: imageOutcome.storageFailed,
  };
}
