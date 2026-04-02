import { z } from "zod";

/**
 * Layers de contenu par ordre croissant d'intensité.
 *
 * GENERAL_SAFE       → tout public, aucune violence ni suggestion
 * TEEN               → action légère, drama, pas de contenu explicite
 * MATURE_DRAMA       → violence stylisée, horreur, thèmes sombres — pas de nudité
 * MATURE_VISUAL      → nudité artistique, gore stylisé, romance intense
 * ADULT_EXPLICIT     → contenu adulte explicite, nudité frontale, dark romance, soft porn
 * RESTRICTED_BLOCKED_VISUAL → TOUJOURS BLOQUÉ (mineurs, violence sexuelle, illégal)
 */
export const contentIntensitySchema = z.enum([
  "GENERAL_SAFE",
  "TEEN",
  "MATURE_DRAMA",
  "MATURE_VISUAL",
  "ADULT_EXPLICIT",
  "RESTRICTED_BLOCKED_VISUAL",
]);

export type ContentIntensityLayer = z.infer<typeof contentIntensitySchema>;

export const imageProviderSchema = z.enum(["fal", "bfl", "runware", "stability"]);

export type ImageProviderForModeration = z.infer<typeof imageProviderSchema>;

/** Layers qui nécessitent une vérification d'âge (ageVerifiedAt non null) */
export const AGE_GATED_LAYERS: ContentIntensityLayer[] = [
  "MATURE_VISUAL",
  "ADULT_EXPLICIT",
];

/** Layers toujours bloqués, quel que soit le provider */
export const ALWAYS_BLOCKED_LAYERS: ContentIntensityLayer[] = [
  "RESTRICTED_BLOCKED_VISUAL",
];

export function requiresAgeVerification(layer: ContentIntensityLayer): boolean {
  return AGE_GATED_LAYERS.includes(layer);
}

export function isAlwaysBlocked(layer: ContentIntensityLayer): boolean {
  return ALWAYS_BLOCKED_LAYERS.includes(layer);
}
