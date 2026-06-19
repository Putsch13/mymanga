/**
 * story-architect-agent-llm — façade publique pour l'IA1 (Story Architect LLM).
 *
 * Logique extraite dans :
 *   - `_story-architect/prompt-builder.ts` : construction du prompt système/utilisateur
 *   - `_story-architect/response-parser.ts` : parsing, sanitization et validation
 */

import OpenAI from "openai";
import { createEmptyContinuityState } from "../contracts/continuity-state";
import {
  runStoryArchitectAgent,
  type StoryArchitectInput,
  type StoryArchitectOutput,
} from "./story-architect-agent";
import { assertNotPremiumSilentFallback, getAppConfig } from "@manga-ai-studio/core";
import { SYSTEM_PROMPT, buildUserPrompt } from "./_story-architect/prompt-builder";
import { sanitizeStoryArc, validatePremiumStoryArcConstraints } from "./_story-architect/response-parser";

export { validatePremiumStoryArcConstraints } from "./_story-architect/response-parser";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export class PremiumStoryArchitectOpenAiRequiredError extends Error {
  constructor() {
    super("premium_story_architect_openai_required");
    this.name = "PremiumStoryArchitectOpenAiRequiredError";
  }
}

export class PremiumStoryArchitectInvalidJsonError extends Error {
  constructor(message?: string) {
    super(`premium_story_architect_invalid_json${message ? `:${message}` : ""}`);
    this.name = "PremiumStoryArchitectInvalidJsonError";
  }
}

export class PremiumStoryArchitectLowBeatCountError extends Error {
  constructor(count: number) {
    super(`premium_story_architect_low_beat_count:${count}`);
    this.name = "PremiumStoryArchitectLowBeatCountError";
  }
}

export class PremiumStoryArchitectLlmFailedError extends Error {
  constructor(message?: string) {
    super(`premium_story_architect_llm_failed${message ? `:${message}` : ""}`);
    this.name = "PremiumStoryArchitectLlmFailedError";
  }
}

export async function runStoryArchitectAgentLlm(
  input: StoryArchitectInput,
): Promise<StoryArchitectOutput> {
  const warnings: string[] = [];
  const premiumOnly = input.premiumOnly === true;
  assertNotPremiumSilentFallback(
    !premiumOnly,
    "premium_story_architect_stub_forbidden_under_strict_env",
  );

  if (!process.env.OPENAI_API_KEY) {
    if (premiumOnly) {
      throw new PremiumStoryArchitectOpenAiRequiredError();
    }
    warnings.push("story_architect.llm.degraded=OPENAI_API_KEY_missing");
    const fallback = await runStoryArchitectAgent(input);
    return {
      storyArc: fallback.storyArc,
      warnings: [...warnings, ...fallback.warnings],
    };
  }

  const continuityBefore = input.continuityBefore ?? createEmptyContinuityState();

  try {
    const model = getAppConfig().STORY_ARCHITECT_MODEL;
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(input) },
      ],
      temperature: 0.6,
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message?.content ?? "";
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(content) as Record<string, unknown>;
    } catch (parseErr) {
      if (premiumOnly) {
        const detail = parseErr instanceof Error ? parseErr.message : String(parseErr);
        throw new PremiumStoryArchitectInvalidJsonError(detail);
      }
      warnings.push("story_architect.llm.degraded=invalid_json");
      const fallback = await runStoryArchitectAgent(input);
      return {
        storyArc: fallback.storyArc,
        warnings: [...warnings, ...fallback.warnings],
      };
    }
    const storyArc = sanitizeStoryArc(parsed, input, continuityBefore);

    if (storyArc.beats.length < 4) {
      if (premiumOnly) {
        throw new PremiumStoryArchitectLowBeatCountError(storyArc.beats.length);
      }
      warnings.push(
        `story_architect.llm.low_beat_count=${storyArc.beats.length} (fallback_to_stub)`,
      );
      const fallback = await runStoryArchitectAgent(input);
      return {
        storyArc: fallback.storyArc,
        warnings: [...warnings, ...fallback.warnings],
      };
    }

    if (premiumOnly) {
      validatePremiumStoryArcConstraints(storyArc, input);
    }

    return { storyArc, warnings };
  } catch (err) {
    if (premiumOnly) {
      if (
        err instanceof PremiumStoryArchitectOpenAiRequiredError
        || err instanceof PremiumStoryArchitectInvalidJsonError
        || err instanceof PremiumStoryArchitectLowBeatCountError
        || err instanceof PremiumStoryArchitectLlmFailedError
      ) {
        throw err;
      }
      if (err instanceof Error && err.message.startsWith("premium_story_architect")) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw new PremiumStoryArchitectLlmFailedError(msg);
    }
    const msg = err instanceof Error ? err.message : String(err);
    warnings.push(`story_architect.llm.error=${msg}`);
    const fallback = await runStoryArchitectAgent(input);
    return {
      storyArc: fallback.storyArc,
      warnings: [...warnings, ...fallback.warnings],
    };
  }
}
