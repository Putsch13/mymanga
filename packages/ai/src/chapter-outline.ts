/**
 * Façade publique du chapter outline generator.
 *
 * Expose `generateChapterOutline()` ainsi que les types (`ChapterOutlineContext`,
 * `ChapterOutlineResult`, ...) consommés par le pipeline.
 *
 * Toute la logique métier vit dans `_chapter-outline/`.
 */
import { isPipelineV3PremiumOnlyEnabled } from "@manga-ai-studio/core";
import {
  buildGenreDirectorPromptHints,
  getGenreDirectorConfig,
  inferGenreMode,
} from "./services/genre-director";
import {
  outlineResultSchema,
  PremiumOutlineContractInvalidError,
  type ChapterOutlineContext,
  type ChapterOutlineGenerationResult,
} from "./_chapter-outline/schema";
import { fallbackOutline } from "./_chapter-outline/fallback";
import {
  attemptRepairOutlineJson,
  normalizeOutlineResult,
} from "./_chapter-outline/normalize";
import {
  buildOutlineSystemPrompt,
  buildOutlineUserPayload,
} from "./_chapter-outline/prompt";

export {
  PAGE_ROLES,
  PremiumOutlineContractInvalidError,
} from "./_chapter-outline/schema";
export type {
  PageRole,
  ChapterOutlineContext,
  ChapterOutlineResult,
  ChapterOutlineGenerationResult,
} from "./_chapter-outline/schema";
export { deriveBeatNarrativeContractFromOutlineBeat } from "./_chapter-outline/normalize";

function buildOutlineFallbackResult(
  ctx: ChapterOutlineContext,
  fallbackReason: string,
): ChapterOutlineGenerationResult {
  console.warn(
    `[generateChapterOutline] degraded_status=DEGRADED_OUTLINE_FALLBACK chapter=${ctx.chapterNumber} reason=${fallbackReason}`,
  );
  return {
    outline: fallbackOutline(ctx),
    usedOpenAI: false,
    degradedStatus: "DEGRADED_OUTLINE_FALLBACK",
    fallbackReason,
  };
}

/**
 * FIX-22 (MOD) — En premium, si la première tentative LLM produit du JSON
 * invalide (et que la réparation échoue), on relance UNE fois avec un
 * prompt durci ("output strictly compliant JSON, no comments, no
 * markdown, no extra fields"). Avant ce TODO, on partait directement en
 * fail-closed → un seul "petit" hallucination invalidait le chapitre
 * entier. La retry isole les vrais cassages des coquilles JSON.
 */
