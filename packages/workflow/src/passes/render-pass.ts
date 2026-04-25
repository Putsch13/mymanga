/**
 * render-pass — étape 3 de la pipeline v3 (Panel Renderer).
 *
 * Entrée : StoryboardPlan (déjà validé) + ChapterVisualMemory + style bible.
 * Sortie : specs + prompts + QA panel/page + summary persisté dans
 *          `outline.renderResultV2`.
 *
 * Règles strictes :
 *   - NE décide PAS la dramaturgie (ça c'est IA2/storyboard-pass)
 *   - pour chaque panel : buildPanelRenderSpec → assertValidRenderSpec →
 *     buildMinimalPanelPrompt → resolveFalRenderRoute → generatePanelImage
 *   - refs persos hero/support OBLIGATOIRES (chapter-visual-memory +
 *     resolvePanelReferences lèvent `MissingMainCharacterRefError` sinon)
 *   - le routage FAL vient STRICTEMENT de `renderMode` (pas de regex/heuristique)
 *
 * Note d'intégration legacy : tant que `PIPELINE_V3_STORYBOARD` n'est pas ON,
 * le render-pass tourne en shadow (il persiste specs/QA/prompts mais ne fait
 * pas réellement appel FAL — c'est le `image-generation-pass` legacy qui
 * continue à rendre). Quand on activera le flag et qu'on aura validé les
 * routes FAL v3 en prod, on basculera `generatePanelImage` vers l'adapter
 * FAL réel et on pourra désactiver le legacy.
 */

import {
  assertValidRenderSpec,
  assertDedicatedFaceCloseupForPanel,
  buildMinimalPanelPromptStrict,
  ContradictoryPanelPromptError,
  HardLockWithoutReferencesError,
  NegationInPositivePromptError,
  HeroWithoutReferencesError,
  MissingDedicatedFaceCloseupRefError,
  buildPanelRenderSpec,
  MissingMainCharacterRefError,
  resolveFalRenderRoute,
  UnknownRenderModeError,
  StrongPolicyWithoutRefsError,
  type ChapterStyleBible,
  type ChapterVisualMemory,
  type FalRenderRoute,
  type PanelRenderSpec,
  type StoryboardPlan,
} from "@manga-ai-studio/ai";
import type { StoryboardPanel } from "@manga-ai-studio/ai/contracts";
import {
  PRODUCTION_RULES,
  type CanonicalChapterProductionPlan,
  type CanonicalPanelPlan,
} from "@manga-ai-studio/core";
import {
  buildRetryPrompt,
  buildVisualQaInputFromRenderSpec,
  runVisualPanelQaWithOptionalVision,
  type VisualQaResult,
} from "@manga-ai-studio/ai";
import {
  saveRenderPassResult,
  type RenderPassResultSummary,
} from "../persistence/render-persistence";
import {
  persistV3RenderedPanels,
  type PanelFinalStatus,
  type V3PanelRenderAttemptLog,
  type V3RenderedPanelRecord,
} from "../persistence/v3-scene-image-persistence";
import { startChapterImageGenerationRun } from "../persistence/chapter-generation-run";
import { runPanelQaPass, type PanelQaPassOutput } from "./panel-qa-pass";
import { runPageQaPass, type PageQaPassOutput } from "./page-qa-pass";
import { enrichPanelRenderSpecForRenderPass } from "./enrich-panel-render-spec";
import {
  buildProviderPayloadPreview,
  dumpPanelDebugArtifacts,
} from "../debug/panel-debug-dump";

/** Détail structuré d’un échec image (logs / persistance / debug). */
export interface RenderPassImageFailureDetail {
  panelId: string;
  renderMode: PanelRenderSpec["renderMode"];
  locationName: string;
  mustShow: string[];
  errorCode: string;
  errorMessage: string;
}

export interface RenderedPanelDescriptor {
  spec: PanelRenderSpec;
  prompt: { positive: string; negative: string };
  route: FalRenderRoute;
  imageUrl?: string | null;
  provider?: string | null;
  model?: string | null;
  seed?: number | null;
  error?: string | null;
  renderFailure?: RenderPassImageFailureDetail | null;
  /** QA visuelle (heuristique + vision si `VISUAL_PANEL_QA_VISION`) après rendu. */
  visualQa?: VisualQaResult | null;
  /** Tentatives FAL + scores QA (persistées en DB). */
  renderAttempts?: V3PanelRenderAttemptLog[];
  /** Après QA visuelle : livrable ou relecture manuelle. */
  finalStatus?: PanelFinalStatus | null;
}

