/**
 * render-pass-execute-panel.ts
 *
 * PHASE B — Pour chaque panel passé en preflight : appel FAL +
 * boucle visual-qa (avec retry guidé), persistance temporaire pour QA,
 * dump de debug. Extrait de `render-pass.ts` (audit-v9).
 */

import {
  buildRetryPrompt,
  buildVisualQaInputFromRenderSpec,
  runVisualPanelQaWithOptionalVision,
  type ChapterVisualMemory,
  type FalRenderRoute,
  type PanelRenderSpec,
  type VisualQaResult,
} from "@manga-ai-studio/ai";
import type { StoryboardPanel } from "@manga-ai-studio/ai/contracts";
import type { CanonicalPanelPlan } from "@manga-ai-studio/core";
import { PRODUCTION_RULES } from "@manga-ai-studio/core";
import {
  buildProviderPayloadPreview,
  dumpPanelDebugArtifacts,
} from "../debug/panel-debug-dump";
import type { V3PanelRenderAttemptLog } from "../persistence/v3-scene-image-persistence";
import { ensureStableImageUrl } from "../persistence/persist-temporary-image-for-qa";
import { compactRenderPanelDebug } from "./render-pass-helpers";
import { formatRenderFailure } from "./render-pass-helpers";
import type {
  GeneratePanelImageResult,
  RenderPassImageFailureDetail,
  RenderedPanelDescriptor,
} from "./render-pass-types";

export interface ExecutePanelInput {
  chapterId: string;
  projectId: string | undefined;
  generationRunId: string | null | undefined;
  panel: StoryboardPanel;
  enrichedSpec: PanelRenderSpec;
  route: FalRenderRoute;
  prompt: { positive: string; negative: string };
  canonicalPanelForDump: CanonicalPanelPlan | null;
  visualMemory: ChapterVisualMemory;
  generatePanelImage: (args: {
    spec: PanelRenderSpec;
    prompt: string;
    negative: string;
    route: FalRenderRoute;
  }) => Promise<GeneratePanelImageResult>;
}

export interface ExecutePanelOutcome {
  descriptor: RenderedPanelDescriptor;
  /** Évolution des compteurs globaux. */
  delta: {
    renderedCount: number;
    failedCount: number;
    visualQaPassedCount: number;
    visualQaFailedCount: number;
    manualReviewRequiredCount: number;
    passedAfterRetryCount: number;
  };
  warning?: string;
  renderError?: { panelId: string; error: string };
}

function emptyDelta() {
  return {
    renderedCount: 0,
    failedCount: 0,
    visualQaPassedCount: 0,
    visualQaFailedCount: 0,
    manualReviewRequiredCount: 0,
    passedAfterRetryCount: 0,
  };
}

