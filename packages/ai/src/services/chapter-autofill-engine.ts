/**
 * Moteur d'autofill chapitre (façade).
 *
 * Refacto : ce fichier (813 LOC monolithique) a été découpé en sous-modules
 * dans `_autofill/` pour mieux isoler les responsabilités :
 *   - `types.ts`             types publics
 *   - `prompt-builder.ts`    construction des prompts LLM
 *   - `patch-merger.ts`      fusion respectueuse + extraction des champs appliqués
 *   - `normalize-patch.ts`   coercion des sorties LLM mal typées
 *   - `fallback.ts`          repli heuristique sans OpenAI
 *   - `rewrite-beat.ts`      mode "rewrite_beat" ciblé (BUG-16)
 */
import OpenAI from "openai";
import type { ChapterStudioData, AutofillMeta } from "@manga-ai-studio/core";
import { getAppConfig } from "@manga-ai-studio/core";
import {
  buildContextSummary,
  buildCurrentDataSummary,
  buildGenreHintsBlock,
  buildMissingFieldsList,
  buildPromptForMode,
} from "./_autofill/prompt-builder";
import { extractAppliedFields, mergePatchRespectingExisting } from "./_autofill/patch-merger";
import { normalizeAutofillPatch } from "./_autofill/normalize-patch";
import { buildFallbackAutofill } from "./_autofill/fallback";
import { runRewriteBeat } from "./_autofill/rewrite-beat";
import type {
  AutofillFieldProvenance,
  AutofillInput,
  AutofillMode,
  AutofillResult,
} from "./_autofill/types";

export type { AutofillFieldProvenance, AutofillInput, AutofillMode, AutofillResult };
export { normalizeAutofillPatch };

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function runChapterAutofill(input: AutofillInput): Promise<AutofillResult> {
  const {
    mode,
    currentData,
    context,
    force = false,
    selectedPlotLabel,
    targetBeatId,
    userInstructions,
  } = input;
  const now = new Date().toISOString();

  // BUG-16 : branche dédiée pour réécriture ciblée d'un seul beat.
  if (mode === "rewrite_beat") {
    return runRewriteBeat({
      currentData,
      context,
      targetBeatId: targetBeatId ?? "",
      userInstructions: userInstructions ?? "",
      selectedPlotLabel: selectedPlotLabel ?? null,
      now,
    });
  }

  const missingFields = buildMissingFieldsList(currentData, mode);

  if (missingFields.length === 0 && !force) {
    const message = "Tous les champs requis pour ce mode sont déjà renseignés.";
    return {
      suggestedPatch: {},
      assumptions: [message],
      confidence: 1,
      unresolvedQuestions: [],
      appliedFields: [],
      provenance: [],
      meta: {
        source: "ai_autofill",
        generatedAt: now,
        mode,
        confidence: 1,
        assumptions: [message],
        appliedFields: [],
        unresolvedQuestions: [],
      },
    };
  }

  if (!process.env.OPENAI_API_KEY) {
    return buildFallbackAutofill(mode, currentData, context, missingFields, now);
  }

  const contextSummary = buildContextSummary(context);
  const currentDataSummary = buildCurrentDataSummary(currentData);
  const genreHintsBlock = buildGenreHintsBlock(context, selectedPlotLabel);
  const prompt = buildPromptForMode(
    mode,
    contextSummary,
    currentDataSummary,
    missingFields,
    force,
    genreHintsBlock,
  );

  try {
    const response = await openai.chat.completions.create({
      model: getAppConfig().OPENAI_AUTOFILL_MODEL ?? getAppConfig().OPENAI_NARRATIVE_MODEL,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.7,
      max_tokens: 2000,
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as {
      suggestedPatch?: Partial<ChapterStudioData>;
      assumptions?: string[];
      confidence?: number;
      unresolvedQuestions?: string[];
      provenance?: AutofillFieldProvenance[];
    };

    const rawPatch = parsed.suggestedPatch ?? {};
    // P0.1 — coerce une seule fois les champs object/array que le LLM aurait
    // sérialisés en string. Voir `_autofill/normalize-patch.ts`.
    const normalizedPatch = normalizeAutofillPatch(rawPatch as Record<string, unknown>);
    const mergedPatch = mergePatchRespectingExisting(currentData, normalizedPatch, force);
    const appliedFields = extractAppliedFields(mergedPatch);
    const confidence = Math.min(1, Math.max(0, parsed.confidence ?? 0.6));

    const meta: AutofillMeta = {
      source: "ai_autofill",
      generatedAt: now,
      mode,
      confidence,
      assumptions: parsed.assumptions ?? [],
      appliedFields,
      unresolvedQuestions: parsed.unresolvedQuestions ?? [],
    };

    return {
      suggestedPatch: mergedPatch,
      assumptions: parsed.assumptions ?? [],
      confidence,
      unresolvedQuestions: parsed.unresolvedQuestions ?? [],
      appliedFields,
      provenance: parsed.provenance ?? [],
      meta,
    };
  } catch (error) {
    console.warn("[chapter-autofill-engine] Erreur OpenAI :", error);
    return buildFallbackAutofill(mode, currentData, context, missingFields, now);
  }
}
