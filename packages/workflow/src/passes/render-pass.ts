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
  HeroWithoutReferencesError,
  MissingDedicatedFaceCloseupRefError,
  buildPanelRenderSpec,
  MissingMainCharacterRefError,
  resolveFalRenderRoute,
  UnknownRenderModeError,
  type ChapterStyleBible,
  type ChapterVisualMemory,
  type FalRenderRoute,
  type PanelRenderSpec,
  type StoryboardPlan,
} from "@manga-ai-studio/ai";
import type { StoryboardPanel } from "@manga-ai-studio/ai/contracts";
import {
  saveRenderPassResult,
  type RenderPassResultSummary,
} from "../persistence/render-persistence";
import {
  persistV3RenderedPanels,
  type V3RenderedPanelRecord,
} from "../persistence/v3-scene-image-persistence";
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

export interface RunRenderPassInput {
  chapterId: string;
  storyboardPlan: StoryboardPlan;
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
}

export interface RunRenderPassResult {
  summary: RenderPassResultSummary;
  specs: PanelRenderSpec[];
  rendered: RenderedPanelDescriptor[];
  panelQa: PanelQaPassOutput;
  pageQa: PageQaPassOutput;
}

export async function runRenderPass(input: RunRenderPassInput): Promise<RunRenderPassResult> {
  const startedAt = new Date();
  const specs: PanelRenderSpec[] = [];
  const rendered: RenderedPanelDescriptor[] = [];
  const errors: Array<{ panelId: string; error: string }> = [];
  const warnings: string[] = [];
  let renderedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  const allPanels: StoryboardPanel[] = input.storyboardPlan.pages.flatMap((p) => p.panels);
  let previousPanel: StoryboardPanel | null = null;

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
        errors.push({ panelId: panel.panelId, error: err.message });
        failedCount += 1;
        previousPanel = panel;
        continue;
      }
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({ panelId: panel.panelId, error: `spec_build_failed: ${msg}` });
      failedCount += 1;
      previousPanel = panel;
      continue;
    }

    try {
      assertValidRenderSpec(spec);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({ panelId: panel.panelId, error: `spec_invalid: ${msg}` });
      failedCount += 1;
      previousPanel = panel;
      continue;
    }

    // P7 — garde strict face closeup : un panel en renderMode closeup
    // doit avoir une face ref dédiée (chargée depuis CharacterVisualRef
    // avec metadata closeup) pour chaque personnage principal visible.
    // Plus de fallback silencieux vers la silhouette/outfit.
    // PATCH 4 — on n'applique ce guard qu'aux modes où le visage doit
    // être reconnaissable. Les modes environment/creature/aftermath/silhouette
    // peuvent s'en passer.
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
          errors.push({ panelId: panel.panelId, error: `missing_face_closeup_ref: ${err.message}` });
          failedCount += 1;
          previousPanel = panel;
          continue;
        }
        throw err;
      }
    }

    // COMMIT C — le routeur v3 peut refuser un spec qui traînerait malgré
    // le validator (renderMode inconnu / hero visible sans refs). On fail
    // ce panel proprement au lieu de casser tout le render-pass.
    let route: FalRenderRoute;
    try {
      route = resolveFalRenderRoute(spec);
    } catch (err) {
      if (err instanceof UnknownRenderModeError) {
        errors.push({
          panelId: panel.panelId,
          error: `route_unknown_render_mode:${err.renderMode}`,
        });
        failedCount += 1;
        previousPanel = panel;
        continue;
      }
      if (err instanceof HeroWithoutReferencesError) {
        errors.push({
          panelId: panel.panelId,
          error: `route_hero_without_references:${err.renderMode}`,
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
        errors.push({
          panelId: panel.panelId,
          error: `contradictory_prompt:${err.renderMode}:${err.violations.join("|")}`,
        });
        failedCount += 1;
        previousPanel = panel;
        continue;
      }
      throw err;
    }

    specs.push(enrichedSpec);
    const descriptor: RenderedPanelDescriptor = { spec: enrichedSpec, prompt, route };
    rendered.push(descriptor);

    if (!input.generatePanelImage) {
      skippedCount += 1;
      previousPanel = panel;
      continue;
    }

    const providerPreview = buildProviderPayloadPreview(enrichedSpec, route);
    await dumpPanelDebugArtifacts({
      chapterId: input.chapterId,
      panelId: enrichedSpec.panelId,
      phase: "pre_generate",
      blueprint: panel,
      renderSpec: enrichedSpec,
      prompt: { positive: prompt.positive, negative: prompt.negative },
      providerPayload: providerPreview,
    });

    try {
      const res = await input.generatePanelImage({
        spec: enrichedSpec,
        prompt: prompt.positive,
        negative: prompt.negative,
        route,
      });
      if (res.ok) {
        renderedCount += 1;
        descriptor.imageUrl = res.imageUrl ?? null;
        descriptor.provider = res.provider ?? null;
        descriptor.model = res.model ?? null;
        descriptor.seed = res.seed ?? null;
        descriptor.error = null;
        descriptor.renderFailure = null;
        await dumpPanelDebugArtifacts({
          chapterId: input.chapterId,
          panelId: enrichedSpec.panelId,
          phase: "post_success",
          blueprint: panel,
          renderSpec: enrichedSpec,
          prompt: { positive: prompt.positive, negative: prompt.negative },
          providerPayload: providerPreview,
          outputUrl: res.imageUrl ?? null,
        });
      } else {
        failedCount += 1;
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
        errors.push({ panelId: panel.panelId, error: formatRenderFailure(detail) });
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
        });
      }
    } catch (err) {
      failedCount += 1;
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
      errors.push({ panelId: panel.panelId, error: formatRenderFailure(detail) });
      await dumpPanelDebugArtifacts({
        chapterId: input.chapterId,
        panelId: enrichedSpec.panelId,
        phase: "post_failure",
        blueprint: panel,
        renderSpec: enrichedSpec,
        prompt: { positive: prompt.positive, negative: prompt.negative },
        providerPayload: providerPreview,
        error: err,
      });
    }

    previousPanel = panel;
  }

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

  const summary: RenderPassResultSummary = {
    chapterId: input.chapterId,
    totalPanels: allPanels.length,
    renderedCount,
    failedCount,
    skippedCount,
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

    try {
      persistResult = await persistV3RenderedPanels({
        chapterId: input.chapterId,
        storyboardPlan: input.storyboardPlan,
        rendered: rendered as V3RenderedPanelRecord[],
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
    if (persistResult.imagesSkipped > 0) {
      const missingPanels = persistResult.warnings
        .filter((w) => w.startsWith("panel_not_rendered"))
        .map((w) => w.match(/panelId=([^\s]+)/)?.[1] ?? "unknown");

      console.error(
        `[render-pass:persist] incomplete chapterId=${input.chapterId} ` +
          `expected=${expectedPanelIds.length} persisted=${persistResult.imagesUpserted} ` +
          `skipped=${persistResult.imagesSkipped}`,
      );

      throw new V3ImagePersistenceError({
        chapterId: input.chapterId,
        expectedPanels: expectedPanelIds.length,
        persistedPanels: persistResult.imagesUpserted,
        missingPanels,
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
