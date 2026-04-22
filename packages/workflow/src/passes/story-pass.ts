/**
 * story-pass — étape 1 de la pipeline v3.
 *
 * Entrée : projet, chapitres précédents, bible, personnages, user intent.
 * Sortie : StoryArc (persisté dans `chapter.outline.storyArcV2`).
 *
 * Sprint 1 : délègue à `runStoryArchitectAgent` (stub déterministe). Pas de
 * LLM branché ici. Le but est juste de figer le contrat et la
 * persistance pour ne plus bloquer le reste de la pipeline.
 */

import {
  runStoryArchitectAgent,
  type StoryArc,
  type StoryArchitectInput,
} from "@manga-ai-studio/ai";
import { saveStoryArc } from "../persistence/story-persistence";

export interface RunStoryPassInput {
  chapterId: string;
  chapterNumber: number;
  title: string | null | undefined;
  userIntent: string | null | undefined;
  summary?: string | null;
  mainCharacters?: StoryArchitectInput["mainCharacters"];
  locations?: StoryArchitectInput["locations"];
  targetBeatCount?: number;
}

export interface RunStoryPassResult {
  storyArc: StoryArc;
  warnings: string[];
}

export async function runStoryPass(input: RunStoryPassInput): Promise<RunStoryPassResult> {
  const { storyArc, warnings } = await runStoryArchitectAgent({
    chapterId: input.chapterId,
    chapterNumber: input.chapterNumber,
    title: input.title,
    userIntent: input.userIntent,
    summary: input.summary,
    mainCharacters: input.mainCharacters,
    locations: input.locations,
    targetBeatCount: input.targetBeatCount,
  });
  await saveStoryArc(input.chapterId, storyArc);
  return { storyArc, warnings };
}
