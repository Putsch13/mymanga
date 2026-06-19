/**
 * P0.5 — Contrat d’intention chapitre compilé par l’IA (wizard étape 1).
 * Distinct du `ChapterIntent` éditorial (pitch / titre) : ceci est la trace
 * « comprise et validée » pour premium readiness et downstream (cast, monde).
 */
import { z } from "zod";

export const chapterIntentContractSchema = z.object({
  rawUserIntent: z.string(),
  understoodPitch: z.string(),

  /**
   * Époque / période temporelle de la scène (ex. "médiéval-fantasy",
   * "Japon Edo", "cyberpunk proche futur"). Conditionne décors, costumes
   * et props en aval. Vide = non précisé (l'interviewer IA pose la question).
   */
  era: z.string().default(""),
  /**
   * Cadre / type de monde (ex. "village portuaire", "station orbitale",
   * "forêt enchantée"). Complète `era` pour ancrer le VisualWorldContract.
   */
  setting: z.string().default(""),

  mustInclude: z.array(z.string()).default([]),
  mustAvoid: z.array(z.string()).default([]),

  requiredCharacters: z.array(z.string()).default([]),
  requiredLocations: z.array(z.string()).default([]),
  requiredNpcs: z.array(z.string()).default([]),
  requiredCreatures: z.array(z.string()).default([]),
  requiredProps: z.array(z.string()).default([]),

  emotionalGoal: z.string(),
  plotGoal: z.string(),
  characterArcGoal: z.string(),

  tone: z.string(),
  pacing: z.enum(["slow", "balanced", "fast"]),
  dialogueDensity: z.enum(["low", "medium", "high"]),

  expectedCliffhanger: z.boolean(),
  ambiguityFlags: z.array(z.string()).default([]),
  /** 0–1 ; premium bloque en dessous de 0.75 tant que l’utilisateur n’a pas réécrit / recompilé. */
  confidenceScore: z.number().min(0).max(1),
});

export type ChapterIntentContract = z.infer<typeof chapterIntentContractSchema>;
