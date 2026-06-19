import { z } from "zod";

const outlineArcPromiseSchema = z.object({
  arcName: z.string().min(1),
  promise: z.string().min(1),
  stage: z.enum(["setup", "progression", "payoff", "twist"]),
  priority: z.enum(["low", "medium", "high"]),
  payoffTarget: z.string().optional().nullable(),
});

const outlineWorldConsequenceSchema = z.object({
  consequenceType: z.string().min(1),
  description: z.string().min(1),
  scope: z.enum(["local", "chapter", "world"]),
  persistence: z.enum(["temporary", "lasting", "permanent"]),
  affectedLocations: z.array(z.string()).default([]),
  affectedCharacters: z.array(z.string()).default([]),
});

const outlineSetupPayoffHookSchema = z.object({
  hookId: z.string().min(1),
  label: z.string().min(1),
  kind: z.enum(["setup", "foreshadowing", "echo", "payoff"]),
  targetBeatHint: z.string().optional().nullable(),
  resolved: z.boolean().default(false),
});

const structuredBeatPayloadSchema = z.object({
  source: z.enum(["generator_structured", "heuristic_fallback"]).default("heuristic_fallback"),
  confidence: z.number().min(0).max(1).default(0.6),
  arcPromises: z.array(outlineArcPromiseSchema).default([]),
  worldConsequences: z.array(outlineWorldConsequenceSchema).default([]),
  setupPayoffHooks: z.array(outlineSetupPayoffHookSchema).default([]),
});

export const approvedOutlineBeatSchema = z.object({
  id: z.string().min(1),
  summary: z.string().min(10),
  characters: z.array(z.string().min(1)).default([]),
  location: z.string().min(1),
  pageRole: z.string().min(1),
  turn: z.string().min(1),
  emotionalDelta: z.number().int().min(-3).max(3),
  structuredBeat: structuredBeatPayloadSchema.optional().nullable(),
});

export const approvedOutlineSchema = z.object({
  summary: z.string().min(10),
  cliffhanger: z.string().min(3),
  beats: z.array(approvedOutlineBeatSchema).min(1).max(24),
  approvedAt: z.string().min(1),
  approvalVersion: z.string().min(1),
  source: z.enum(["estimate_preview", "user_approved"]).default("user_approved"),
  narrativeMode: z.enum(["linear", "flashback_framed", "flash_forward_framed", "in_medias_res"]).optional(),
  flashbackContext: z.object({
    triggeredBy: z.string(),
    timeframe: z.string(),
    returnBeat: z.number(),
  }).optional().nullable(),
});

export type ApprovedOutlineBeat = z.infer<typeof approvedOutlineBeatSchema>;
export type ApprovedChapterOutline = z.infer<typeof approvedOutlineSchema>;
