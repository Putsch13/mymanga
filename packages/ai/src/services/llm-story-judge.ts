/**
 * P1.1 — LLM-based story quality judge.
 *
 * Remplace le scoring naïf par mots-clés par une évaluation LLM
 * basée sur une rubric structurée.
 */
import { z } from "zod";
import type { GeneratedChapterBundle } from "../chapter/shared-types";
import type { ChapterDramaticSpine } from "./story-spine";
import type { GenreDirectorMode } from "./genre-director";

/**
 * Rubric stable pour évaluer la qualité narrative d'un chapitre.
 * Chaque dimension est scorée de 0 à 10 avec une liste d'issues.
 */
export const StoryQualityRubricSchema = z.object({
  causality: z.object({
    score: z.number().min(0).max(10),
    issues: z.array(z.string()),
  }),
  characterFunction: z.object({
    score: z.number().min(0).max(10),
    issues: z.array(z.string()),
  }),
  escalation: z.object({
    score: z.number().min(0).max(10),
    issues: z.array(z.string()),
  }),
  setupPayoff: z.object({
    score: z.number().min(0).max(10),
    issues: z.array(z.string()),
  }),
  cliffhanger: z.object({
    score: z.number().min(0).max(10),
    issues: z.array(z.string()),
    suggestedRewrite: z.string().optional(),
  }),
  overall: z.number().min(0).max(10),
  verdict: z.enum(["pass", "repair", "fail"]),
});

export type StoryQualityRubric = z.infer<typeof StoryQualityRubricSchema>;

export interface JudgeStoryOutlineInput {
  bundle: GeneratedChapterBundle;
  spine: ChapterDramaticSpine;
  genreMode: GenreDirectorMode;
  chapterNumber: number;
  previousChapterCliffhanger?: string;
}

export interface JudgeStoryOutlineResult {
  ok: boolean;
  rubric: StoryQualityRubric;
  llmUsed: boolean;
  fallbackReason?: string;
}

const STORY_JUDGE_SYSTEM_PROMPT = `You are a professional manga story editor evaluating chapter outlines.
Your role is to assess narrative quality using these criteria:

1. CAUSALITY (0-10): Do events follow logically? Are transitions motivated?
2. CHARACTER FUNCTION (0-10): Do characters serve the plot? Are they distinct?
3. ESCALATION (0-10): Does tension build? Is pacing appropriate?
4. SETUP/PAYOFF (0-10): Are promises made and delivered? Are reveals earned?
5. CLIFFHANGER (0-10): Does the ending hook readers? Is it genre-appropriate?

For each criterion:
- Score 8-10: Strong, professional quality
- Score 5-7: Acceptable but could improve
- Score 0-4: Needs significant work

Return ONLY valid JSON matching the schema provided.`;

function buildJudgePrompt(input: JudgeStoryOutlineInput): string {
  const scenes = input.bundle.script?.scenes ?? [];
  const beatsText = input.spine.beats
    .map((b, i) => `Beat ${i + 1}: ${b.eventType} - ${b.description ?? "neutral"}`)
    .join("\n");

  const scenesText = scenes
    .map((s, i) => `Scene ${i + 1}: ${s.summary ?? "(no summary)"}`)
    .join("\n");

  const cliffhanger = input.bundle.outline?.cliffhanger ?? "(none)";

  return `
CHAPTER ${input.chapterNumber} OUTLINE
Genre: ${input.genreMode}
${input.previousChapterCliffhanger ? `Previous chapter ended with: "${input.previousChapterCliffhanger}"` : ""}

=== DRAMATIC BEATS ===
${beatsText}

=== SCENES ===
${scenesText}

=== CURRENT CLIFFHANGER ===
${cliffhanger}

Evaluate this outline and return JSON matching this schema:
{
  "causality": { "score": number, "issues": string[] },
  "characterFunction": { "score": number, "issues": string[] },
  "escalation": { "score": number, "issues": string[] },
  "setupPayoff": { "score": number, "issues": string[] },
  "cliffhanger": { "score": number, "issues": string[], "suggestedRewrite"?: string },
  "overall": number,
  "verdict": "pass" | "repair" | "fail"
}

Verdict rules:
- "pass" if overall >= 7 and no score below 5
- "fail" if overall < 4 or any score below 3
- "repair" otherwise
`;
}

