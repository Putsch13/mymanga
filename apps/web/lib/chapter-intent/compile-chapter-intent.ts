/**
 * P0.5 — Compile les champs intention utilisateur en `ChapterIntentContract`.
 * Heuristique locale (sans LLM) + option OpenAI si `OPENAI_API_KEY` est défini.
 *
 * Le `confidenceScore` est CALCULÉ post-LLM via `recomputeConfidenceFromContract`
 * pour éviter qu'un LLM trop conservateur (gpt-4o-mini renvoie souvent 0.6-0.7
 * sur des pitchs solides) ne bloque le launch en `INTENT_CONFIDENCE_TOO_LOW`.
 * Le score se base sur les champs effectivement remplis du contrat plutôt que
 * sur l'auto-évaluation du modèle.
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
          "You are a manga chapter intent compiler. Output strict JSON only, no markdown."
          + " For confidenceScore (0-1), be GENEROUS: a clear plot direction, ≥1 named character and ≥1 location"
          + " is already 0.7. Score 0.85+ if the user provides emotional goal, cliffhanger, and concrete must-include events."
          + " Only score below 0.5 if the intent is genuinely vague (1-2 sentences, no entities, no goal).",
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

/**
 * Recalcule un confidence score robuste basé sur les champs effectivement remplis
 * du contrat (et non sur l'auto-évaluation du LLM, souvent trop conservatrice).
 *
 * Barème (somme = 1.0) :
 * - 0.20 : pitch présent et significatif (≥ 60 chars)
 * - 0.20 : ≥ 1 `mustInclude` OU `plotGoal` non vide
 * - 0.15 : ≥ 1 personnage requis OU `requiredNpcs` ≥ 1
 * - 0.10 : ≥ 1 lieu requis
 * - 0.10 : `emotionalGoal` OU `characterArcGoal` non vide
 * - 0.10 : `tone` ou `pacing` non default
 * - 0.10 : `expectedCliffhanger` défini
 * - 0.05 : `dialogueDensity` exprimé explicitement
 *
 * On garantit un minimum de 0.55 si `understoodPitch.length ≥ 100` et
 * `mustInclude.length + requiredCharacters.length ≥ 2` pour éviter de bloquer
 * un utilisateur qui a clairement décrit son chapitre.
 */
export function recomputeConfidenceFromContract(contract: ChapterIntentContract): number {
  let score = 0;

  const pitchLen = (contract.understoodPitch ?? "").trim().length;
  if (pitchLen >= 60) score += 0.2;
  else if (pitchLen >= 30) score += 0.1;

  if ((contract.mustInclude?.length ?? 0) >= 1 || (contract.plotGoal ?? "").trim().length > 0) {
    score += 0.2;
  }

  const charsCount = (contract.requiredCharacters?.length ?? 0) + (contract.requiredNpcs?.length ?? 0);
  if (charsCount >= 2) score += 0.15;
  else if (charsCount >= 1) score += 0.08;

  if ((contract.requiredLocations?.length ?? 0) >= 1) score += 0.1;

  if ((contract.emotionalGoal ?? "").trim().length > 0 || (contract.characterArcGoal ?? "").trim().length > 0) {
    score += 0.1;
  }

  if ((contract.tone ?? "").trim().length > 0 || contract.pacing !== "balanced") {
    score += 0.1;
  }

  if (typeof contract.expectedCliffhanger === "boolean") {
    score += 0.1;
  }

  if (contract.dialogueDensity != null && contract.dialogueDensity !== "medium") {
    score += 0.05;
  }

  // Plancher anti-blocage : si le pitch est clair ET au moins 2 entités précises,
  // on garantit 0.55 minimum pour passer le seuil par défaut (0.5).
  if (pitchLen >= 100 && (contract.mustInclude?.length ?? 0) + charsCount >= 2) {
    score = Math.max(score, 0.55);
  }

  return Math.min(1, Math.max(0, score));
}

export async function compileChapterIntent(input: CompileChapterIntentInput): Promise<ChapterIntentContract> {
  let contract: ChapterIntentContract;
  try {
    const ai = await openAiContract(input);
    contract = ai ?? heuristicContract(input);
  } catch {
    contract = heuristicContract(input);
  }

  // Override : on remplace le confidenceScore (LLM ou heuristique brute) par
  // un calcul déterministe basé sur les champs remplis. Ainsi, si l'utilisateur
  // a rempli sérieusement son intention, il atteindra le seuil quoi qu'il arrive.
  const robustScore = recomputeConfidenceFromContract(contract);
  return {
    ...contract,
    confidenceScore: Math.max(contract.confidenceScore ?? 0, robustScore),
  };
}
