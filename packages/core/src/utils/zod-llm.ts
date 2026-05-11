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
 *
 * Two overloads — mirroring zod's own `z.enum` design — preserve literal
 * narrowing in both call styles:
 *  1) `as const` / readonly tuple: `zodLlmEnum(MY_VALUES)`
 *  2) inline literal tuple:        `zodLlmEnum(["a", "b", "c"])`
 *
 * The `U extends string` generic forces TS to narrow each element to its
 * specific literal type instead of widening to `string`.
 */
export function zodLlmEnum<U extends string, T extends Readonly<[U, ...U[]]>>(
  values: T,
): z.ZodEffects<z.ZodEnum<[T[number], ...T[number][]]>, T[number], unknown>;
export function zodLlmEnum<U extends string, T extends [U, ...U[]]>(
  values: T,
): z.ZodEffects<z.ZodEnum<T>, T[number], unknown>;
export function zodLlmEnum(values: readonly [string, ...string[]]) {
  return z.preprocess(
    normalizeEnumInput,
    z.enum([...values] as [string, ...string[]]),
  );
}

/**
 * `zodLlmEnum` + `.default(defaultValue)` — preserves literal types.
 */
export function zodLlmEnumWithDefault<U extends string, T extends Readonly<[U, ...U[]]>>(
  values: T,
  defaultValue: T[number],
): z.ZodEffects<z.ZodEnum<[T[number], ...T[number][]]>, T[number], unknown>;
export function zodLlmEnumWithDefault<U extends string, T extends [U, ...U[]]>(
  values: T,
  defaultValue: T[number],
): z.ZodEffects<z.ZodEnum<T>, T[number], unknown>;
export function zodLlmEnumWithDefault(
  values: readonly [string, ...string[]],
  defaultValue: string,
) {
  return z.preprocess(
    (v) => (v == null ? defaultValue : normalizeEnumInput(v)),
    z.enum([...values] as [string, ...string[]]),
  );
}
