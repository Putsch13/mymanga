import type { ContentIntensityLayer } from "@manga-ai-studio/moderation";
import { requiresAgeVerification } from "@manga-ai-studio/moderation";
import type { ContentRating, User, UserPreferences } from "@manga-ai-studio/db";

const TEST_ADULT_BYPASS_EMAILS = ["test@gmail.com"];

export function canBypassMatureContent(email: string | null | undefined) {
  if (!email) return false;
  return TEST_ADULT_BYPASS_EMAILS.includes(email.toLowerCase());
}

export function projectRequiresAgeGate(contentRating: ContentRating, intensityLayer?: ContentIntensityLayer | string | null) {
  const ratingRequiresGate = contentRating === "MATURE" || contentRating === "ADULT_RESTRICTED";
  const layerRequiresGate =
    typeof intensityLayer === "string"
      ? requiresAgeVerification(intensityLayer as ContentIntensityLayer)
      : false;
  return ratingRequiresGate || layerRequiresGate;
}

export function canAccessMatureContent(
  user: Pick<User, "ageVerifiedAt" | "email">,
  preferences: Pick<UserPreferences, "matureContentEnabled"> | null | undefined,
) {
  if (canBypassMatureContent(user.email)) return true;
  return Boolean(user.ageVerifiedAt && preferences?.matureContentEnabled);
}

export function getAgeGateMessage(contentRating: ContentRating) {
  if (contentRating === "ADULT_RESTRICTED") {
    return "Ce contenu nécessite une vérification d'âge adulte et l'activation du contenu mature.";
  }
  return "Active le contenu mature et confirme ton âge pour continuer.";
}
