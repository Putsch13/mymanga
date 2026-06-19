import type { Prisma } from "@manga-ai-studio/db";
import {
  stripLegacyPanelTextFieldsWhenContractPresent,
  type GenerationDebugSnapshot,
} from "@manga-ai-studio/core";
import type { VisualQaResult } from "@manga-ai-studio/ai";
import type { StoryboardPanelV3 as StoryboardPanel } from "@manga-ai-studio/ai";
import type { ResolvedPanelTextContract } from "./text-contract";
import type { V3RenderedPanelRecord } from "./types";

export interface BuildPanelMetadataArgs {
  panel: StoryboardPanel;
  record: V3RenderedPanelRecord;
  text: ResolvedPanelTextContract;
  generationDebugSnapshot: GenerationDebugSnapshot;
  visualQa: VisualQaResult | null;
}

export function buildPanelMetadata(args: BuildPanelMetadataArgs): Prisma.InputJsonValue {
  const { panel, record, text, generationDebugSnapshot, visualQa } = args;

  const visualQaForMetadata =
    visualQa == null ? null : (JSON.parse(JSON.stringify(visualQa)) as VisualQaResult);
  const renderAttemptsForMetadata = JSON.parse(
    JSON.stringify(record.renderAttempts ?? []),
  ) as NonNullable<V3RenderedPanelRecord["renderAttempts"]>;

  return stripLegacyPanelTextFieldsWhenContractPresent({
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
    textContract: text.textContract,
    /** PR9 — pas de doublon top-level : lecture via `synthesizePanelTextContractFromLooseMetadata` / `textContract`. */
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
  }) as unknown as Prisma.InputJsonValue;
}

export function buildRoutingDecision(record: V3RenderedPanelRecord): Prisma.InputJsonValue {
  return {
    modelId: record.route.modelId,
    referencePolicy: record.route.referencePolicy,
    panelCategory: record.route.panelCategory,
    sizePreset: record.route.sizePreset,
    retryPolicy: record.route.retryPolicy,
  } as unknown as Prisma.InputJsonValue;
}
