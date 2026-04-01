import type { ContentIntensityLayer, ImageProviderForModeration } from "./content-intensity";

export type ModerationDecision = "ALLOW" | "DEGRADE" | "BLOCK";

export type CapabilityMatrix = Record<
  ImageProviderForModeration,
  Partial<Record<ContentIntensityLayer, { image: ModerationDecision; notes?: string }>>
>;

/**
 * Matrice indicative intensité × provider (à affiner selon CGU réelles).
 */
export const PROVIDER_IMAGE_CAPABILITIES: CapabilityMatrix = {
  fal: {
    GENERAL_SAFE: { image: "ALLOW" },
    TEEN: { image: "ALLOW" },
    MATURE_DRAMA: { image: "ALLOW", notes: "violence/horreur stylisée sous contrôle prompt" },
    MATURE_VISUAL: { image: "DEGRADE", notes: "nudité partielle / gore selon policy fal" },
    RESTRICTED_BLOCKED_VISUAL: { image: "BLOCK" },
  },
  bfl: {
    GENERAL_SAFE: { image: "ALLOW" },
    TEEN: { image: "ALLOW" },
    MATURE_DRAMA: { image: "ALLOW" },
    MATURE_VISUAL: { image: "DEGRADE" },
    RESTRICTED_BLOCKED_VISUAL: { image: "BLOCK" },
  },
  runware: {
    GENERAL_SAFE: { image: "ALLOW" },
    TEEN: { image: "ALLOW" },
    MATURE_DRAMA: { image: "ALLOW", notes: "workflows custom — modération renforcée requise" },
    MATURE_VISUAL: { image: "ALLOW", notes: "dépend du modèle hébergé" },
    RESTRICTED_BLOCKED_VISUAL: { image: "BLOCK" },
  },
  stability: {
    GENERAL_SAFE: { image: "ALLOW" },
    TEEN: { image: "ALLOW" },
    MATURE_DRAMA: { image: "DEGRADE" },
    MATURE_VISUAL: { image: "DEGRADE", notes: "Stable Image Ultra — suivre doc Stability" },
    RESTRICTED_BLOCKED_VISUAL: { image: "BLOCK" },
  },
};

export function capabilityFor(
  provider: ImageProviderForModeration,
  layer: ContentIntensityLayer,
): { image: ModerationDecision; notes?: string } {
  const row = PROVIDER_IMAGE_CAPABILITIES[provider]?.[layer];
  if (!row) {
    return { image: layer === "RESTRICTED_BLOCKED_VISUAL" ? "BLOCK" : "ALLOW" };
  }
  return row;
}
