import { z } from "zod";

/**
 * Legacy prompt payload shape kept only for compatibility bridges.
 * The main runtime path now goes through `composeMangaPanelPrompt()`.
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

/** @deprecated Use `composeMangaPanelPrompt()` as the primary runtime path. */
export function parsePromptComposerV2(raw: unknown): PromptComposerV2 {
  return promptComposerV2Schema.parse(raw);
}

/** @deprecated Use `composeMangaPanelPrompt()` as the primary runtime path. */
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

/** @deprecated Use `composeMangaPanelPrompt()` as the primary runtime path. */
export function mergeNegativePrompt(pc: PromptComposerV2): string {
  return pc.negative_prompt.map((s) => s.trim()).filter(Boolean).join(", ");
}

/**
 * Legacy assembler kept only for compatibility bridges.
 */
/** @deprecated Use `composeMangaPanelPrompt()` as the primary runtime path. */
export function toFalPayload(pc: PromptComposerV2) {
  return {
    prompt: mergePositivePrompt(pc),
    negative_prompt: mergeNegativePrompt(pc),
    ...pc.provider_params,
  };
}

/** @deprecated Use `composeMangaPanelPrompt()` as the primary runtime path. */
export function toStabilityPayload(pc: PromptComposerV2) {
  return {
    prompt: mergePositivePrompt(pc),
    negative_prompt: mergeNegativePrompt(pc),
    style_preset: pc.provider_params.style_preset,
    image: pc.reference_images[0],
  };
}
