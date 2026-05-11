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
 * pas réellement appel FAL — c'est la passe images historique qui
 * continue à rendre). Quand on activera le flag et qu'on aura validé les
 * routes FAL v3 en prod, on basculera `generatePanelImage` vers l'adapter
 * FAL réel et on pourra désactiver le legacy.
 *
 * Le module est splitté (audit-v9) en :
 *   - `render-pass-types`         : interfaces + erreurs hard-fail
 *   - `render-pass-helpers`       : helpers purs (debug, lookup canonique…)
 *   - `render-pass-preflight`     : phase A (build specs/routes/prompts)
 *   - `render-pass-execute-panel` : phase B par panel (FAL + visual-qa loop)
 *   - `render-pass-persist`       : phase C (persistance fail-hard)
 */

import type { PanelRenderSpec } from "@manga-ai-studio/ai";
import {
  saveRenderPassResult,
  type RenderPassResultSummary,
} from "../persistence/render-persistence";
import { runPageQaPass } from "./page-qa-pass";
import { runPanelQaPass } from "./panel-qa-pass";
import { canonicalPanelByIdFromPlan } from "./render-pass-helpers";
import { runRenderPreflight } from "./render-pass-preflight";
import { executePanel } from "./render-pass-execute-panel";
import { persistRendered } from "./render-pass-persist";
import type {
  RenderedPanelDescriptor,
  RunRenderPassInput,
  RunRenderPassResult,
} from "./render-pass-types";

// Re-exports : API stable pour les consommateurs du pipeline.
export type {
  GeneratePanelImageResult,
  RenderPassImageFailureDetail,
  RenderedPanelDescriptor,
  RunRenderPassInput,
  RunRenderPassResult,
} from "./render-pass-types";

export {
  RenderQueueIncompleteError,
  V3ImagePersistenceError,
} from "./render-pass-types";

export async function runRenderPass(input: RunRenderPassInput): Promise<RunRenderPassResult> {
  const startedAt = new Date();
  const specs: PanelRenderSpec[] = [];
  const rendered: RenderedPanelDescriptor[] = [];
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

  // ── Phase A — Preflight
  const preflight = runRenderPreflight({
    storyboardPlan: input.storyboardPlan,
    styleBible: input.styleBible,
    visualMemory: input.visualMemory,
    characters: input.characters,
    mainCharacterIds: input.mainCharacterIds,
    premiumOutOfContractPromptCheck: input.premiumOutOfContractPromptCheck,
    generatePanelImage: input.generatePanelImage,
  });
  failedCount += preflight.failedCount;

  // ── Phase B — Render
  for (const entry of preflight.preflightQueue) {
    const { panel, spec: enrichedSpec, route, prompt } = entry;
    specs.push(enrichedSpec);

    if (!input.generatePanelImage) {
      const descriptor: RenderedPanelDescriptor = { spec: enrichedSpec, prompt, route };
      rendered.push(descriptor);
      skippedCount += 1;
      continue;
    }

    const canonicalPanelForDump = canonicalByPanelId.get(enrichedSpec.panelId) ?? null;

    const outcome = await executePanel({
      chapterId: input.chapterId,
      projectId: input.projectId,
      generationRunId: input.generationRunId,
      panel,
      enrichedSpec,
      route,
      prompt,
      canonicalPanelForDump,
      visualMemory: input.visualMemory,
      generatePanelImage: input.generatePanelImage,
    });

    rendered.push(outcome.descriptor);
    renderedCount += outcome.delta.renderedCount;
    failedCount += outcome.delta.failedCount;
    visualQaPassedCount += outcome.delta.visualQaPassedCount;
    visualQaFailedCount += outcome.delta.visualQaFailedCount;
    manualReviewRequiredCount += outcome.delta.manualReviewRequiredCount;
    passedAfterRetryCount += outcome.delta.passedAfterRetryCount;
    if (outcome.warning) warnings.push(outcome.warning);
    if (outcome.renderError) renderErrors.push(outcome.renderError);
  }

  const errors = [...preflight.preflightErrors, ...renderErrors];

  // ── QA panel + page (toujours, pas seulement quand on a rendu)
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
    totalPanels: preflight.allPanels.length,
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

  // ── Phase C — Persistance fail-hard
  if (input.persistToDb && rendered.length > 0) {
    const persisted = await persistRendered({
      chapterId: input.chapterId,
      storyboardPlan: input.storyboardPlan,
      rendered,
      generationRunId: input.generationRunId ?? null,
      preflightErrors: preflight.preflightErrors,
    });
    if (persisted.warnings.length > 0) {
      summary.warnings.push(...persisted.warnings);
    }
  }

  return { summary, specs, rendered, panelQa, pageQa };
}
