/**
 * BUG-16 — Réécriture ciblée d'un seul beat de l'outline production.
 *
 * Préserve le `beatId` et tous les champs techniques (narrativeFacts,
 * requiredProps, presenceObligations…) pour ne pas casser les passes avals.
 * Échec silencieux si OpenAI indisponible : aucun fallback heuristique
 * n'est suffisamment fiable pour une réécriture ciblée.
 */
import OpenAI from "openai";
import type { AutofillMeta, ChapterStudioData } from "@manga-ai-studio/core";
import { getAppConfig } from "@manga-ai-studio/core";
import type { ProjectContextForChapter } from "../../chapter/shared-types";
import { buildContextSummary, buildGenreHintsBlock } from "./prompt-builder";
import type { AutofillResult } from "./types";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface RewriteBeatInput {
  currentData: Partial<ChapterStudioData>;
  context: ProjectContextForChapter;
  targetBeatId: string;
  userInstructions: string;
  selectedPlotLabel: string | null;
  now: string;
}

export function buildEmptyRewriteResult(reason: string, now: string): AutofillResult {
  const meta: AutofillMeta = {
    source: "ai_autofill",
    generatedAt: now,
    mode: "rewrite_beat",
    confidence: 0,
    assumptions: [reason],
    appliedFields: [],
    unresolvedQuestions: [],
  };
  return {
    suggestedPatch: {},
    assumptions: [reason],
    confidence: 0,
    unresolvedQuestions: [],
    appliedFields: [],
    provenance: [],
    meta,
  };
}

