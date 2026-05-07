/**
 * Zod helpers for LLM output parsing.
 * LLMs sometimes return enums as `["value"]` instead of `"value"` —
 * zodLlmEnum normalizes both into a valid z.enum while preserving
 * the literal union type in the output.
 */

import { z } from "zod";

type UnwrapArray = (v: unknown) => unknown;
const normalizeEnumInput: UnwrapArray = (v) =>
  Array.isArray(v) ? v[0] : typeof v === "string" ? v.trim() : v;

/**
 * Like `z.enum(values)` but accepts `["value"]` (single-element array)
 * and `"  value  "` (untrimmed) from LLM outputs.
 *
 * IMPORTANT: this returns a `ZodEffects` wrapping a `ZodEnum`, so
 * `z.infer<>` produces `T[number]` (the literal union).
 * When chaining `.default()`, call it on the inner `z.enum()` *before*
 * wrapping with `zodLlmEnum`, or use `zodLlmEnumWithDefault`.
 */
export function zodLlmEnum<T extends [string, ...string[]]>(values: T) {
  return z.preprocess(normalizeEnumInput, z.enum(values));
}

/**
 * `zodLlmEnum` + `.default(defaultValue)` — preserves literal types.
 */
export function zodLlmEnumWithDefault<T extends [string, ...string[]]>(
  values: T,
  defaultValue: T[number],
) {
  return z.preprocess(
    (v) => (v == null ? defaultValue : normalizeEnumInput(v)),
    z.enum(values),
  );
}