async function callOpenAiOutlineOnce(args: {
  apiKey: string;
  model: string;
  system: string;
  userPayload: unknown;
  strict: boolean;
  temperature: number;
}): Promise<{ ok: true; raw: string } | { ok: false; reason: string }> {
  const { apiKey, model, system, userPayload, strict, temperature } = args;
  const strictSuffix = strict
    ? "\n\nSTRICT JSON MODE — Réponds UNIQUEMENT avec un objet JSON valide, conforme au schéma. Pas de markdown, pas de commentaire, pas de champ supplémentaire, pas de tableau pour un champ de type string. Si tu hésites sur un enum, choisis la valeur exacte du schéma."
    : "";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system + strictSuffix },
        {
          role: "user",
          content: `Produit l'outline du chapitre à partir de ce contexte JSON :\n${JSON.stringify(userPayload, null, 2)}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.warn("[generateChapterOutline] OpenAI error", res.status, errText);
    return { ok: false, reason: `OpenAI HTTP ${res.status}` };
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) return { ok: false, reason: "OpenAI returned empty content" };
  return { ok: true, raw };
}

/**
 * Produit un outline structuré (résumé, cliffhanger, beats) pour le lecteur
 * manga / pipeline. Sans `OPENAI_API_KEY`, renvoie un gabarit déterministe
 * basé sur l'intention utilisateur.
 */
export async function generateChapterOutline(
  ctx: ChapterOutlineContext,
): Promise<ChapterOutlineGenerationResult> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    if (isPipelineV3PremiumOnlyEnabled()) {
      throw new Error(
        "premium_outline_openai_required: OPENAI_API_KEY is required for chapter outline in premium pipeline.",
      );
    }
    return buildOutlineFallbackResult(ctx, "OPENAI_API_KEY missing");
  }

  const genreMode = inferGenreMode(ctx.creativityControls ?? {}, ctx.quickTag);
  const genreConfig = getGenreDirectorConfig(genreMode);
  const genreHints = buildGenreDirectorPromptHints(genreConfig);

  const model = process.env.OPENAI_OUTLINE_MODEL?.trim() || "gpt-4o-mini";
  const system = buildOutlineSystemPrompt({ ctx, genreMode, genreHints });
  const userPayload = buildOutlineUserPayload({ ctx, genreMode });

  try {
    const isPremium = isPipelineV3PremiumOnlyEnabled();
    const firstAttempt = await callOpenAiOutlineOnce({
      apiKey: key,
      model,
      system,
      userPayload,
      strict: false,
      temperature: 0.75,
    });
    if (!firstAttempt.ok) {
      return buildOutlineFallbackResult(ctx, firstAttempt.reason);
    }

    const parseRaw = (raw: string): { parsed: unknown; ok: true } | { ok: false; reason: string } => {
      try {
        return { parsed: JSON.parse(raw) as unknown, ok: true };
      } catch (err) {
        return {
          ok: false,
          reason: `outline_json_parse_failed: ${err instanceof Error ? err.message : "unknown"}`,
        };
      }
    };

    const firstParse = parseRaw(firstAttempt.raw);
    let parsed: unknown = firstParse.ok ? firstParse.parsed : null;
    let outline = parsed === null
      ? outlineResultSchema.safeParse(parsed)
      : outlineResultSchema.safeParse(parsed);
    if (!outline.success) {
      console.warn(
        `[outline] initial_parse_failed chapter=${ctx.chapterNumber} ` +
          `issues=${outline.error.issues.length} first=${outline.error.issues[0]?.path.join(".")}: ${outline.error.issues[0]?.message}`,
      );
      outline = attemptRepairOutlineJson(parsed);
      if (outline.success) {
        console.info(`[outline] repair_succeeded chapter=${ctx.chapterNumber}`);
      } else if (isPremium) {
        // FIX-22 — Retry premium avec prompt strict + temperature plus
        // basse. On NE retombe PAS encore en fail-closed : on laisse une
        // chance au LLM de produire un JSON conforme.
        console.warn(
          `[outline] retry_with_strict_prompt chapter=${ctx.chapterNumber} reason=repair_failed`,
        );
        const retry = await callOpenAiOutlineOnce({
          apiKey: key,
          model,
          system,
          userPayload,
          strict: true,
          temperature: 0.45,
        });
        if (retry.ok) {
          const retryParse = parseRaw(retry.raw);
          if (retryParse.ok) {
            parsed = retryParse.parsed;
            outline = outlineResultSchema.safeParse(parsed);
            if (!outline.success) {
              outline = attemptRepairOutlineJson(parsed);
            }
            if (outline.success) {
              console.info(
                `[outline] retry_succeeded chapter=${ctx.chapterNumber} mode=strict`,
              );
            }
          }
        }
      }
    }
    if (!outline.success) {
      if (isPremium) {
        console.error(
          `[outline] premium_fail_closed chapter=${ctx.chapterNumber} ` +
            `issues=${outline.error.issues.length}`,
        );
        throw new PremiumOutlineContractInvalidError(
          outline.error,
          "outline_json_validation_failed",
        );
      }
      return buildOutlineFallbackResult(ctx, "Outline JSON validation failed");
    }

    const normalizedOutline = normalizeOutlineResult(ctx, outline.data);
    console.info(
      `[outline] chapter=${ctx.chapterNumber} beats=${normalizedOutline.beats.length} ` +
        `model=${model} status=FULLY_OPERATIONAL`,
    );
    return {
      outline: normalizedOutline,
      usedOpenAI: true,
      model,
      degradedStatus: "FULLY_OPERATIONAL",
    };
  } catch (e) {
    if (e instanceof PremiumOutlineContractInvalidError) throw e;
    console.warn("[generateChapterOutline]", e);
    if (isPipelineV3PremiumOnlyEnabled()) {
      throw new PremiumOutlineContractInvalidError(
        null,
        e instanceof Error ? e.message : "unknown_outline_exception",
      );
    }
    return buildOutlineFallbackResult(
      ctx,
      e instanceof Error ? e.message : "Unknown outline exception",
    );
  }
}
