import { z } from "zod";

export const contentIntensitySchema = z.enum([
  "GENERAL_SAFE",
  "TEEN",
  "MATURE_DRAMA",
  "MATURE_VISUAL",
  "RESTRICTED_BLOCKED_VISUAL",
]);

export type ContentIntensityLayer = z.infer<typeof contentIntensitySchema>;

export const imageProviderSchema = z.enum(["fal", "bfl", "runware", "stability"]);

export type ImageProviderForModeration = z.infer<typeof imageProviderSchema>;