export interface GeneratePanelImageResult {
  ok: boolean;
  error?: string;
  /** Code machine stable (ex. FAL_TIMEOUT) quand l’adapter le fournit. */
  errorCode?: string;
  imageUrl?: string;
  provider?: string;
  model?: string;
  seed?: number | null;
}

function formatRenderFailure(detail: RenderPassImageFailureDetail): string {
  return `render_failed:${JSON.stringify(detail)}`;
}

/**
 * P0.2 — Erreur bloquante quand la queue de rendu est incomplète.
 * On refuse de payer FAL si le nombre de specs valides != totalPanels.
 */
export class RenderQueueIncompleteError extends Error {
  constructor(
    public readonly totalPanels: number,
    public readonly specsCount: number,
    public readonly preflightErrors: Array<{ panelId: string; error: string }>,
  ) {
    const errorsPreview = preflightErrors
      .slice(0, 5)
      .map((e) => `${e.panelId}:${e.error.substring(0, 50)}`)
      .join(" | ");
    super(
      `premium_render_queue_incomplete totalPanels=${totalPanels} specs=${specsCount} errors=${errorsPreview}`,
    );
    this.name = "RenderQueueIncompleteError";
  }
}

/**
 * P0.2 — Erreur bloquante quand la persistance V3 échoue.
 * Un job ne peut être completed que si toutes les images sont persistées.
 */
export class V3ImagePersistenceError extends Error {
  readonly chapterId: string;
  readonly expectedPanels: number;
  readonly persistedPanels: number;
  readonly missingPanels: string[];
  readonly cause?: Error;

  constructor(args: {
    chapterId: string;
    expectedPanels: number;
    persistedPanels: number;
    missingPanels: string[];
    cause?: Error;
  }) {
    const msg =
      `V3_IMAGE_PERSISTENCE_FAILED chapterId=${args.chapterId} ` +
      `expected=${args.expectedPanels} persisted=${args.persistedPanels} ` +
      `missing=[${args.missingPanels.slice(0, 5).join(", ")}${args.missingPanels.length > 5 ? "..." : ""}]`;
    super(msg);
    this.name = "V3ImagePersistenceError";
    this.chapterId = args.chapterId;
    this.expectedPanels = args.expectedPanels;
    this.persistedPanels = args.persistedPanels;
    this.missingPanels = args.missingPanels;
    this.cause = args.cause;
  }
}

/**
 * Indique si ce renderMode nécessite une face ref dédiée closeup.
 * Les modes où le visage doit être reconnaissable requièrent la ref.
 * Les modes environnement/creature/aftermath/silhouette peuvent s'en passer.
 */
function requiresDedicatedFaceRef(spec: PanelRenderSpec): boolean {
  return (
    spec.renderMode === "hero_closeup" ||
    spec.renderMode === "reaction_closeup" ||
    spec.renderMode === "npc_closeup" ||
    spec.renderMode === "enemy_closeup" ||
    spec.renderMode === "dialogue_over_shoulder" ||
    spec.renderMode === "dialogue_two_shot"
  );
}

function canonicalPanelByIdFromPlan(
  plan: CanonicalChapterProductionPlan | null | undefined,
): Map<string, CanonicalPanelPlan> {
  const map = new Map<string, CanonicalPanelPlan>();
  if (!plan?.panels?.length) return map;
  for (const p of plan.panels) {
    map.set(p.panelId, p);
  }
  return map;
}

