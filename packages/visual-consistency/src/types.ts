import { z } from "zod";

export const visualConsistencyScoreSchema = z.object({
  imageId: z.string(),
  characterId: z.string().optional().nullable(),
  face: z.number().min(0).max(1),
  silhouette: z.number().min(0).max(1),
  palette: z.number().min(0).max(1),
  accessories: z.number().min(0).max(1),
  outfit: z.number().min(0).max(1),
  overall: z.number().min(0).max(1),
  issues: z.array(z.string()).default([]),
});

export type VisualConsistencyScore = z.infer<typeof visualConsistencyScoreSchema>;

export const canonVisualReferenceRoleSchema = z.enum([
  "front_neutral",
  "profile",
  "full_body",
  "intense_expression",
  "signature_outfit",
  "combat_variant",
  "accessory_closeup",
]);

export type CanonVisualReferenceRole = z.infer<typeof canonVisualReferenceRoleSchema>;