/**
 * Heuristiques locales comme fallback quand le LLM n'est pas disponible.
 */
export function runHeuristicFallback(input: JudgeStoryOutlineInput): StoryQualityRubric {
  const scenes = input.bundle.script?.scenes ?? [];
  const beats = input.spine.beats;

  const causalityScore = Math.min(10, Math.round((scenes.length / 5) * 10));
  const hasCharacterFocusedBeats = beats.some((b) => b.description && b.description.length > 10);
  const characterScore = hasCharacterFocusedBeats ? 7 : 4;
  const escalationScore = beats.some((b) => b.eventType === "confrontation" || b.eventType === "escalation") ? 7 : 4;
  const setupPayoffScore = beats.length >= 3 ? 6 : 3;
  const cliffhangerScore = input.bundle.outline?.cliffhanger ? 7 : 3;

  const overall = Math.round(
    (causalityScore + characterScore + escalationScore + setupPayoffScore + cliffhangerScore) / 5,
  );

  const verdict =
    overall >= 7 && Math.min(causalityScore, characterScore, escalationScore, setupPayoffScore, cliffhangerScore) >= 5
      ? "pass"
      : overall < 4 ||
          Math.min(causalityScore, characterScore, escalationScore, setupPayoffScore, cliffhangerScore) < 3
        ? "fail"
        : "repair";

  return {
    causality: {
      score: causalityScore,
      issues: causalityScore < 5 ? ["Weak causal links between scenes (heuristic)"] : [],
    },
    characterFunction: {
      score: characterScore,
      issues: characterScore < 5 ? ["Characters not consistently tied to beats (heuristic)"] : [],
    },
    escalation: {
      score: escalationScore,
      issues: escalationScore < 5 ? ["Missing clear climax beat (heuristic)"] : [],
    },
    setupPayoff: {
      score: setupPayoffScore,
      issues: setupPayoffScore < 5 ? ["Insufficient beats for setup/payoff (heuristic)"] : [],
    },
    cliffhanger: {
      score: cliffhangerScore,
      issues: cliffhangerScore < 5 ? ["No cliffhanger defined (heuristic)"] : [],
      suggestedRewrite:
        cliffhangerScore < 5
          ? "Consider ending with a dramatic question or revelation to hook readers."
          : undefined,
    },
    overall,
    verdict,
  };
}

/**
 * P1.1 — Juge la qualité narrative d'un chapitre via LLM.
 *
 * Si le LLM n'est pas disponible (pas de clé API ou erreur),
 * retombe sur les heuristiques locales.
 */
export async function judgeStoryOutlineWithLLM(
  input: JudgeStoryOutlineInput,
): Promise<JudgeStoryOutlineResult> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return {
      ok: true,
      rubric: runHeuristicFallback(input),
      llmUsed: false,
      fallbackReason: "OPENAI_API_KEY_missing",
    };
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: STORY_JUDGE_SYSTEM_PROMPT },
          { role: "user", content: buildJudgePrompt(input) },
        ],
        temperature: 0.3,
        max_tokens: 1000,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      console.warn(
        `[llm-story-judge] OpenAI error ${response.status}, falling back to heuristics`,
      );
      return {
        ok: true,
        rubric: runHeuristicFallback(input),
        llmUsed: false,
        fallbackReason: `openai_error_${response.status}`,
      };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return {
        ok: true,
        rubric: runHeuristicFallback(input),
        llmUsed: false,
        fallbackReason: "empty_response",
      };
    }

    const parsed = JSON.parse(content);
    const rubric = StoryQualityRubricSchema.parse(parsed);

    return {
      ok: true,
      rubric,
      llmUsed: true,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[llm-story-judge] Error: ${msg}, falling back to heuristics`);

    return {
      ok: true,
      rubric: runHeuristicFallback(input),
      llmUsed: false,
      fallbackReason: `error: ${msg}`,
    };
  }
}