export interface RunRenderPassInput {
  chapterId: string;
  storyboardPlan: StoryboardPlan;
  /** Plan canonique (premium) — alimente la QA visuelle critique + debug. */
  canonicalProductionPlan?: CanonicalChapterProductionPlan | null;
  styleBible: ChapterStyleBible;
  visualMemory: ChapterVisualMemory;
  characters: Array<{ id: string; name: string; roleType?: string | null }>;
  mainCharacterIds: string[];
  allowedLocations?: string[];
  forbiddenTags?: string[];
  generatePanelImage?: (args: {
    spec: PanelRenderSpec;
    prompt: string;
    negative: string;
    route: FalRenderRoute;
  }) => Promise<GeneratePanelImageResult>;
  /**
   * COMMIT B — quand `true` (défaut), persiste les panels rendus comme
   * `SceneImage` en DB (via `persistV3RenderedPanels`). Permet au reader
   * de consommer la sortie v3 sans que le legacy `image-generation-pass`
   * tourne. À laisser à `false` uniquement en tests unitaires.
   */
  persistToDb?: boolean;
  /**
   * P1.14 — Si absent et `persistToDb`, un nouveau run est créé (chapter + purge
   * des SceneImage non validées). Fournir une valeur pour les tests sans DB.
   */
  generationRunId?: string | null;
  /**
   * Prod premium : config QA vision incomplète mais lancement autorisé
   * (`PREMIUM_VISUAL_QA_REQUIRED=false`) — force `v3RenderQualityStatus=needs_review`.
   */
  visualQaProductionConfigIncomplete?: boolean;
}

export interface RunRenderPassResult {
  summary: RenderPassResultSummary;
  specs: PanelRenderSpec[];
  rendered: RenderedPanelDescriptor[];
  panelQa: PanelQaPassOutput;
  pageQa: PageQaPassOutput;
}

