/**
 * render-pass-helpers.ts
 *
 * Helpers purs du render-pass v3 (formatage erreurs, lookup canonique,
 * compactage debug). Extrait de `render-pass.ts` (audit-v9).
 */

import type { PanelRenderSpec } from "@manga-ai-studio/ai";
import type { StoryboardPanel } from "@manga-ai-studio/ai/contracts";
import type { VisualQaResult } from "@manga-ai-studio/ai";
import type {
  CanonicalChapterProductionPlan,
  CanonicalPanelPlan,
} from "@manga-ai-studio/core";
import type {
  PanelFinalStatus,
  V3PanelRenderAttemptLog,
} from "../persistence/v3-scene-image-persistence";
import type { RenderPassImageFailureDetail } from "./render-pass-types";

export function formatRenderFailure(detail: RenderPassImageFailureDetail): string {
  return `render_failed:${JSON.stringify(detail)}`;
}

/**
 * Indique si ce renderMode nécessite une face ref dédiée closeup.
 * Les modes où le visage doit être reconnaissable requièrent la ref.
 * Les modes environnement/creature/aftermath/silhouette peuvent s'en passer.
 */
export function requiresDedicatedFaceRef(spec: PanelRenderSpec): boolean {
  return (
    spec.renderMode === "hero_closeup" ||
    spec.renderMode === "reaction_closeup" ||
    spec.renderMode === "npc_closeup" ||
    spec.renderMode === "enemy_closeup" ||
    spec.renderMode === "dialogue_over_shoulder" ||
    spec.renderMode === "dialogue_two_shot"
  );
}

export function canonicalPanelByIdFromPlan(
  plan: CanonicalChapterProductionPlan | null | undefined,
): Map<string, CanonicalPanelPlan> {
  const map = new Map<string, CanonicalPanelPlan>();
  if (!plan?.panels?.length) return map;
  for (const p of plan.panels) {
    map.set(p.panelId, p);
  }
  return map;
}

export function compactRenderPanelDebug(input: {
  panel: StoryboardPanel;
  spec: PanelRenderSpec;
  canonicalPanel: CanonicalPanelPlan | null;
  reserveTextArea: boolean;
  imageUrl: string | null | undefined;
  lastQa: VisualQaResult | null;
  attempts: V3PanelRenderAttemptLog[] | undefined;
  finalStatus: PanelFinalStatus | null | undefined;
}): Record<string, unknown> {
  const { panel, spec, canonicalPanel, reserveTextArea, imageUrl, lastQa, attempts, finalStatus } = input;
  return {
    panelId: spec.panelId,
    beatId: panel.sourceBeatId,
    role: spec.panelPurpose,
    isCutaway: spec.cutawayType !== "none",
    isActorDriven: canonicalPanel?.isActorDriven ?? null,
    expectedCharacters: canonicalPanel
      ? {
          mustShowCharacterIds: canonicalPanel.mustShowCharacterIds,
          requiredCharacterIds: canonicalPanel.requiredCharacterIds,
        }
      : [...spec.constraints.mustShow],
    textAnchor: canonicalPanel?.textPlan ?? null,
    reserveTextArea,
    renderMode: spec.renderMode,
    imageUrl: imageUrl ?? null,
    visualQaScore: lastQa?.score ?? null,
    visualQaPassed: lastQa?.passed ?? null,
    visualQaReasons: lastQa?.reasons ?? [],
    attemptCount: attempts?.length ?? 0,
    retryStrategies: (attempts ?? []).map((a) => a.retryStrategy),
    finalStatus: finalStatus ?? null,
    manualReviewRequired: Boolean(lastQa?.shouldMarkManualReview),
    canonicalPanel,
  };
}
