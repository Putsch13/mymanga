import type { TextOverflowStrategy } from "@manga-ai-studio/core";

import {
  composePanelTextLayer,
  composePanelTextLayoutFromLayer,
  type BubbleCompositorInput,
  type ComposedPanelTextLayout,
  type DialogueInput,
} from "./bubble-compositor";
import {
  clampBoundsToPanel,
  reservedZoneToBounds,
  type BubbleLayout,
  type ForbiddenZone,
  type PanelTextLayer,
  type ReservedZone,
} from "./bubble-layout-model";

export interface PanelTextCompositorInput {
  panelId: string;
  dialogues: ReadonlyArray<DialogueInput>;
  narration?: string | null;
  sfx?: string | null;
  reservedTextZones?: ReadonlyArray<ReservedZone>;
  forbiddenZones?: ReadonlyArray<ForbiddenZone>;
  preferredAnchorZones?: ReadonlyArray<ReservedZone>;
  overflowStrategy?: TextOverflowStrategy;
  isWebtoon?: boolean;
}

export interface PanelTextCompositorResult {
  layer: PanelTextLayer;
  /** Layout in-panel (PATCH 10) — coordonnées 0–100 % pour {@link PanelTextOverlay}. */
  textLayout: ComposedPanelTextLayout;
  overflowDialogues: DialogueInput[];
  overflowStrategy: TextOverflowStrategy;
}

function tailDirectionForZone(zone: ReservedZone): BubbleLayout["tailAnchor"] {
  const bounds = reservedZoneToBounds(zone);
  const direction =
    zone === "bottom-left" || zone === "bottom-right"
      ? "up"
      : zone === "center"
        ? "none"
        : "down";
  return {
    x: bounds.x + bounds.width / 2,
    y: direction === "up" ? bounds.y + bounds.height : bounds.y,
    direction,
  };
}

function buildPreferredOverrides(
  input: PanelTextCompositorInput,
): BubbleCompositorInput["overrides"] | undefined {
  if (!input.preferredAnchorZones || input.preferredAnchorZones.length === 0) {
    return undefined;
  }
  const overrides = new Map<string, Partial<BubbleLayout>>();
  const max = Math.min(input.dialogues.length, input.preferredAnchorZones.length);
  for (let index = 0; index < max; index += 1) {
    const zone = input.preferredAnchorZones[index];
    if (!zone) continue;
    const bounds = reservedZoneToBounds(zone);
    const width = input.isWebtoon ? 44 : 40;
    const height = input.isWebtoon ? 20 : 24;
    overrides.set(`${input.panelId}:speech:${index}`, {
      bounds: clampBoundsToPanel({
        x: bounds.x,
        y: bounds.y,
        width,
        height,
      }),
      reservedZone: zone,
      tailAnchor: tailDirectionForZone(zone),
    });
  }
  return overrides;
}

export function composePanelTextPresentation(
  input: PanelTextCompositorInput,
): PanelTextCompositorResult {
  const overflowStrategy = input.overflowStrategy ?? "caption_strip";
  const maxBubbles = input.isWebtoon ? 8 : 6;
  const layer = composePanelTextLayer({
    panelId: input.panelId,
    dialogues: input.dialogues,
    narration: input.narration,
    sfx: input.sfx,
    reservedTextZones: input.reservedTextZones,
    forbiddenZones: input.forbiddenZones,
    isWebtoon: input.isWebtoon,
    maxBubbles,
    overrides: buildPreferredOverrides(input),
  });

  const textLayout = composePanelTextLayoutFromLayer(layer, 100, 100);

  return {
    layer,
    textLayout,
    overflowDialogues:
      overflowStrategy === "caption_strip" ? input.dialogues.slice(maxBubbles) : [],
    overflowStrategy,
  };
}