export async function executePanel(input: ExecutePanelInput): Promise<ExecutePanelOutcome> {
  const {
    chapterId,
    projectId,
    generationRunId,
    panel,
    enrichedSpec,
    route,
    prompt,
    canonicalPanelForDump,
    generatePanelImage,
  } = input;

  const descriptor: RenderedPanelDescriptor = { spec: enrichedSpec, prompt, route };
  const delta = emptyDelta();
  let warning: string | undefined;
  let renderError: { panelId: string; error: string } | undefined;

  const providerPreview = buildProviderPayloadPreview(enrichedSpec, route);
  const ptp = enrichedSpec.panelTextPayload;
  const reserveTextAreaForDump =
    (Array.isArray(ptp?.dialogue) && ptp.dialogue.length > 0)
    || Boolean(ptp?.narration?.trim())
    || (Array.isArray(ptp?.sfx) && ptp.sfx.length > 0);

  await dumpPanelDebugArtifacts({
    chapterId,
    panelId: enrichedSpec.panelId,
    phase: "pre_generate",
    blueprint: panel,
    renderSpec: enrichedSpec,
    prompt: { positive: prompt.positive, negative: prompt.negative },
    providerPayload: providerPreview,
    renderDebug: compactRenderPanelDebug({
      panel,
      spec: enrichedSpec,
      canonicalPanel: canonicalPanelForDump,
      reserveTextArea: reserveTextAreaForDump,
      imageUrl: null,
      lastQa: null,
      attempts: undefined,
      finalStatus: null,
    }),
  });

  try {
    const res = await generatePanelImage({
      spec: enrichedSpec,
      prompt: prompt.positive,
      negative: prompt.negative,
      route,
    });

    if (!res.ok) {
      delta.failedCount += 1;
      descriptor.finalStatus = "failed";
      const errorMessage = res.error ?? "render_failed";
      const errorCode = res.errorCode ?? "GENERATE_PANEL_IMAGE_FAILED";
      const detail: RenderPassImageFailureDetail = {
        panelId: enrichedSpec.panelId,
        renderMode: enrichedSpec.renderMode,
        locationName: enrichedSpec.locationName,
        mustShow: [...enrichedSpec.constraints.mustShow],
        errorCode,
        errorMessage,
      };
      descriptor.renderFailure = detail;
      descriptor.error = errorMessage;
      renderError = { panelId: panel.panelId, error: formatRenderFailure(detail) };
      await dumpPanelDebugArtifacts({
        chapterId,
        panelId: enrichedSpec.panelId,
        phase: "post_failure",
        blueprint: panel,
        renderSpec: enrichedSpec,
        prompt: { positive: prompt.positive, negative: prompt.negative },
        providerPayload: providerPreview,
        outputUrl: res.imageUrl ?? null,
        error: { errorMessage, errorCode, raw: res.error ?? null },
        renderDebug: compactRenderPanelDebug({
          panel,
          spec: enrichedSpec,
          canonicalPanel: canonicalPanelForDump,
          reserveTextArea: reserveTextAreaForDump,
          imageUrl: res.imageUrl ?? null,
          lastQa: null,
          attempts: undefined,
          finalStatus: "failed",
        }),
      });
      return { descriptor, delta, warning, renderError };
    }

    let imageUrl: string | null = res.imageUrl ?? null;
    let providerOut: string | null = res.provider ?? null;
    let modelOut: string | null = res.model ?? null;
    let seedOut: number | null = res.seed ?? null;
    descriptor.error = null;
    descriptor.renderFailure = null;

    const visualRetryEnabled =
      process.env.RENDER_PASS_VISUAL_QA_RETRY === "true"
      || process.env.VISUAL_PANEL_QA_VISION === "true";

    const reserveTextArea = reserveTextAreaForDump;

    let positivePrompt = prompt.positive;
    const qaHistory: VisualQaResult[] = [];
    let lastQa: VisualQaResult | null = null;
    descriptor.renderAttempts = [];

    if (imageUrl) {
      const qaStagingRunId = generationRunId ?? `qa-staging-${chapterId}`;
      let attempt = 1;
      while (attempt <= PRODUCTION_RULES.retry.maxImageAttempts) {
        let qaImageUrl = imageUrl;
        if (imageUrl && projectId) {
          try {
            const ensured = await ensureStableImageUrl({
              projectId,
              chapterId,
              panelId: enrichedSpec.panelId,
              generationRunId: qaStagingRunId,
              currentUrl: imageUrl,
            });
            qaImageUrl = ensured.url;
            if (ensured.wasTemporary) {
              imageUrl = ensured.url;
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            warning = `stable_qa_image_url_failed:${enrichedSpec.panelId}:${msg}`;
          }
        }
        const qaInput = buildVisualQaInputFromRenderSpec({
          panelId: enrichedSpec.panelId,
          imageUrl: qaImageUrl,
          promptUsed: positivePrompt,
          attemptNumber: attempt,
          panelPurpose: String(enrichedSpec.panelPurpose),
          actionLine: enrichedSpec.actionLine,
          shotType: String(enrichedSpec.shotType),
          subjectFocus: String(enrichedSpec.subjectFocus),
          cutawayType: String(enrichedSpec.cutawayType),
          mustShowCharacterIds: [...enrichedSpec.constraints.mustShow],
          reserveTextArea,
          textOverflowStrategy: panel.textPlacementHint?.overflowStrategy ?? null,
          visibleCharacters: enrichedSpec.visibleCharacters.map((c) => ({
            characterId: c.characterId,
            name: c.name,
            isProtagonist: c.characterId === (enrichedSpec.heroCharacterId ?? null),
          })),
          canonicalPanel: canonicalPanelForDump,
        });
        lastQa = await runVisualPanelQaWithOptionalVision(qaInput);
        qaHistory.push(lastQa);
        const attemptLog: V3PanelRenderAttemptLog = {
          attemptNumber: attempt,
          prompt: positivePrompt,
          negative: prompt.negative,
          imageUrl: qaImageUrl,
          qaScore: lastQa.score,
          qaReasons: [...lastQa.reasons],
          retryStrategy: lastQa.retryStrategy,
          passed: lastQa.passed,
          createdAt: new Date().toISOString(),
        };
        descriptor.renderAttempts!.push(attemptLog);
        console.info(
          `[visual-qa] ${lastQa.passed ? "passed" : "failed"} panel=${enrichedSpec.panelId} attempt=${attempt} score=${lastQa.score.toFixed(2)}`,
        );
        if (lastQa.shouldMarkManualReview) {
          console.warn(
            `[visual-qa] manual_review_required panel=${enrichedSpec.panelId} attempt=${attempt}`,
          );
        }
        if (lastQa.passed) break;
        if (!visualRetryEnabled || !lastQa.retryRecommended) break;
        if (attempt >= lastQa.maxAttempts) break;
        attempt += 1;
        const retry = buildRetryPrompt({
          panelId: enrichedSpec.panelId,
          originalPrompt: prompt.positive,
          previousResults: qaHistory,
          currentStrategy: lastQa.retryStrategy ?? "refined_prompt",
        });
        positivePrompt = retry.prompt;
        console.warn(
          `[visual-qa] retry panel=${enrichedSpec.panelId} attempt=${attempt} ` +
            `strategy=${lastQa.retryStrategy ?? "refined_prompt"} ` +
            `patches=[${retry.appliedPatches.join(",")}] ` +
            `reasons=[${(lastQa.failures ?? []).slice(0, 3).map((f) => f.category).join(",")}]`,
        );
        const resRetry = await generatePanelImage({
          spec: enrichedSpec,
          prompt: positivePrompt,
          negative: prompt.negative,
          route,
        });
        if (!resRetry.ok || !resRetry.imageUrl) break;
        imageUrl = resRetry.imageUrl;
        providerOut = resRetry.provider ?? providerOut;
        modelOut = resRetry.model ?? modelOut;
        seedOut = resRetry.seed ?? seedOut;
      }
    }

    descriptor.visualQa = lastQa;

    if (!imageUrl) {
      delta.failedCount += 1;
      descriptor.finalStatus = "failed";
      descriptor.error = "missing_generated_image_url";
      descriptor.imageUrl = null;
      descriptor.provider = providerOut;
      descriptor.model = modelOut;
      descriptor.seed = seedOut;
      await dumpPanelDebugArtifacts({
        chapterId,
        panelId: enrichedSpec.panelId,
        phase: "post_failure",
        blueprint: panel,
        renderSpec: enrichedSpec,
        prompt: { positive: prompt.positive, negative: prompt.negative },
        providerPayload: providerPreview,
        outputUrl: null,
        error: { errorMessage: "missing_generated_image_url", errorCode: "MISSING_IMAGE_URL" },
        renderDebug: compactRenderPanelDebug({
          panel,
          spec: enrichedSpec,
          canonicalPanel: canonicalPanelForDump,
          reserveTextArea,
          imageUrl: null,
          lastQa: null,
          attempts: descriptor.renderAttempts,
          finalStatus: "failed",
        }),
      });
    } else if (!lastQa) {
      delta.failedCount += 1;
      descriptor.finalStatus = "failed";
      descriptor.error = "visual_qa_not_run";
      descriptor.imageUrl = imageUrl;
      descriptor.provider = providerOut;
      descriptor.model = modelOut;
      descriptor.seed = seedOut;
      await dumpPanelDebugArtifacts({
        chapterId,
        panelId: enrichedSpec.panelId,
        phase: "post_failure",
        blueprint: panel,
        renderSpec: enrichedSpec,
        prompt: { positive: prompt.positive, negative: prompt.negative },
        providerPayload: providerPreview,
        outputUrl: imageUrl,
        error: { errorMessage: "visual_qa_not_run", errorCode: "VISUAL_QA_NOT_RUN" },
        renderDebug: compactRenderPanelDebug({
          panel,
          spec: enrichedSpec,
          canonicalPanel: canonicalPanelForDump,
          reserveTextArea,
          imageUrl,
          lastQa: null,
          attempts: descriptor.renderAttempts,
          finalStatus: "failed",
        }),
      });
    } else if (lastQa.passed) {
      delta.renderedCount += 1;
      delta.visualQaPassedCount += 1;
      const attemptsUsed = descriptor.renderAttempts?.length ?? 1;
      if (attemptsUsed > 1) {
        delta.passedAfterRetryCount += 1;
        descriptor.finalStatus = "passed_after_retry";
      } else {
        descriptor.finalStatus = "passed";
      }
      descriptor.imageUrl = imageUrl;
      descriptor.provider = providerOut;
      descriptor.model = modelOut;
      descriptor.seed = seedOut;
      await dumpPanelDebugArtifacts({
        chapterId,
        panelId: enrichedSpec.panelId,
        phase: "post_success",
        blueprint: panel,
        renderSpec: enrichedSpec,
        prompt: { positive: prompt.positive, negative: prompt.negative },
        providerPayload: providerPreview,
        outputUrl: imageUrl,
        renderDebug: compactRenderPanelDebug({
          panel,
          spec: enrichedSpec,
          canonicalPanel: canonicalPanelForDump,
          reserveTextArea,
          imageUrl,
          lastQa,
          attempts: descriptor.renderAttempts,
          finalStatus: descriptor.finalStatus ?? null,
        }),
      });
    } else {
      delta.visualQaFailedCount += 1;
      delta.manualReviewRequiredCount += 1;
      descriptor.finalStatus = "manual_review_required";
      descriptor.error = "visual_qa_failed";
      const reasonsJoined = lastQa.reasons.length > 0 ? lastQa.reasons.join(" | ") : "visual_qa_failed";
      descriptor.renderFailure = {
        panelId: enrichedSpec.panelId,
        renderMode: enrichedSpec.renderMode,
        locationName: enrichedSpec.locationName,
        mustShow: [...enrichedSpec.constraints.mustShow],
        errorCode: "VISUAL_QA_FAILED",
        errorMessage: reasonsJoined,
      };
      descriptor.imageUrl = imageUrl;
      descriptor.provider = providerOut;
      descriptor.model = modelOut;
      descriptor.seed = seedOut;
      renderError = {
        panelId: panel.panelId,
        error: formatRenderFailure(descriptor.renderFailure),
      };
      console.error(
        `[visual-qa] panel_blocked panel=${enrichedSpec.panelId} reasons=${reasonsJoined.slice(0, 200)}`,
      );
      await dumpPanelDebugArtifacts({
        chapterId,
        panelId: enrichedSpec.panelId,
        phase: "post_failure",
        blueprint: panel,
        renderSpec: enrichedSpec,
        prompt: { positive: prompt.positive, negative: prompt.negative },
        providerPayload: providerPreview,
        outputUrl: imageUrl,
        error: { errorMessage: reasonsJoined, errorCode: "VISUAL_QA_FAILED" },
        renderDebug: compactRenderPanelDebug({
          panel,
          spec: enrichedSpec,
          canonicalPanel: canonicalPanelForDump,
          reserveTextArea,
          imageUrl,
          lastQa,
          attempts: descriptor.renderAttempts,
          finalStatus: "manual_review_required",
        }),
      });
    }
  } catch (err) {
    delta.failedCount += 1;
    descriptor.finalStatus = "failed";
    const msg = err instanceof Error ? err.message : String(err);
    const detail: RenderPassImageFailureDetail = {
      panelId: enrichedSpec.panelId,
      renderMode: enrichedSpec.renderMode,
      locationName: enrichedSpec.locationName,
      mustShow: [...enrichedSpec.constraints.mustShow],
      errorCode: "GENERATE_PANEL_IMAGE_THREW",
      errorMessage: msg,
    };
    descriptor.renderFailure = detail;
    descriptor.error = `render_threw: ${msg}`;
    renderError = { panelId: panel.panelId, error: formatRenderFailure(detail) };
    await dumpPanelDebugArtifacts({
      chapterId,
      panelId: enrichedSpec.panelId,
      phase: "post_failure",
      blueprint: panel,
      renderSpec: enrichedSpec,
      prompt: { positive: prompt.positive, negative: prompt.negative },
      providerPayload: providerPreview,
      error: err,
      renderDebug: compactRenderPanelDebug({
        panel,
        spec: enrichedSpec,
        canonicalPanel: canonicalPanelForDump,
        reserveTextArea: reserveTextAreaForDump,
        imageUrl: null,
        lastQa: null,
        attempts: undefined,
        finalStatus: "failed",
      }),
    });
  }

  return { descriptor, delta, warning, renderError };
}
