/**
 * P0.1 — Normalisation stricte du patch autofill avant merge studio.
 *
 * Le LLM OpenAI (`response_format: json_object`) peut rendre n'importe quel
 * champ sous forme d'une string JSONifiée au lieu d'un object structuré.
 * Exemple réel observé en prod :
 *   { "narrativeContract": "{\"goal\":\"...\"}" }
 * au lieu de :
 *   { "narrativeContract": { "goal": "..." } }
 *
 * Le PATCH studio attend des objects — quand il reçoit une string, Zod
 * côté studio throw et la route PATCH fail 422. Résultat : UX cassée.
 *
 * Ici on coerce UNE SEULE FOIS : si le field attendu-object est en fait une
 * string qui JSON.parse en object, on remplace. Sinon on DROP le field et
 * on loggue un warning. Zéro fallback silencieux, zéro champ mal typé qui
 * remonte.
 */
import type { ChapterStudioData } from "@manga-ai-studio/core";

const AUTOFILL_OBJECT_FIELDS: readonly (keyof ChapterStudioData)[] = [
  "intent",
  "productionPlan",
  "chapterCanon",
  "characterSelection",
  "narrativeContract",
  "editorialOutline",
  "productionOutline",
] as const;

const AUTOFILL_ARRAY_FIELDS: readonly (keyof ChapterStudioData)[] = [
  // Ajouter ici si certains champs deviennent des arrays à coercer.
] as const;

function tryParseJsonObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  return null;
}

export function normalizeAutofillPatch(
  rawPatch: Record<string, unknown>,
): Partial<ChapterStudioData> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rawPatch)) {
    if (value === null || value === undefined) continue;

    if ((AUTOFILL_OBJECT_FIELDS as readonly string[]).includes(key)) {
      if (typeof value === "object" && !Array.isArray(value)) {
        out[key] = value;
        continue;
      }
      const coerced = tryParseJsonObject(value);
      if (coerced) {
        console.warn(
          `[autofill:normalize] coerced_string_to_object field=${key} — LLM a renvoyé une string JSON au lieu d'un object.`,
        );
        out[key] = coerced;
        continue;
      }
      console.warn(
        `[autofill:normalize] dropped_field field=${key} reason=expected_object_got_${typeof value} value_preview=${String(value).slice(0, 80)}`,
      );
      continue;
    }

    if ((AUTOFILL_ARRAY_FIELDS as readonly string[]).includes(key)) {
      if (Array.isArray(value)) {
        out[key] = value;
        continue;
      }
      if (typeof value === "string") {
        const parsed = tryParseJsonObject(value);
        if (Array.isArray(parsed)) {
          console.warn(`[autofill:normalize] coerced_string_to_array field=${key}`);
          out[key] = parsed;
          continue;
        }
      }
      console.warn(
        `[autofill:normalize] dropped_field field=${key} reason=expected_array_got_${typeof value}`,
      );
      continue;
    }

    out[key] = value;
  }
  return out as Partial<ChapterStudioData>;
}
