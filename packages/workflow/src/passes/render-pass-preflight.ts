/**
 * render-pass-preflight.ts
 *
 * PHASE A — Build specs / routes / prompts AVANT tout appel FAL.
 * Si la queue est incomplète (errors > 0), on fail-fast. Aucun appel FAL
 * n'est lancé tant que la phase n'a pas validé l'ensemble. Extrait de
 * `render-pass.ts` (audit-v9).
 */

import {
  ContradictoryPanelPromptError,
  HardLockWithoutReferencesError,
  HeroWithoutReferencesError,
  MissingDedicatedFaceCloseupRefError,
  MissingMainCharacterRefError,
  NegationInPositivePromptError,
  StrongPolicyWithoutRefsError,
  UnknownRenderModeError,
  assertDedicatedFaceCloseupForPanel,
  assertValidRenderSpec,
  buildMinimalPanelPromptStrict,
  buildPanelRenderSpec,
  repairRenderSpecContradictions,
  resolveFalRenderRoute,
  type ChapterStyleBible,
  type ChapterVisualMemory,
  type FalRenderRoute,
  type PanelRenderSpec,
  type StoryboardPlan,
} from "@manga-ai-studio/ai";
import type { StoryboardPanel } from "@manga-ai-studio/ai/contracts";
import type { CharacterVisualDna } from "@manga-ai-studio/core";
import { assertNoOutOfContractEntitiesInPrompt } from "./assert-no-out-of-contract-entities";
import { enrichPanelRenderSpecForRenderPass } from "./enrich-panel-render-spec";
import { buildLoraByCharacterIdMap } from "./resolve-panel-lora-bindings";
import { requiresDedicatedFaceRef } from "./render-pass-helpers";
import { RenderQueueIncompleteError } from "./render-pass-types";
import { logPipelineInfo, logPipelineWarn, logPipelineError } from "../lib/pipeline-logger";

export interface PreflightEntry {
  panel: StoryboardPanel;
  spec: PanelRenderSpec;
  route: FalRenderRoute;
  prompt: { positive: string; negative: string };
}

export interface RunRenderPreflightInput {
  storyboardPlan: StoryboardPlan;
  styleBible: ChapterStyleBible;
  visualMemory: ChapterVisualMemory;
  characters: Array<{
    id: string;
    name: string;
    loraUrl?: string | null;
    loraTriggerWord?: string | null;
    loraScale?: number | null;
    characterVisualDna?: CharacterVisualDna | null;
    [key: string]: unknown;
  }>;
  mainCharacterIds: string[];
  premiumOutOfContractPromptCheck?: boolean;
  generatePanelImage: unknown;
}

export interface RunRenderPreflightResult {
  preflightQueue: PreflightEntry[];
  preflightErrors: Array<{ panelId: string; error: string }>;
  failedCount: number;
  loraByCharacterId: ReturnType<typeof buildLoraByCharacterIdMap>;
  allPanels: StoryboardPanel[];
}

export function runRenderPreflight(input: RunRenderPreflightInput): RunRenderPreflightResult {
  const preflightQueue: PreflightEntry[] = [];
  const preflightErrors: Array<{ panelId: string; error: string }> = [];
  let failedCount = 0;

  const loraByCharacterId = buildLoraByCharacterIdMap(
    input.characters.map((c) => ({
      characterId: c.id,
      loraUrl: c.loraUrl ?? undefined,
      loraTriggerWord: c.loraTriggerWord ?? undefined,
      loraScale: c.loraScale ?? undefined,
    })),
  );

  const allPanels: StoryboardPanel[] = input.storyboardPlan.pages.flatMap((p) => p.panels);
  let previousPanel: StoryboardPanel | null = null;

  logPipelineInfo("pipeline.v3.render.preflight.building_specs_for_panels", { message: `building specs for ${allPanels.length} panels...` });

  for (const panel of allPanels) {
    let spec: PanelRenderSpec;
    try {
      spec = buildPanelRenderSpec({
        panel,
        styleBible: input.styleBible,
        visualMemory: input.visualMemory,
        characters: input.characters as never,
        mainCharacterIds: input.mainCharacterIds,
        premiumOnly: input.premiumOutOfContractPromptCheck === true,
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
      loraByCharacterId,
    });

    // P8 — Réparer les contradictions AVANT d'assembler le prompt
    const repairResult = repairRenderSpecContradictions(enrichedSpec);
    const specForPrompt = repairResult.spec;
    if (repairResult.repaired) {
      // FIXME(logger): migrate to logPipeline*
      console.info(
        `[render-spec-contradiction-repair] panel=${panel.panelId} repairs=${repairResult.repairs.join("+")}`,
      );
    }

    let prompt;
    try {
      prompt = buildMinimalPanelPromptStrict(specForPrompt);
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

    if (input.premiumOutOfContractPromptCheck) {
      try {
        assertNoOutOfContractEntitiesInPrompt({
          panelId: panel.panelId,
          positivePrompt: prompt.positive,
          spec: specForPrompt,
        });
      } catch (err) {
        preflightErrors.push({
          panelId: panel.panelId,
          error: err instanceof Error ? err.message : String(err),
        });
        failedCount += 1;
        previousPanel = panel;
        continue;
      }
    }

    preflightQueue.push({ panel, spec: specForPrompt, route, prompt });
    previousPanel = panel;
  }

  // FIXME(logger): migrate to logPipeline*

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
    // FIXME(logger): migrate to logPipeline*
    console.warn(
      `[pipeline:v3:render-preflight:errors] ` +
        [...grouped.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([error, count]) => `${count}x ${error}`)
          .join(" || "),
    );
  }

  // PHASE A.2 — Check preflight : si queue incomplète au-delà du seuil, fail AVANT FAL
  if (preflightErrors.length > 0 && input.generatePanelImage) {
    const errorRatio = preflightErrors.length / allPanels.length;
    const MAX_PREFLIGHT_ERROR_RATIO = 0.05;
    if (errorRatio > MAX_PREFLIGHT_ERROR_RATIO) {
      throw new RenderQueueIncompleteError(allPanels.length, preflightQueue.length, preflightErrors);
    }
    // FIXME(logger): migrate to logPipeline*
    console.warn(
      `[pipeline:v3:render-preflight] ${preflightErrors.length}/${allPanels.length} panel(s) skipped (${(errorRatio * 100).toFixed(1)}% ≤ ${(MAX_PREFLIGHT_ERROR_RATIO * 100).toFixed(0)}% threshold) — rendering ${preflightQueue.length} panels`,
    );
  }

  return { preflightQueue, preflightErrors, failedCount, loraByCharacterId, allPanels };
}
