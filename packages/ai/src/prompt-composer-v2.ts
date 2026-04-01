import { z } from "zod";

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

export function parsePromptComposerV2(raw: unknown): PromptComposerV2 {
  return promptComposerV2Schema.parse(raw);
}

export function mergePositivePrompt(pc: PromptComposerV2): string {
  const parts = [
    pc.base_prompt.trim(),
    pc.style_pack_prompt.trim(),
    ...pc.character_constraints.map((s) => s.trim()).filter(Boolean),
    ...pc.scene_constraints.map((s) => s.trim()).filter(Boolean),
    ...pc.continuity_constraints.map((s) => s.trim()).filter(Boolean),
  ];
  return parts.join(". ");
}

export function mergeNegativePrompt(pc: PromptComposerV2): string {
  return pc.negative_prompt.map((s) => s.trim()).filter(Boolean).join(", ");
}

/**
 * Assembleur minimal par famille de provider (à étendre par adapter).
 */
export function toFalPayload(pc: PromptComposerV2) {
  return {
    prompt: mergePositivePrompt(pc),
    negative_prompt: mergeNegativePrompt(pc),
    ...pc.provider_params,
  };
}

export function toStabilityPayload(pc: PromptComposerV2) {
  return {
    prompt: mergePositivePrompt(pc),
    negative_prompt: mergeNegativePrompt(pc),
    style_preset: pc.provider_params.style_preset,
    image: pc.reference_images[0],
  };
}
