/**
 * manga-editor-agent-llm — appel LLM réel pour l'IA2 (Manga Editor).
 *
 * Façade — prompt et parsing dans `_manga-editor/`.
 */

import OpenAI from "openai";
import { getAppConfig } from "@manga-ai-studio/core";
import type { StoryboardPage, StoryboardPlan } from "../contracts/storyboard-plan";
import { validateStoryboardPlan } from "../validators/storyboard-validator";
import {
  runMangaEditorAgent,
  type MangaEditorInput,
  type MangaEditorOutput,
} from "./manga-editor-agent";
import { SYSTEM_PROMPT, buildUserPrompt } from "./_manga-editor/prompt-builder";
import { sanitizePage, computeDiagnostics } from "./_manga-editor/response-parser";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function runMangaEditorAgentLlm(
  input: MangaEditorInput,
): Promise<MangaEditorOutput> {
  if (!process.env.OPENAI_API_KEY) {
    const stub = await runMangaEditorAgent(input);
    return {
      storyboardPlan: stub.storyboardPlan,
      warnings: [...stub.warnings, "manga_editor.llm.degraded=OPENAI_API_KEY_missing"],
    };
  }

  const warnings: string[] = [];
  try {
    const response = await openai.chat.completions.create({
      model: getAppConfig().OPENAI_MANGA_EDITOR_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(input) },
      ],
      response_format: { type: "json_object" },
      temperature: 0.5,
      max_tokens: 8000,
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as { pages?: Array<Record<string, unknown>> };
    const rawPages = Array.isArray(parsed.pages) ? parsed.pages : [];
    if (rawPages.length === 0) throw new Error("llm_returned_no_pages");

    const validBeatIds = new Set(input.storyArc.beats.map((b) => b.beatId));
    const orderedBeatIds = input.storyArc.beats.map((b) => b.beatId);
    let beatFallbackCount = 0;
    const pages: StoryboardPage[] = [];
    let globalIndex = 0;
    for (let i = 0; i < rawPages.length; i++) {
      const res = sanitizePage(
        rawPages[i]!,
        i + 1,
        globalIndex,
        validBeatIds,
        orderedBeatIds,
        () => {
          beatFallbackCount += 1;
        },
      );
      if (!res) continue;
      pages.push(res.page);
      globalIndex = res.nextGlobalIndex;
    }
    if (pages.length === 0) throw new Error("llm_no_valid_pages_after_sanitize");
    if (beatFallbackCount > 0) {
      warnings.push(`manga_editor.llm.sanitize.sourceBeatId_fallback_count=${beatFallbackCount}`);
    }

    const storyboardPlan: StoryboardPlan = {
      chapterId: input.storyArc.chapterId,
      totalTargetPanels: globalIndex,
      pages,
      editorialDiagnostics: computeDiagnostics(pages),
    };

    const validation = validateStoryboardPlan(storyboardPlan);
    if (!validation.ok) {
      throw new Error(`validation_issues=${validation.issues.join("|")}`);
    }
    warnings.push(...validation.warnings.map((w) => `manga_editor.llm.validation.${w}`));

    return { storyboardPlan, warnings };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stub = await runMangaEditorAgent(input);
    return {
      storyboardPlan: stub.storyboardPlan,
      warnings: [
        ...stub.warnings,
        `manga_editor.llm.fallback=${msg}`,
      ],
    };
  }
}
