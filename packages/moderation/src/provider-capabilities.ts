import type { ContentIntensityLayer, ImageProviderForModeration } from "./content-intensity";

export type ModerationDecision = "ALLOW" | "DEGRADE" | "BLOCK";

export type CapabilityMatrix = Record<
  ImageProviderForModeration,
  Partial<Record<ContentIntensityLayer, { image: ModerationDecision; notes?: string }>>
>;

/**
 * Matrice provider × layer de contenu.
 *
 * FAL (flux/dev) :
 *   - MATURE_VISUAL = ALLOW avec enable_safety_checker: false
 *   - ADULT_EXPLICIT = ALLOW avec enable_safety_checker: false
 *   - RESTRICTED_BLOCKED_VISUAL = BLOCK toujours (géré côté app avant l'appel)
 *
 * La modération est gérée côté application (age-gate, consentement utilisateur)
 * AVANT l'appel au provider. Le provider n'est jamais appelé pour RESTRICTED_BLOCKED_VISUAL.
 */
export const PROVIDER_IMAGE_CAPABILITIES: CapabilityMatrix = {
  fal: {
    GENERAL_SAFE: { image: "ALLOW" },
    TEEN: { image: "ALLOW" },
    MATURE_DRAMA: { image: "ALLOW", notes: "violence/horreur stylisée, safety_checker actif" },
    MATURE_VISUAL: {
      image: "ALLOW",
      notes: "nudité artistique, gore stylisé — enable_safety_checker: false requis",
    },
    ADULT_EXPLICIT: {
      image: "ALLOW",
      notes: "contenu adulte explicite — enable_safety_checker: false, age-gate obligatoire",
    },
    RESTRICTED_BLOCKED_VISUAL: {
      image: "BLOCK",
      notes: "TOUJOURS BLOQUÉ — mineurs, violence sexuelle, contenu illégal",
    },
  },
  bfl: {
    GENERAL_SAFE: { image: "ALLOW" },
    TEEN: { image: "ALLOW" },
    MATURE_DRAMA: { image: "ALLOW" },
    MATURE_VISUAL: { image: "DEGRADE", notes: "nudité partielle selon policy BFL" },
    ADULT_EXPLICIT: { image: "BLOCK", notes: "BFL ne supporte pas le contenu adulte explicite" },
    RESTRICTED_BLOCKED_VISUAL: { image: "BLOCK" },
  },
  runware: {
    GENERAL_SAFE: { image: "ALLOW" },
    TEEN: { image: "ALLOW" },
    MATURE_DRAMA: { image: "ALLOW", notes: "workflows custom — modération renforcée requise" },
    MATURE_VISUAL: { image: "ALLOW", notes: "dépend du modèle hébergé" },
    ADULT_EXPLICIT: { image: "ALLOW", notes: "modèles NSFW disponibles sur Runware" },
    RESTRICTED_BLOCKED_VISUAL: { image: "BLOCK" },
  },
  stability: {
    GENERAL_SAFE: { image: "ALLOW" },
    TEEN: { image: "ALLOW" },
    MATURE_DRAMA: { image: "DEGRADE" },
    MATURE_VISUAL: { image: "DEGRADE", notes: "Stable Image Ultra — suivre doc Stability" },
    ADULT_EXPLICIT: { image: "BLOCK", notes: "Stability AI bloque le contenu adulte explicite" },
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

/**
 * Retourne le meilleur provider disponible pour un layer donné.
 * Priorité : fal > runware > bfl > stability
 */
export function getBestProviderForLayer(
  layer: ContentIntensityLayer,
): ImageProviderForModeration | null {
  const priority: ImageProviderForModeration[] = ["fal", "runware", "bfl", "stability"];
  for (const provider of priority) {
    const cap = capabilityFor(provider, layer);
    if (cap.image === "ALLOW") return provider;
  }
  return null;
}
