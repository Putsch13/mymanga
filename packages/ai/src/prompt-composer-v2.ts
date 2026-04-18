import { z } from "zod";

/**
 * Legacy prompt payload shape kept only for provider-side payload parsing /
 * serialization. The main runtime path goes through `composeMangaPanelPrompt()`
 * (packages/ai/src/manga-prompt-composer.ts).
 *
 * Les anciennes fonctions d'assemblage (`parsePromptComposerV2`,
 * `mergePositivePrompt`, `mergeNegativePrompt`, `toFalPayload`,
 * `toStabilityPayload`) étaient marquées @deprecated depuis des mois sans
 * consommateur runtime et ont été supprimées pour alléger l'index du package.
 */
export const promptComposerV2Schema = z.object({
  base_prompt: z.string(),
  style_pack_prompt: z.string(),
  character_constraints: z.array(z.string()),
  scene_constraints: z.array(z.string()),
  continuity_constraints: z.array(z.string()),
  negative_prompt: z.array(z.string()),
  provider_params: z.record(z.string(), z.unknown()).default({}),
  reference_images: z.array(z.string()),
});

export type PromptComposerV2 = z.infer<typeof promptComposerV2Schema>;
