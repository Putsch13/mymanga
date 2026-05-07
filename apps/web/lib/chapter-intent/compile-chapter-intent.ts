/**
 * P0.5 — Compile les champs intention utilisateur en `ChapterIntentContract`.
 * Heuristique locale (sans LLM) + option OpenAI si `OPENAI_API_KEY` est défini.
 */
import type { ChapterIntentContract } from "@manga-ai-studio/core";
import { chapterIntentContractSchema } from "@manga-ai-studio/core";
import OpenAI from "openai";

export type CompileChapterIntentInput = {
  rawUserIntent: string;
  shortPitch?: string;
  mustHappen?: string;
  mustNot?: string;
  wish?: string;
  pacing?: "slow" | "balanced" | "fast";
  dialogueLevel?: "low" | "medium" | "high";
  endingType?: string;
};

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function extractList(text: string, patterns: RegExp[]): string[] {
  const out: string[] = [];
  const t = text.toLowerCase();
  for (const re of patterns) {
    const m = t.match(re);
    if (m?.[1]) {
      m[1].split(/[,;•\n]/).map((x) => x.trim()).filter(Boolean).forEach((x) => out.push(x));
    }
  }
  return [...new Set(out)];
}

function heuristicContract(input: CompileChapterIntentInput): ChapterIntentContract {
  const raw = [
    input.rawUserIntent?.trim() ?? "",
    input.shortPitch?.trim() ?? "",
    input.mustHappen?.trim() ?? "",
    input.mustNot?.trim() ?? "",
    input.wish?.trim() ?? "",
    input.endingType?.trim() ?? "",
  ].filter(Boolean).join("\n\n");

  const understoodPitch =
    input.shortPitch?.trim()
    || (raw.length > 0 ? raw.slice(0, 400) + (raw.length > 400 ? "…" : "") : "");

  const mustInclude: string[] = [];
  if (input.mustHappen?.trim()) mustInclude.push(input.mustHappen.trim());
  mustInclude.push(
    ...extractList(raw, [
      /doit (?:absolument )?(?:inclure|contenir|y avoir)\s*:\s*([^\n]+)/i,
      /must include\s*:\s*([^\n]+)/i,
    ]),
  );

  const mustAvoid: string[] = [];
  if (input.mustNot?.trim()) mustAvoid.push(input.mustNot.trim());
  mustAvoid.push(
    ...extractList(raw, [
      /(?:ne pas|éviter|interdit)\s*:\s*([^\n]+)/i,
      /must (?:not|avoid)\s*:\s*([^\n]+)/i,
    ]),
  );

  const requiredCharacters = extractList(raw, [
    /personnages?\s*(?:requis|détectés)?\s*:\s*([^\n]+)/i,
    /characters?\s*:\s*([^\n]+)/i,
  ]);
  const requiredLocations = extractList(raw, [
    /(?:lieux?|décors?|locations?)\s*:\s*([^\n]+)/i,
  ]);
  const requiredNpcs = extractList(raw, [/(?:pnj|npc)s?\s*:\s*([^\n]+)/i]);
  const requiredCreatures = extractList(raw, [
    /(?:créatures?|monstres?|creatures?)\s*:\s*([^\n]+)/i,
  ]);
  const requiredProps = extractList(raw, [
    /(?:objets?|props?)\s*(?:importants?)?\s*:\s*([^\n]+)/i,
  ]);

  const ambiguityFlags: string[] = [];
  if (raw.length < 40) ambiguityFlags.push("intent_too_short");
  if (!input.shortPitch?.trim() && raw.length > 0) ambiguityFlags.push("pitch_inferred_from_raw");
  if (mustInclude.length === 0) ambiguityFlags.push("no_explicit_must_include");

  const lenScore = Math.min(1, raw.length / 200);
  const structScore = mustInclude.length > 0 || mustAvoid.length > 0 ? 0.15 : 0;
  const hashJitter = (hashString(raw) % 7) / 100;
  let confidenceScore = Math.min(0.95, 0.35 + lenScore * 0.45 + structScore + hashJitter);
  if (raw.length < 20) confidenceScore = Math.min(confidenceScore, 0.5);

  const expectedCliffhanger = /\bcliffhanger\b/i.test(raw) || /\bfin ouverte\b/i.test(input.endingType ?? "");

  const base: ChapterIntentContract = {
    rawUserIntent: raw || input.rawUserIntent?.trim() || "",
    understoodPitch: understoodPitch || raw.slice(0, 200),
    mustInclude: [...new Set(mustInclude.filter(Boolean))],
    mustAvoid: [...new Set(mustAvoid.filter(Boolean))],
    requiredCharacters: [...new Set(requiredCharacters)],
    requiredLocations: [...new Set(requiredLocations)],
    requiredNpcs: [...new Set(requiredNpcs)],
    requiredCreatures: [...new Set(requiredCreatures)],
    requiredProps: [...new Set(requiredProps)],
    emotionalGoal: input.wish?.trim() || "",
    plotGoal: input.mustHappen?.trim() || "",
    characterArcGoal: "",
    tone: "",
    pacing: input.pacing ?? "balanced",
    dialogueDensity: input.dialogueLevel ?? "medium",
    expectedCliffhanger,
    ambiguityFlags,
    confidenceScore,
  };

  return chapterIntentContractSchema.parse(base);
}

async function openAiContract(input: CompileChapterIntentInput): Promise<ChapterIntentContract | null> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;

  const client = new OpenAI({ apiKey: key });
  const userPayload = JSON.stringify({
    ...input,
    instructions:
      "Return ONLY valid JSON matching ChapterIntentContract: rawUserIntent, understoodPitch, mustInclude[], mustAvoid[], requiredCharacters[], requiredLocations[], requiredNpcs[], requiredCreatures[], requiredProps[], emotionalGoal, plotGoal, characterArcGoal, tone, pacing (slow|balanced|fast), dialogueDensity (low|medium|high), expectedCliffhanger, ambiguityFlags[], confidenceScore 0-1.",
  });

  const completion = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL_INTENT ?? "gpt-4o-mini",
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content:
          "You are a manga chapter intent compiler. Output strict JSON only, no markdown. confidenceScore reflects how clear and actionable the user's intent is.",
      },
      { role: "user", content: userPayload },
    ],
    response_format: { type: "json_object" },
  });

  const text = completion.choices[0]?.message?.content?.trim();
  if (!text) return null;
  const parsed = JSON.parse(text) as unknown;
  return chapterIntentContractSchema.parse(parsed);
}

export async function compileChapterIntent(input: CompileChapterIntentInput): Promise<ChapterIntentContract> {
  try {
    const ai = await openAiContract(input);
    if (ai) return ai;
  } catch {
    // fallback heuristique
  }
  return heuristicContract(input);
}
