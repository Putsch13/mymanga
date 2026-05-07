/**
 * IntentNarrativeContract — structured decomposition of the user's story intent
 * into verifiable constraints that downstream pipeline stages must satisfy.
 *
 * Unlike `ChapterIntentContract` (editorial level: tone, pacing, pitch),
 * this contract captures *what must happen in the story* so that QA can
 * compute a coverage score and block if the outline/dialogue diverges.
 */

import { z } from "zod";
import { zodLlmEnum } from "../utils/zod-llm";

export const requiredEventSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  type: zodLlmEnum(["action", "dialogue", "environment", "decision", "cutaway"]),
  actors: z.array(z.string()).default([]),
  locationHint: z.string().optional().nullable(),
  requiredDialogue: z.boolean().default(false),
  mustAppearInBeat: z.boolean().default(true),
});

export type RequiredEvent = z.infer<typeof requiredEventSchema>;

export const npcGroupRequirementSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  role: z.string().min(1),
  requiredDialogue: z.boolean().default(false),
  mustMention: z.array(z.string()).default([]),
});

export type NpcGroupRequirement = z.infer<typeof npcGroupRequirementSchema>;

export const intentNarrativeContractSchema = z.object({
  version: z.literal(1).default(1),
  chapterId: z.string().min(1),
  storyFacts: z.array(z.string()).default([]),
  requiredCharacters: z.array(z.string()).default([]),
  requiredNpcGroups: z.array(npcGroupRequirementSchema).default([]),
  requiredLocations: z.array(z.string()).default([]),
  requiredEvents: z.array(requiredEventSchema).default([]),
  forbiddenInventions: z.array(z.string()).default([]),
});

export type IntentNarrativeContract = z.infer<typeof intentNarrativeContractSchema>;

export function parseIntentNarrativeContract(input: unknown): IntentNarrativeContract {
  return intentNarrativeContractSchema.parse(input);
}

// ---------------------------------------------------------------------------
// Builder: derives IntentNarrativeContract from user intent + known entities
// ---------------------------------------------------------------------------

export type BuildIntentNarrativeInput = {
  chapterId: string;
  userIntent: string;
  knownCharacterIds?: string[];
  knownCharacterNames?: string[];
  knownLocationNames?: string[];
  knownNpcGroupLabels?: string[];
};

/**
 * Rule-based builder (no LLM) — extracts events, actors, locations and NPC
 * groups from the free-text user intent by simple keyword / sentence analysis.
 *
 * This is intentionally conservative: the LLM-based `compileIntentNarrative`
 * (called from the `/intent-compile` route) should be preferred for premium
 * chapters; this builder is a safe synchronous fallback.
 */
export function buildIntentNarrativeContract(
  input: BuildIntentNarrativeInput,
): IntentNarrativeContract {
  const { chapterId, userIntent } = input;
  const lowerIntent = userIntent.toLowerCase();

  const requiredCharacters = (input.knownCharacterIds ?? []).filter((id) => {
    const idx = input.knownCharacterIds?.indexOf(id) ?? -1;
    const name = input.knownCharacterNames?.[idx]?.toLowerCase();
    return name ? lowerIntent.includes(name) : false;
  });

  const requiredLocations = (input.knownLocationNames ?? []).filter((name) =>
    lowerIntent.includes(name.toLowerCase()),
  );

  const sentences = userIntent
    .split(/[.!?;\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 5);

  const events: RequiredEvent[] = sentences.map((s, i) => {
    const hasDialogueHint = /\b(dit|parle|crie|murmure|explique|avoue|demande|prévient|avertit|confie|révèle)\b/i.test(s);
    const type = hasDialogueHint ? "dialogue" as const : "action" as const;
    return {
      id: `evt_${i + 1}`,
      label: s.slice(0, 120),
      type,
      actors: [],
      locationHint: null,
      requiredDialogue: hasDialogueHint,
      mustAppearInBeat: true,
    };
  });

  const storyFacts = sentences.slice(0, 8);

  return {
    version: 1,
    chapterId,
    storyFacts,
    requiredCharacters,
    requiredNpcGroups: [],
    requiredLocations,
    requiredEvents: events,
    forbiddenInventions: [],
  };
}
