/**
 * Schémas Zod du contrat visuel de chapitre côté LLM.
 *
 * Le LLM produit un objet "souple" (rôles FR, kinds variables) que l'on
 * normalise via `normalize-roles.ts` avant `safeParse`.
 */
import { z } from "zod";

const importanceSchema = z.enum(["required", "optional", "ambient"]);

export const locationSliceSchema = z.object({
  name: z.string(),
  description: z.string().default(""),
  confidence: z.number().min(0).max(1).default(0.7),
  sourceBeatIds: z.array(z.string()).default([]),
  importance: importanceSchema.default("optional"),
});

export const characterSliceSchema = z.object({
  name: z.string(),
  role: z.enum(["main", "secondary", "npc", "unknown"]).default("unknown"),
  knownCharacterId: z.string().optional(),
  confidence: z.number().min(0).max(1).default(0.7),
  sourceBeatIds: z.array(z.string()).default([]),
  importance: importanceSchema.default("optional"),
});

export const groupSliceSchema = z.object({
  name: z.string(),
  kind: z.enum(["npc_group", "species", "crowd", "faction"]).default("npc_group"),
  description: z.string().default(""),
  confidence: z.number().min(0).max(1).default(0.6),
  sourceBeatIds: z.array(z.string()).default([]),
  importance: importanceSchema.default("optional"),
});

export const creatureSliceSchema = z.object({
  name: z.string(),
  kind: z
    .enum(["monster", "hybrid", "robot", "animal", "spirit", "unknown"])
    .default("unknown"),
  description: z.string().default(""),
  confidence: z.number().min(0).max(1).default(0.7),
  sourceBeatIds: z.array(z.string()).default([]),
  importance: importanceSchema.default("optional"),
});

export const propSliceSchema = z.object({
  name: z.string(),
  description: z.string().default(""),
  importance: importanceSchema.default("optional"),
  confidence: z.number().min(0).max(1).default(0.65),
  sourceBeatIds: z.array(z.string()).default([]),
});

export const rejectedSliceSchema = z.object({
  name: z.string(),
  reason: z.string(),
});

export const chapterVisualContractLlmSchema = z.object({
  mainLocation: locationSliceSchema.nullable().optional(),
  secondaryLocations: z.array(locationSliceSchema).default([]),
  characters: z.array(characterSliceSchema).default([]),
  groups: z.array(groupSliceSchema).default([]),
  species: z.array(creatureSliceSchema).default([]),
  robots: z.array(creatureSliceSchema).default([]),
  hybrids: z.array(creatureSliceSchema).default([]),
  creatures: z.array(creatureSliceSchema).default([]),
  props: z.array(propSliceSchema).default([]),
  ambientElements: z.array(propSliceSchema).default([]),
  rejectedOrUnrelated: z.array(rejectedSliceSchema).default([]),
  needsClarification: z.boolean().optional(),
});

export type ChapterVisualContractLlm = z.infer<typeof chapterVisualContractLlmSchema>;
