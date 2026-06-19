import type { ContentIntensityLayer } from "./content-intensity";
import { z } from "zod";

const forbiddenPatterns = [
  /child\s*porn/i,
  /underage\s*sex/i,
  /\bminor\b.*\b(nude|naked|sex)/i,
];

const promptComposerV2Shape = z.object({
  base_prompt: z.string(),
  style_pack_prompt: z.string(),
  character_constraints: z.array(z.string()),
  scene_constraints: z.array(z.string()),
  continuity_constraints: z.array(z.string()),
  negative_prompt: z.array(z.string()),
  provider_params: z.record(z.string(), z.unknown()).optional(),
  reference_images: z.array(z.string()),
});

export type PromptComposerV2Payload = z.infer<typeof promptComposerV2Shape>;

export function validatePromptComposerPayload(raw: unknown): PromptComposerV2Payload {
  return promptComposerV2Shape.parse(raw);
}

/**
 * Garde-fou sur le payload assemblé (évite contournement par prompts intermédiaires).
 */
export function scanAssembledTextForBlockedContent(
  payload: PromptComposerV2Payload,
  layer: ContentIntensityLayer,
): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const blob = [
    payload.base_prompt,
    payload.style_pack_prompt,
    ...payload.character_constraints,
    ...payload.scene_constraints,
    ...payload.continuity_constraints,
  ].join("\n");

  if (layer === "RESTRICTED_BLOCKED_VISUAL") {
    reasons.push("RESTRICTED_BLOCKED_VISUAL : génération image interdite.");
  }

  for (const re of forbiddenPatterns) {
    if (re.test(blob)) {
      reasons.push("Motif bloqué détecté dans le prompt assemblé.");
    }
  }

  return { ok: reasons.length === 0, reasons };
}
