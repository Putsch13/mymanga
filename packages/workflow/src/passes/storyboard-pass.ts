/**
 * storyboard-pass — étape 2 de la pipeline v3.
 *
 * Entrée : StoryArc + cast + locations + target panel count + style bible.
 * Sortie : StoryboardPlan (persisté dans `chapter.outline.storyboardPlanV2`).
 *
 * Le StoryboardPlan décide TOUT le découpage (pages, layouts, panels,
 * renderMode, shotType, subjectFocus, cutawayType). Le render-pass ne doit
 * plus décider la dramaturgie.
 */

import {
  runMangaEditorAgent,
  runMangaEditorAgentLlm,
  validateStoryboardPlan,
  type StoryArc,
  type StoryboardPlan,
} from "@manga-ai-studio/ai";
import { saveStoryboardPlan } from "../persistence/storyboard-persistence";
import { isPipelineV3MangaEditorLlmEnabled } from "../pipeline-feature-flags";

export interface RunStoryboardPassInput {
  storyArc: StoryArc;
  targetPanelCount?: number;
  heroCharacterIds?: string[];
  /**
   * Override du flag `PIPELINE_V3_MANGA_EDITOR_LLM`. Utile pour tests.
   * Quand `true`, l'agent LLM est tenté (fallback stub si OpenAI absent).
   * Quand `false`, le stub déterministe est utilisé directement.
   */
  useLlmEditor?: boolean;
}

export interface RunStoryboardPassResult {
  storyboardPlan: StoryboardPlan;
  warnings: string[];
  blockers: string[];
}

export async function runStoryboardPass(
  input: RunStoryboardPassInput,
): Promise<RunStoryboardPassResult> {
  const useLlm = input.useLlmEditor ?? isPipelineV3MangaEditorLlmEnabled();
  const editor = useLlm ? runMangaEditorAgentLlm : runMangaEditorAgent;
  const { storyboardPlan, warnings } = await editor({
    storyArc: input.storyArc,
    targetPanelCount: input.targetPanelCount,
    heroCharacterIds: input.heroCharacterIds,
  });

  const validation = validateStoryboardPlan(storyboardPlan, { storyArc: input.storyArc });
  const blockers = validation.ok ? [] : validation.issues;
  const allWarnings = [...warnings, ...validation.warnings];

  if (validation.ok) {
    await saveStoryboardPlan(input.storyArc.chapterId, storyboardPlan);
  }

  return {
    storyboardPlan,
    warnings: allWarnings,
    blockers,
  };
}