function compactRenderPanelDebug(input: {
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

export async function runRenderPass(input: RunRenderPassInput): Promise<RunRenderPassResult> {
  const startedAt = new Date();
  const specs: PanelRenderSpec[] = [];
  const rendered: RenderedPanelDescriptor[] = [];
  const preflightErrors: Array<{ panelId: string; error: string }> = [];
  const renderErrors: Array<{ panelId: string; error: string }> = [];
  const warnings: string[] = [];
  let renderedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  let visualQaFailedCount = 0;
  let manualReviewRequiredCount = 0;
  let passedAfterRetryCount = 0;
  let visualQaPassedCount = 0;

  const canonicalByPanelId = canonicalPanelByIdFromPlan(input.canonicalProductionPlan ?? undefined);

  const allPanels: StoryboardPanel[] = input.storyboardPlan.pages.flatMap((p) => p.panels);
  let previousPanel: StoryboardPanel | null = null;

  // PHASE A — Preflight : build specs/routes/prompts AVANT tout appel FAL.
  // Si le queue est incomplète (errors > 0), on fail-fast et on ne paye pas FAL.
  interface PreflightEntry {
    panel: StoryboardPanel;
    spec: PanelRenderSpec;
    route: FalRenderRoute;
    prompt: { positive: string; negative: string };
  }
  const preflightQueue: PreflightEntry[] = [];

  console.info(`[pipeline:v3:render-preflight] building specs for ${allPanels.length} panels...`);

  for (const panel of allPanels) {
    let spec: PanelRenderSpec;
    try {
      spec = buildPanelRenderSpec({
        panel,
        styleBible: input.styleBible,
        visualMemory: input.visualMemory,
        characters: input.characters,
        mainCharacterIds: input.mainCharacterIds,
      });
    } catch (err) {
      if (err instanceof MissingMainCharacterRefError) {
        preflightErrors.push({ panelId: panel.panelId, error: err.message });
        failedCount += 1;
        previousPanel = panel;
        continue;
      }
      const msg = err instanceof Error ? err.message : String(err);
      preflightErrors.push({ panelId: panel.panelId, error: `spec_build_failed: ${msg}` });
      failedCount += 1;
      previousPanel = panel;
      continue;
    }

    try {
      assertValidRenderSpec(spec);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      preflightErrors.push({ panelId: panel.panelId, error: `spec_invalid: ${msg}` });
      failedCount += 1;
      previousPanel = panel;
      continue;
    }

    // P7 — garde strict face closeup
    if (requiresDedicatedFaceRef(spec)) {
      try {
        const visibleMain = spec.visibleCharacters.filter(
          (c) => c.role === "hero" || c.role === "support" || c.role === "enemy",
        );
        for (const c of visibleMain) {
          const entry = input.visualMemory.characters.get(c.characterId);
          assertDedicatedFaceCloseupForPanel({
            characterId: c.characterId,
            faceCloseupRefUrl: entry?.faceRefUrl ?? null,
            renderMode: spec.renderMode,
            panelId: spec.panelId,
          });
        }
      } catch (err) {
        if (err instanceof MissingDedicatedFaceCloseupRefError) {
          preflightErrors.push({ panelId: panel.panelId, error: `missing_face_closeup_ref: ${err.message}` });
          failedCount += 1;
          previousPanel = panel;
          continue;
        }
        throw err;
      }
    }

    // COMMIT C — le routeur v3 peut refuser un spec
    let route: FalRenderRoute;
    try {
      route = resolveFalRenderRoute(spec);
    } catch (err) {
      if (err instanceof UnknownRenderModeError) {
        preflightErrors.push({
          panelId: panel.panelId,
          error: `route_unknown_render_mode:${err.renderMode}`,
        });
        failedCount += 1;
        previousPanel = panel;
        continue;
      }
      if (err instanceof HeroWithoutReferencesError) {
        preflightErrors.push({
          panelId: panel.panelId,
          error: `route_hero_without_references:${err.renderMode}`,
        });
        failedCount += 1;
        previousPanel = panel;
        continue;
      }
      if (err instanceof StrongPolicyWithoutRefsError) {
        preflightErrors.push({
          panelId: panel.panelId,
          error: `route_strong_policy_without_refs:${err.renderMode}`,
        });
        failedCount += 1;
        previousPanel = panel;
        continue;
      }
      throw err;
    }

    const enrichedSpec = enrichPanelRenderSpecForRenderPass({
      spec,
      panel,
      visualMemory: input.visualMemory,
      mainCharacterIds: input.mainCharacterIds,
      route,
      previousPanel,
    });

    let prompt;
    try {
      prompt = buildMinimalPanelPromptStrict(enrichedSpec);
    } catch (err) {
      if (err instanceof ContradictoryPanelPromptError) {
        preflightErrors.push({
          panelId: panel.panelId,
          error: `contradictory_prompt:${err.renderMode}:${err.violations.join("|")}`,
        });
        failedCount += 1;
        previousPanel = panel;
        continue;
      }
      // P0.5 — Capture des erreurs de négation dans le positif
      if (err instanceof NegationInPositivePromptError) {
        preflightErrors.push({
          panelId: panel.panelId,
          error: `negation_in_positive:${err.renderMode}:${err.negations.join("|")}`,
        });
        failedCount += 1;
        previousPanel = panel;
        continue;
      }
      // P7.C — Capture des erreurs de hard lock sans références
      if (err instanceof HardLockWithoutReferencesError) {
        preflightErrors.push({
          panelId: panel.panelId,
          error: `hard_lock_without_refs:${err.renderMode}`,
        });
        failedCount += 1;
        previousPanel = panel;
        continue;
      }
      throw err;
    }

    preflightQueue.push({ panel, spec: enrichedSpec, route, prompt });
    previousPanel = panel;
  }

  console.info(
    `[pipeline:v3:render-preflight] specs=${preflightQueue.length}/${allPanels.length} ` +
      `preflightErrors=${preflightErrors.length}`,
  );
  if (preflightErrors.length > 0) {
    const grouped = new Map<string, number>();
    for (const e of preflightErrors) {
      const key = e.error
        .replace(/panel_render_spec\[[^\]]+\]\./g, "panel_render_spec[].")
        .replace(/https?:\/\/\S+/g, "<url>")
        .slice(0, 180);
      grouped.set(key, (grouped.get(key) ?? 0) + 1);
    }
    console.warn(
      `[pipeline:v3:render-preflight:errors] ` +
        [...grouped.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([error, count]) => `${count}x ${error}`)
          .join(" || "),
    );
  }

  // PHASE A.2 — Check preflight : si queue incomplète, fail AVANT FAL
  if (preflightErrors.length > 0 && input.generatePanelImage) {
    throw new RenderQueueIncompleteError(allPanels.length, preflightQueue.length, preflightErrors);
  }

  // PHASE B — Render : appeler FAL seulement si preflight OK
  for (const entry of preflightQueue) {
    const { panel, spec: enrichedSpec, route, prompt } = entry;
    specs.push(enrichedSpec);
    const descriptor: RenderedPanelDescriptor = { spec: enrichedSpec, prompt, route };
    rendered.push(descriptor);

    if (!input.generatePanelImage) {
      skippedCount += 1;
      continue;
    }

    const providerPreview = buildProviderPayloadPreview(enrichedSpec, route);
    const canonicalPanelForDump = canonicalByPanelId.get(enrichedSpec.panelId) ?? null;
    const reserveTextAreaForDump =
      (Array.isArray(panel.dialogue) && panel.dialogue.length > 0)
      || Boolean(panel.narration?.trim())
      || (Array.isArray(panel.sfx) && panel.sfx.length > 0)
      || Boolean(enrichedSpec.panelTextPayload?.dialogue?.length)
      || Boolean(enrichedSpec.panelTextPayload?.narration?.trim());
    await dumpPanelDebugArtifacts({
      chapterId: input.chapterId,
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
      const res = await input.generatePanelImage({
        spec: enrichedSpec,
        prompt: prompt.positive,
        negative: prompt.negative,
        route,
      });
      if (res.ok) {
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
          let attempt = 1;
          while (attempt <= PRODUCTION_RULES.retry.maxImageAttempts) {
            const qaInput = buildVisualQaInputFromRenderSpec({
              panelId: enrichedSpec.panelId,
              imageUrl,
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
              imageUrl,
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
            console.warn(
              `[visual-qa] retry panel=${enrichedSpec.panelId} attempt=${attempt} strategy=${lastQa.retryStrategy ?? "refined_prompt"}`,
            );
            attempt += 1;
            const retry = buildRetryPrompt({
              panelId: enrichedSpec.panelId,
              originalPrompt: prompt.positive,
              previousResults: qaHistory,
              currentStrategy: lastQa.retryStrategy ?? "refined_prompt",
            });
            positivePrompt = retry.prompt;
            const resRetry = await input.generatePanelImage({
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
          failedCount += 1;
          descriptor.finalStatus = "failed";
          descriptor.error = "missing_generated_image_url";
          descriptor.imageUrl = null;
          descriptor.provider = providerOut;
          descriptor.model = modelOut;
          descriptor.seed = seedOut;
          await dumpPanelDebugArtifacts({
            chapterId: input.chapterId,
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
          failedCount += 1;
          descriptor.finalStatus = "failed";
          descriptor.error = "visual_qa_not_run";
          descriptor.imageUrl = imageUrl;
          descriptor.provider = providerOut;
          descriptor.model = modelOut;
          descriptor.seed = seedOut;
          await dumpPanelDebugArtifacts({
            chapterId: input.chapterId,
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
          renderedCount += 1;
          visualQaPassedCount += 1;
          const attemptsUsed = descriptor.renderAttempts?.length ?? 1;
          if (attemptsUsed > 1) {
            passedAfterRetryCount += 1;
            descriptor.finalStatus = "passed_after_retry";
          } else {
            descriptor.finalStatus = "passed";
          }
          descriptor.imageUrl = imageUrl;
          descriptor.provider = providerOut;
          descriptor.model = modelOut;
          descriptor.seed = seedOut;
          await dumpPanelDebugArtifacts({
            chapterId: input.chapterId,
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
          visualQaFailedCount += 1;
          manualReviewRequiredCount += 1;
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
          renderErrors.push({
            panelId: panel.panelId,
            error: formatRenderFailure(descriptor.renderFailure),
          });
          console.error(
            `[visual-qa] panel_blocked panel=${enrichedSpec.panelId} reasons=${reasonsJoined.slice(0, 200)}`,
          );
          await dumpPanelDebugArtifacts({
            chapterId: input.chapterId,
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
      } else {
        failedCount += 1;
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
        renderErrors.push({ panelId: panel.panelId, error: formatRenderFailure(detail) });
        await dumpPanelDebugArtifacts({
          chapterId: input.chapterId,
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
      }
    } catch (err) {
      failedCount += 1;
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
      renderErrors.push({ panelId: panel.panelId, error: formatRenderFailure(detail) });
      await dumpPanelDebugArtifacts({
        chapterId: input.chapterId,
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
  }

  const errors = [...preflightErrors, ...renderErrors];

  const panelQa = await runPanelQaPass({
    specs,
    allowedLocations: input.allowedLocations,
    forbiddenTags: input.forbiddenTags,
  });
  for (const r of panelQa.results) {
    for (const issue of r.issues) {
      warnings.push(`panel_qa.${r.panelId}.${issue}`);
    }
  }

  const pageQa = await runPageQaPass(input.storyboardPlan);
  for (const r of pageQa.results) {
    for (const issue of r.issues) {
      warnings.push(`page_qa.${r.pageNumber}.${issue}`);
    }
  }

  const v3RenderQualityStatus =
    input.visualQaProductionConfigIncomplete
    || visualQaFailedCount > 0
    || manualReviewRequiredCount > 0
      ? "needs_review"
      : "passed";

  const summary: RenderPassResultSummary = {
    chapterId: input.chapterId,
    totalPanels: allPanels.length,
    renderedCount,
    failedCount,
    skippedCount,
    visualQaFailedCount,
    manualReviewRequiredCount,
    passedAfterRetryCount,
    visualQaPassedCount,
    v3RenderQualityStatus,
    visualQaProductionConfigIncomplete: Boolean(input.visualQaProductionConfigIncomplete),
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    warnings,
    errors,
  };
  await saveRenderPassResult(input.chapterId, summary);

  // P0.2 — Persistance SceneImage FAIL-HARD.
  //
  // Un job ne peut être completed que si TOUTES les images attendues sont
  // persistées durablement en DB. Une erreur de persistance = job failed.
  if (input.persistToDb && rendered.length > 0) {
    const expectedPanelIds = rendered.map((r) => r.spec.panelId);
    let persistResult;

    let generationRunId = input.generationRunId ?? null;
    if (!generationRunId) {
      const runStart = await startChapterImageGenerationRun(input.chapterId);
      generationRunId = runStart.runId;
      console.info(
        `[render-pass:generation-run] chapterId=${input.chapterId} runId=${generationRunId} ` +
          `deletedUnvalidated=${runStart.deletedCount}`,
      );
    }

    try {
      persistResult = await persistV3RenderedPanels({
        chapterId: input.chapterId,
        storyboardPlan: input.storyboardPlan,
        rendered: rendered as V3RenderedPanelRecord[],
        generationRunId,
      });
      console.log(
        `[render-pass:persist] chapterId=${input.chapterId} scenesCreated=${persistResult.scenesCreated} scenesReused=${persistResult.scenesReused} imagesUpserted=${persistResult.imagesUpserted} imagesSkipped=${persistResult.imagesSkipped}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `[render-pass:persist] persist_failed chapterId=${input.chapterId} error=${msg}`,
      );
      throw new V3ImagePersistenceError({
        chapterId: input.chapterId,
        expectedPanels: expectedPanelIds.length,
        persistedPanels: 0,
        missingPanels: expectedPanelIds,
        cause: err instanceof Error ? err : undefined,
      });
    }

    // Vérification stricte : tous les panels attendus doivent être persistés
    // P0.6 — Inclure aussi imagesStorageFailed (upload Supabase échoué)
    if (persistResult.imagesSkipped > 0 || persistResult.imagesStorageFailed > 0) {
      const missingPanels = persistResult.warnings
        .filter((w) => w.startsWith("panel_not_rendered") || w.startsWith("storage_failed"))
        .map((w) => w.match(/panelId=([^\s]+)/)?.[1] ?? "unknown");

      console.error(
        `[render-pass:persist] incomplete chapterId=${input.chapterId} ` +
          `expected=${expectedPanelIds.length} persisted=${persistResult.imagesUpserted} ` +
          `skipped=${persistResult.imagesSkipped} storageFailed=${persistResult.imagesStorageFailed}`,
      );

      throw new V3ImagePersistenceError({
        chapterId: input.chapterId,
        expectedPanels: expectedPanelIds.length,
        persistedPanels: persistResult.imagesUpserted,
        missingPanels: missingPanels.length > 0 ? missingPanels : expectedPanelIds,
      });
    }

    if (persistResult.warnings.length > 0) {
      console.warn(
        `[render-pass:persist] warnings=${persistResult.warnings.slice(0, 5).join(" | ")}`,
      );
      summary.warnings.push(...persistResult.warnings);
    }
  }

  return { summary, specs, rendered, panelQa, pageQa };
}
