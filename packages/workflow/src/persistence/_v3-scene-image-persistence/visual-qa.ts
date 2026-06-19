import {
  buildVisualQaInputFromRenderSpec,
  runVisualPanelQaWithOptionalVision,
  type VisualQaResult,
} from "@manga-ai-studio/ai";
import type { StoryboardPanelV3 as StoryboardPanel } from "@manga-ai-studio/ai";
import type { V3RenderedPanelRecord } from "./types";

export interface PanelVisualQaArgs {
  panel: StoryboardPanel;
  record: V3RenderedPanelRecord;
  durableImageUrl: string | null;
  visualQaBlocksDeliverable: boolean;
  reserveTextArea: boolean;
}

/**
 * Si le render-pass a déjà calculé un QA, on le réutilise.
 * Sinon, et seulement si l'image est livrable, on lance le QA visuel ici.
 */
export async function resolvePanelVisualQa(args: PanelVisualQaArgs): Promise<VisualQaResult | null> {
  const { panel, record, durableImageUrl, visualQaBlocksDeliverable, reserveTextArea } = args;

  if (record.visualQa != null) {
    return record.visualQa;
  }

  if (!durableImageUrl || record.error || visualQaBlocksDeliverable) {
    return null;
  }

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

  return runVisualPanelQaWithOptionalVision(qaInput);
}
