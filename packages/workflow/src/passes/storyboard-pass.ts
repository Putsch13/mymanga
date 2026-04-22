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
  validateStoryboardPlan,
  type StoryArc,
  type StoryboardPlan,
} from "@manga-ai-studio/ai";
import { saveStoryboardPlan } from "../persistence/storyboard-persistence";

export interface RunStoryboardPassInput {
  storyArc: StoryArc;
  targetPanelCount?: number;
  heroCharacterIds?: string[];
}

export interface RunStoryboardPassResult {
  storyboardPlan: StoryboardPlan;
  warnings: string[];
  blockers: string[];
}

export async function runStoryboardPass(
  input: RunStoryboardPassInput,
): Promise<RunStoryboardPassResult> {
  const { storyboardPlan, warnings } = await runMangaEditorAgent({
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
