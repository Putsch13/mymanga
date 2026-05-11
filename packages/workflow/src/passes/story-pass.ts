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
  type StoryArchitectNarrativeContract,
} from "@manga-ai-studio/ai";
import { isPremiumStrictMode } from "@manga-ai-studio/core";
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
   * FIX-14 — Contrat narratif pré-résolu (pronoms + lieux + events).
   * Si fourni, le Story Architect inclura des contraintes strictes issues
   * du contrat dans son prompt LLM.
   */
  narrativeContract?: StoryArchitectNarrativeContract | null;
  /**
   * COMMIT H — override du flag PIPELINE_V3_STORY_ARCHITECT_LLM.
   */
  useLlmArchitect?: boolean;
  /**
   * PR6 — si défini, pilote `premiumOnly` côté LLM (fail-hard) au lieu du seul flag env.
   * Ex. pipeline : `premiumOnlyOverride: input.premiumV3OnlyEnabled`.
   */
  premiumOnlyOverride?: boolean;
}

export interface RunStoryPassResult {
  storyArc: StoryArc;
  warnings: string[];
}

export async function runStoryPass(input: RunStoryPassInput): Promise<RunStoryPassResult> {
  const useLlm = input.useLlmArchitect ?? isPipelineV3StoryArchitectLlmEnabled();
  const premiumOnly =
    input.premiumOnlyOverride === true
      ? true
      : input.premiumOnlyOverride === false
        ? false
        : isPipelineV3PremiumOnlyEnabled() || isPremiumStrictMode();

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
    // FIX-14 — Le contrat narratif contient les personnages / lieux / events
    // résolus depuis l'intention utilisateur (pronoms → IDs réels). Le Story
    // Architect LLM l'injectera dans son prompt pour éviter d'inventer des
    // personnages absents du projet ou de rater "lui" = Kai.
    narrativeContract: input.narrativeContract ?? null,
    premiumOnly: premiumOnly && useLlm,
  });
  await saveStoryArc(input.chapterId, storyArc);
  return { storyArc, warnings };
}