export async function runRewriteBeat(input: RewriteBeatInput): Promise<AutofillResult> {
  const { currentData, context, targetBeatId, userInstructions, selectedPlotLabel, now } = input;

  if (!targetBeatId) {
    return buildEmptyRewriteResult(
      "rewrite_beat nécessite targetBeatId pour identifier le beat à réécrire.",
      now,
    );
  }

  const outline = currentData.productionOutline;
  if (!outline || !Array.isArray(outline.beats) || outline.beats.length === 0) {
    return buildEmptyRewriteResult(
      "Aucun productionOutline à modifier — générez d'abord le plan du chapitre.",
      now,
    );
  }

  const targetIndex = outline.beats.findIndex((b) => b.beatId === targetBeatId);
  if (targetIndex < 0) {
    return buildEmptyRewriteResult(
      `Beat "${targetBeatId}" introuvable dans l'outline production.`,
      now,
    );
  }

  const targetBeat = outline.beats[targetIndex]!;
  const neighboringBeats = outline.beats
    .map((b, i) => ({
      position: i === targetIndex ? "TARGET" : i < targetIndex ? "BEFORE" : "AFTER",
      beat: b,
    }))
    .map(({ position, beat }) => `- [${position} beatId=${beat.beatId}] ${beat.summary.slice(0, 140)}`)
    .join("\n");

  if (!process.env.OPENAI_API_KEY) {
    return buildEmptyRewriteResult(
      "rewrite_beat nécessite OPENAI_API_KEY configuré (aucun fallback heuristique fiable pour une réécriture ciblée).",
      now,
    );
  }

  const contextSummary = buildContextSummary(context);
  const genreHintsBlock = buildGenreHintsBlock(context, selectedPlotLabel);
  const instructionsBlock =
    userInstructions.trim().length > 0
      ? `INSTRUCTIONS UTILISATEUR (à respecter strictement) :\n${userInstructions.trim().slice(0, 500)}`
      : "INSTRUCTIONS UTILISATEUR : aucune — améliore naturellement la tension et la densité narrative du beat.";

  const prompt = `Tu es un scénariste manga expert. On te demande de RÉÉCRIRE un seul beat du plan de production, en préservant la cohérence avec les beats avant/après.

CONTEXTE DU PROJET :
${contextSummary}
${genreHintsBlock}

BEATS DU CHAPITRE (cible entre ↓↑) :
${neighboringBeats}

BEAT ACTUEL À RÉÉCRIRE (beatId=${targetBeat.beatId}) :
- summary : ${targetBeat.summary}
- narrativeFunction : ${targetBeat.narrativeFunction}
- whyThisBeatExists : ${targetBeat.whyThisBeatExists}
- dramaticChange : ${targetBeat.dramaticChange}
- involvedCharacters : ${targetBeat.involvedCharacters.join(", ") || "(aucun)"}
- visualPriority : ${targetBeat.visualPriority}

${instructionsBlock}

RÈGLES :
- Conserver le beatId "${targetBeat.beatId}" (NE PAS changer).
- Préserver la continuité avec les beats BEFORE/AFTER : entrées/sorties, personnages présents, lieu si non modifié par l'utilisateur.
- N'inventer aucun personnage/lieu absent du contexte projet.
- Retourner UNIQUEMENT le beat réécrit (pas l'outline complet).

Réponds UNIQUEMENT en JSON valide :
{
  "rewrittenBeat": {
    "beatId": "${targetBeat.beatId}",
    "summary": "...",
    "narrativeFunction": "...",
    "whyThisBeatExists": "...",
    "dramaticChange": "...",
    "involvedCharacters": ["..."],
    "visualPriority": "low|medium|high|critical",
    "estimatedPanels": 4,
    "criticality": "low|medium|high|critical",
    "infoGained": "...",
    "emotionProduced": "..."
  },
  "assumptions": ["..."],
  "confidence": 0.0-1.0,
  "unresolvedQuestions": ["..."]
}`;

  try {
    const response = await openai.chat.completions.create({
      model: getAppConfig().OPENAI_AUTOFILL_MODEL ?? getAppConfig().OPENAI_NARRATIVE_MODEL,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.75,
      max_tokens: 1200,
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as {
      rewrittenBeat?: Record<string, unknown>;
      assumptions?: string[];
      confidence?: number;
      unresolvedQuestions?: string[];
    };

    if (!parsed.rewrittenBeat || typeof parsed.rewrittenBeat !== "object") {
      return buildEmptyRewriteResult("Le LLM n'a pas retourné de rewrittenBeat exploitable.", now);
    }

    const rewritten = parsed.rewrittenBeat;
    const validPriorities = ["low", "medium", "high", "critical"] as const;
    const mergedBeat = {
      ...targetBeat,
      beatId: targetBeat.beatId,
      summary: typeof rewritten.summary === "string" ? rewritten.summary : targetBeat.summary,
      narrativeFunction:
        typeof rewritten.narrativeFunction === "string"
          ? rewritten.narrativeFunction
          : targetBeat.narrativeFunction,
      whyThisBeatExists:
        typeof rewritten.whyThisBeatExists === "string"
          ? rewritten.whyThisBeatExists
          : targetBeat.whyThisBeatExists,
      dramaticChange:
        typeof rewritten.dramaticChange === "string"
          ? rewritten.dramaticChange
          : targetBeat.dramaticChange,
      involvedCharacters: Array.isArray(rewritten.involvedCharacters)
        ? (rewritten.involvedCharacters.filter((c) => typeof c === "string") as string[])
        : targetBeat.involvedCharacters,
      visualPriority: validPriorities.includes(
        rewritten.visualPriority as (typeof validPriorities)[number],
      )
        ? (rewritten.visualPriority as (typeof validPriorities)[number])
        : targetBeat.visualPriority,
      estimatedPanels:
        typeof rewritten.estimatedPanels === "number" && rewritten.estimatedPanels > 0
          ? Math.round(rewritten.estimatedPanels)
          : targetBeat.estimatedPanels,
      criticality: validPriorities.includes(rewritten.criticality as (typeof validPriorities)[number])
        ? (rewritten.criticality as (typeof validPriorities)[number])
        : targetBeat.criticality,
      infoGained:
        typeof rewritten.infoGained === "string" ? rewritten.infoGained : targetBeat.infoGained,
      emotionProduced:
        typeof rewritten.emotionProduced === "string"
          ? rewritten.emotionProduced
          : targetBeat.emotionProduced,
    };

    const newBeats = outline.beats.map((b, i) => (i === targetIndex ? mergedBeat : b));
    const suggestedPatch: Partial<ChapterStudioData> = {
      productionOutline: {
        ...outline,
        beats: newBeats,
      },
    };

    const confidence = Math.min(1, Math.max(0, parsed.confidence ?? 0.7));
    const appliedFields = [`productionOutline.beats[${targetBeatId}]`];
    const meta: AutofillMeta = {
      source: "ai_autofill",
      generatedAt: now,
      mode: "rewrite_beat",
      confidence,
      assumptions: parsed.assumptions ?? [],
      appliedFields,
      unresolvedQuestions: parsed.unresolvedQuestions ?? [],
    };

    return {
      suggestedPatch,
      assumptions: parsed.assumptions ?? [],
      confidence,
      unresolvedQuestions: parsed.unresolvedQuestions ?? [],
      appliedFields,
      provenance: [{ field: appliedFields[0]!, source: "inference", confidence }],
      meta,
    };
  } catch (error) {
    console.warn("[chapter-autofill-engine] rewrite_beat — erreur OpenAI :", error);
    return buildEmptyRewriteResult(
      `rewrite_beat a échoué : ${error instanceof Error ? error.message : String(error)}`,
      now,
    );
  }
}
