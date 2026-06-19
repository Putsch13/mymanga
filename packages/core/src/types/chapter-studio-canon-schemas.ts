/**
 * chapter-studio-canon-schemas.ts
 *
 * Schémas Zod liés au canon : enums (status, step, tier, lock strength),
 * project canon, outfit canon, character canon, location canon.
 *
 * Extrait de `chapter-studio.ts` (audit-v9, < 500 lignes/fichier).
 */

import { z } from "zod";

export const chapterStudioStepSchema = z.enum([
  "intent",
  "narrative_contract",
  "characters",
  "canon",
  "editorial_outline",
  "production_outline",
  "production_plan",
  "readiness",
  "generation",
  "review",
]);

export type ChapterStudioStep = z.infer<typeof chapterStudioStepSchema>;

export const chapterStudioStatusSchema = z.enum([
  "DRAFT",
  "NARRATIVE_CONTRACT_READY",
  "CANON_READY",
  "OUTLINE_EDITORIAL_READY",
  "OUTLINE_PRODUCTION_READY",
  "PRODUCTION_PLAN_READY",
  "READY_FOR_GENERATION",
  "GENERATING",
  "GENERATION_PARTIAL",
  "QA_REVIEW",
  "NEEDS_FIXES",
  "COMPLETED",
  "PUBLISHED",
]);

export type ChapterStudioStatus = z.infer<typeof chapterStudioStatusSchema>;

export const canonLockStrengthSchema = z.enum([
  "HARD_LOCK",
  "STRONG",
  "MEDIUM",
  "LIGHT",
  "NONE",
]);

export type CanonLockStrength = z.infer<typeof canonLockStrengthSchema>;

export const characterImportanceTierSchema = z.enum([
  "MAIN_HERO",
  "SECONDARY_CORE",
  "IMPORTANT_SUPPORTING_CHARACTER",
  "RECURRING_NPC",
  "BACKGROUND_EXTRA",
]);

export type CharacterImportanceTier = z.infer<typeof characterImportanceTierSchema>;

export const projectCanonSchema = z.object({
  artStyleCanon: z.array(z.string()).default([]),
  worldRules: z.array(z.string()).default([]),
  toneRules: z.array(z.string()).default([]),
  violenceLevel: z.number().int().min(0).max(100).optional().nullable(),
  romanceLevel: z.number().int().min(0).max(100).optional().nullable(),
  supernaturalRules: z.array(z.string()).default([]),
  panelingPreferences: z.array(z.string()).default([]),
  blackAndWhitePolicy: z.string().optional().nullable(),
  inkingPolicy: z.string().optional().nullable(),
  negativeStyleRules: z.array(z.string()).default([]),
});

export type ProjectCanon = z.infer<typeof projectCanonSchema>;

export const outfitCanonSchema = z.object({
  outfitId: z.string(),
  characterId: z.string(),
  label: z.string(),
  top: z.string().optional().nullable(),
  bottom: z.string().optional().nullable(),
  shoes: z.string().optional().nullable(),
  accessories: z.array(z.string()).default([]),
  stateTags: z.array(z.string()).default([]),
  seasonContext: z.string().optional().nullable(),
  colorMemory: z.array(z.string()).default([]),
  shapeMemory: z.array(z.string()).default([]),
  continuityPriority: z.number().int().min(0).max(100).default(50),
});

export type OutfitCanon = z.infer<typeof outfitCanonSchema>;

export const characterCanonSchema = z.object({
  characterId: z.string(),
  role: z.string().optional().nullable(),
  canonicalName: z.string(),
  importanceTier: characterImportanceTierSchema.default("IMPORTANT_SUPPORTING_CHARACTER"),
  lockStrength: canonLockStrengthSchema.default("MEDIUM"),
  visualIdentity: z.array(z.string()).default([]),
  silhouette: z.string().optional().nullable(),
  faceTraits: z.array(z.string()).default([]),
  eyeTraits: z.array(z.string()).default([]),
  hairTraits: z.array(z.string()).default([]),
  skinTone: z.string().optional().nullable(),
  bodyType: z.string().optional().nullable(),
  apparentAge: z.string().optional().nullable(),
  accessories: z.array(z.string()).default([]),
  signatureMarks: z.array(z.string()).default([]),
  defaultOutfitId: z.string().optional().nullable(),
  defaultOutfitSet: z.array(outfitCanonSchema).default([]),
  emotionalRange: z.array(z.string()).default([]),
  forbiddenDrift: z.array(z.string()).default([]),
  mustKeep: z.array(z.string()).default([]),
  optionalVariation: z.array(z.string()).default([]),
  referenceAssets: z.array(z.string()).default([]),
  loraBindings: z.array(z.string()).default([]),
  fingerprint: z.record(z.string(), z.unknown()).default({}),
  canonPackCompleteness: z.number().min(0).max(1).optional().nullable(),
  hasCanonPack: z.boolean().optional(),
});

export type CharacterCanon = z.infer<typeof characterCanonSchema>;

export const locationCanonSchema = z.object({
  locationId: z.string(),
  label: z.string(),
  visualMarkers: z.array(z.string()).default([]),
  architecture: z.array(z.string()).default([]),
  density: z.string().optional().nullable(),
  atmosphere: z.array(z.string()).default([]),
  timeOfDayVariants: z.array(z.string()).default([]),
  weatherVariants: z.array(z.string()).default([]),
  mustKeep: z.array(z.string()).default([]),
  forbiddenDrift: z.array(z.string()).default([]),
  /** P0.8 — décor principal du chapitre (wizard chapitre 1 + readiness). */
  isPrimary: z.boolean().optional().default(false),
  /** Brief visuel libre (complète visualMarkers pour l’IA). */
  visualBrief: z.string().optional().nullable(),
  /** Type de lieu (ville, intérieur, extérieur, etc.). */
  locationType: z.string().optional().nullable(),
  fixedElements: z.array(z.string()).default([]),
  lightingRules: z.array(z.string()).default([]),
  palette: z.array(z.string()).default([]),
  referenceImages: z.array(z.string()).default([]),
});

export type LocationCanon = z.infer<typeof locationCanonSchema>;
/** Alias spec P0.8 — même schéma que `LocationCanon` studio. */
export type ChapterLocationContract = LocationCanon;
