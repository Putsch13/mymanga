/**
 * Contrat monde visuel chapitre — source cible pour le pipeline premium IA-first.
 * (P0 bis.1 — schéma Zod ; le compositeur IA branchera ici.)
 *
 * Champs `version` / `diagnostics` / extensions par entité : QA studio, dashboard,
 * messages d’erreur explicables (PR10).
 */

import { z } from "zod";
import { zodLlmEnum } from "../utils/zod-llm";

export const visualWorldSourceSchema = zodLlmEnum(["ai_generated", "studio_curated", "mixed"]);
export type VisualWorldSource = z.infer<typeof visualWorldSourceSchema>;

export const visualWorldLocationSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  kind: z.string().min(1),
  description: z.string().min(1),
  visualAnchors: z.array(z.string()).default([]),
  architecture: z.array(z.string()).default([]),
  lighting: z.array(z.string()).default([]),
  atmosphere: z.array(z.string()).default([]),
  recurringProps: z.array(z.string()).default([]),
  negativeConstraints: z.array(z.string()).default([]),
  source: zodLlmEnum(["db_canon", "user_canon", "ai_generated", "story_text"]),
  canonPolicy: zodLlmEnum(["temporary", "promote_candidate", "locked"]),
});

export type VisualWorldLocation = z.infer<typeof visualWorldLocationSchema>;

export const propVisibilityPolicySchema = zodLlmEnum(["visible", "mentioned", "background"]);
export type PropVisibilityPolicy = z.infer<typeof propVisibilityPolicySchema>;

export const propVisualDnaContractSchema = z.object({
  id: z.string().min(1),
  canonicalName: z.string().min(1),
  category: z.string().min(1),
  visualDescription: z.string().min(1),
  ownerCharacterId: z.string().optional().nullable(),
  locationId: z.string().optional().nullable(),
  requiredBeatIds: z.array(z.string()).default([]),
  continuityPolicy: zodLlmEnum(["single_use", "recurring", "symbolic"]),
  visibilityPolicy: propVisibilityPolicySchema.optional().nullable(),
  symbolicMeaning: z.string().optional().nullable(),
});

export type VisualWorldPropDna = z.infer<typeof propVisualDnaContractSchema>;

export const visualWorldNpcGroupSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  role: z.string().min(1),
  visualProfile: z.string().min(1),
  outfit: z.string().min(1),
  silhouette: z.string().min(1),
  relationToLocation: z.string().optional().nullable(),
  relationToCharacterIds: z.array(z.string()).default([]),
  requiredBeatIds: z.array(z.string()).default([]),
  recurrencePolicy: zodLlmEnum(["background", "recurring", "named"]),
});

export type VisualWorldNpcGroup = z.infer<typeof visualWorldNpcGroupSchema>;

export const creatureVisualDnaSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  visualDescription: z.string().min(1),
  requiredBeatIds: z.array(z.string()).default([]),
  threatLevel: z
    .preprocess(
      (v) => (Array.isArray(v) ? v[0] : v == null || v === "" ? "none" : v),
      z.enum(["none", "low", "medium", "high"]),
    )
    .default("none"),
});

export type CreatureVisualDna = z.infer<typeof creatureVisualDnaSchema>;

export const vehicleVisualDnaSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  visualDescription: z.string().min(1),
  requiredBeatIds: z.array(z.string()).default([]),
  scale: z
    .preprocess(
      (v) => (Array.isArray(v) ? v[0] : v == null || v === "" ? "medium" : v),
      z.enum(["small", "medium", "large", "massive"]),
    )
    .default("medium"),
});

export type VehicleVisualDna = z.infer<typeof vehicleVisualDnaSchema>;

export const factionVisualDnaSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  visualMarkers: z.array(z.string()).default([]),
  visualMotifs: z.array(z.string()).default([]),
  colors: z.array(z.string()).default([]),
  emblem: z.string().optional().nullable(),
  requiredBeatIds: z.array(z.string()).default([]),
});

export type FactionVisualDna = z.infer<typeof factionVisualDnaSchema>;

export const beatVisualBindingSchema = z.object({
  beatId: z.string().min(1),
  locationId: z.string().optional().nullable(),
  primaryPropIds: z.array(z.string()).default([]),
  npcGroupIds: z.array(z.string()).default([]),
  /** Références explicites (ids dans `creatures[]`) — fusionnées avec `requiredBeatIds` sur chaque créature. */
  creatureIds: z.array(z.string()).default([]),
  vehicleIds: z.array(z.string()).default([]),
  factionIds: z.array(z.string()).default([]),
  environmentMood: z.string().optional().nullable(),
  continuityObjectIds: z.array(z.string()).default([]),
});

export type BeatVisualBinding = z.infer<typeof beatVisualBindingSchema>;

export const visualWorldDiagnosticsSchema = z.object({
  warnings: z.array(z.string()).default([]),
  repaired: z.array(z.string()).default([]),
  missing: z.array(z.string()).optional(),
});

export type VisualWorldDiagnostics = z.infer<typeof visualWorldDiagnosticsSchema>;

export const visualWorldContractSchema = z.object({
  version: z.literal(1).optional().default(1),
  chapterId: z.string().min(1),
  source: visualWorldSourceSchema,
  locations: z.array(visualWorldLocationSchema),
  props: z.array(propVisualDnaContractSchema),
  npcGroups: z.array(visualWorldNpcGroupSchema),
  creatures: z.array(creatureVisualDnaSchema),
  vehicles: z.array(vehicleVisualDnaSchema),
  factions: z.array(factionVisualDnaSchema),
  beatBindings: z.array(beatVisualBindingSchema),
  diagnostics: visualWorldDiagnosticsSchema.optional(),
});

export type VisualWorldContract = z.infer<typeof visualWorldContractSchema>;

export function parseVisualWorldContract(input: unknown): VisualWorldContract {
  return visualWorldContractSchema.parse(input);
}
