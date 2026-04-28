/**
 * P1.2 — Readiness IA par étape (snapshot / estimate / launch).
 * Source de vérité des types : le package `ai` ré-exporte pour compat.
 */

import { z } from "zod";

export type PremiumAiExecutionMode = "premium_required" | "best_effort";

export const aiStepReadinessSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("real"),
    provider: z.string(),
    model: z.string().optional(),
  }),
  z.object({
    status: z.literal("fallback"),
    reason: z.string(),
    premiumBlocking: z.boolean(),
  }),
  z.object({
    status: z.literal("missing"),
    reason: z.string(),
    premiumBlocking: z.boolean(),
  }),
  z.object({
    status: z.literal("failed"),
    reason: z.string(),
    premiumBlocking: z.boolean(),
  }),
]);

export type AiStepReadiness = z.infer<typeof aiStepReadinessSchema>;

export const chapterAiReadinessSchema = z.object({
  outline: aiStepReadinessSchema,
  storySpine: aiStepReadinessSchema,
  genreDirector: aiStepReadinessSchema,
  narrativeFacts: aiStepReadinessSchema,
  dialogue: aiStepReadinessSchema,
  imageProvider: aiStepReadinessSchema,
  visualQa: aiStepReadinessSchema,
  loraBindings: aiStepReadinessSchema,
});

export type ChapterAiReadiness = z.infer<typeof chapterAiReadinessSchema>;

/** Agrège les étapes signalées `premiumBlocking` (déjà filtrées côté producteur si mode non-premium). */
export function collectPremiumBlockingReasons(ai: ChapterAiReadiness): string[] {
  const reasons: string[] = [];
  for (const [key, step] of Object.entries(ai) as [string, AiStepReadiness][]) {
    if (step.status !== "real" && step.premiumBlocking) {
      const detail = "reason" in step ? step.reason : "";
      reasons.push(`${key}: ${detail}`);
    }
  }
  return reasons;
}
