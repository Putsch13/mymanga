/**
 * P4.2 — Schémas Zod de frontière pour les contrats pipeline.
 *
 * Problème historique : plusieurs blobs critiques étaient lus "à la main"
 * sans validation (`entityRegistry`, `objectStateTimeline`,
 * `characterFingerprint`). Un typo ou un changement silencieux de forme
 * d'un provider pouvait faire drift dangereusement sans aucun log.
 *
 * Règle : ces schémas SONT EN MODE TOLÉRANT (`.safeParse()` only, pas de
 * throw systématique). Si l'entrée est invalide, l'appelant dégrade en
 * sortie par défaut et `logPipelineWarn` remonte la raison.
 *
 * Les schémas sont volontairement strict() sur les blobs "obligatoires"
 * (characterFingerprint) et lenient (.passthrough()) sur les blobs
 * "extensibles" (entityRegistry) pour rester forward-compatible.
 */

import { z } from "zod";
import { logPipelineWarn } from "../lib/pipeline-logger";

// ── entityRegistry ────────────────────────────────────────────────────────
export const namedEntitySchema = z
  .object({
    name: z.string().min(1),
    promotionStatus: z.string().optional().nullable(),
    allowedRecurrence: z.string().optional().nullable(),
  })
  .passthrough();

export const temporaryEntitySchema = z
  .object({
    name: z.string().min(1),
  })
  .passthrough();

export const entityRegistrySchema = z
  .object({
    namedEntities: z.array(namedEntitySchema).optional(),
    temporaryEntities: z.array(temporaryEntitySchema).optional(),
    backgroundExtras: z.array(temporaryEntitySchema).optional(),
  })
  .passthrough();

export type EntityRegistry = z.infer<typeof entityRegistrySchema>;

export function parseEntityRegistry(raw: unknown): EntityRegistry | null {
  if (raw === null || raw === undefined) return null;
  const res = entityRegistrySchema.safeParse(raw);
  if (!res.success) {
    logPipelineWarn("zod_entity_registry_invalid", {
      issues: res.error.issues.slice(0, 5).map((i) => ({ path: i.path.join("."), message: i.message })),
    });
    return null;
  }
  return res.data;
}

// ── objectStateTimeline ───────────────────────────────────────────────────
export const objectStateEntrySchema = z
  .object({
    objectId: z.string().optional().nullable(),
    objectName: z.string().optional().nullable(),
    state: z.string().optional().nullable(),
    sceneIndex: z.number().int().nonnegative().optional().nullable(),
    panelNumber: z.number().int().nonnegative().optional().nullable(),
  })
  .passthrough();

export const objectStateTimelineSchema = z.array(objectStateEntrySchema);

export type ObjectStateEntry = z.infer<typeof objectStateEntrySchema>;

export function parseObjectStateTimeline(raw: unknown): ObjectStateEntry[] {
  if (!Array.isArray(raw)) return [];
  const res = objectStateTimelineSchema.safeParse(raw);
  if (!res.success) {
    logPipelineWarn("zod_object_state_timeline_invalid", {
      issues: res.error.issues.slice(0, 5).map((i) => ({ path: i.path.join("."), message: i.message })),
    });
    return [];
  }
  return res.data;
}

// ── characterFingerprint ──────────────────────────────────────────────────
export const characterFingerprintSchema = z
  .object({
    characterId: z.string().optional().nullable(),
    hardTraits: z.array(z.string()).optional(),
    softTraits: z.array(z.string()).optional(),
    visualSignature: z.string().optional().nullable(),
    facialHash: z.string().optional().nullable(),
    generatedAt: z.string().optional().nullable(),
  })
  .passthrough();

export type CharacterFingerprint = z.infer<typeof characterFingerprintSchema>;

export function parseCharacterFingerprint(raw: unknown): CharacterFingerprint | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  if (Object.keys(raw as Record<string, unknown>).length === 0) return null;
  const res = characterFingerprintSchema.safeParse(raw);
  if (!res.success) {
    logPipelineWarn("zod_character_fingerprint_invalid", {
      issues: res.error.issues.slice(0, 5).map((i) => ({ path: i.path.join("."), message: i.message })),
    });
    return null;
  }
  return res.data;
}
