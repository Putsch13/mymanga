/**
 * story-pass — étape 1 de la pipeline v3.
 *
 * Entrée : projet, chapitres précédents, bible, personnages, user intent.
 * Sortie : StoryArc (persisté dans `chapter.outline.storyArcV2`).
 *
 * COMMIT H — appelle désormais `runStoryArchitectAgentLlm` (vrai LLM) en
 * premium, avec fallback automatique sur le stub si OPENAI_API_KEY absente.
 * L'override `useLlmArchitect=false` force le stub (tests).
 */

import {
  runStoryArchitectAgent,
  runStoryArchitectAgentLlm,
  type StoryArc,
  type StoryArchitectInput,
} from "@manga-ai-studio/ai";
import { saveStoryArc } from "../persistence/story-persistence";
import {
  isPipelineV3PremiumOnlyEnabled,
  isPipelineV3StoryArchitectLlmEnabled,
} from "../pipeline-feature-flags";

export class PremiumStoryArchitectStubForbiddenError extends Error {
  constructor() {
    super(
      "premium_story_architect_stub_forbidden: PIPELINE_V3_PREMIUM_ONLY=true impose PIPELINE_V3_STORY_ARCHITECT_LLM=true. " +
        "Le stub déterministe produit 9 beats identiques pour tous les chapitres. Interdit en premium.",
    );
    this.name = "PremiumStoryArchitectStubForbiddenError";
  }
}

export interface RunStoryPassInput {
  chapterId: string;
  chapterNumber: number;
  title: string | null | undefined;
  userIntent: string | null | undefined;
  summary?: string | null;
  mainCharacters?: StoryArchitectInput["mainCharacters"];
  locations?: StoryArchitectInput["locations"];
  targetBeatCount?: number;
  /**
   * COMMIT H — override du flag PIPELINE_V3_STORY_ARCHITECT_LLM.
   */
  useLlmArchitect?: boolean;
}

export interface RunStoryPassResult {
  storyArc: StoryArc;
  warnings: string[];
}

export async function runStoryPass(input: RunStoryPassInput): Promise<RunStoryPassResult> {
  const useLlm = input.useLlmArchitect ?? isPipelineV3StoryArchitectLlmEnabled();
  const premiumOnly = isPipelineV3PremiumOnlyEnabled();

  // Premium-only : l'IA1 doit être un vrai LLM. Si la clé OpenAI manque,
  // `runStoryArchitectAgentLlm` ferait un fallback vers le stub — interdit.
  if (premiumOnly && useLlm && !process.env.OPENAI_API_KEY) {
    throw new Error(
      "premium_story_architect_llm_unavailable: PIPELINE_V3_PREMIUM_ONLY=true mais OPENAI_API_KEY est absente",
    );
  }

  // COMMIT H + P2.B — symétrique du storyboard-pass : pas de stub en premium.
  if (premiumOnly && !useLlm) {
    throw new PremiumStoryArchitectStubForbiddenError();
  }

  const architect = useLlm ? runStoryArchitectAgentLlm : runStoryArchitectAgent;
  const { storyArc, warnings } = await architect({
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
