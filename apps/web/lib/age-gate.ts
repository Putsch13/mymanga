import type { ContentRating, User, UserPreferences } from "@manga-ai-studio/db";

export function projectRequiresAgeGate(contentRating: ContentRating) {
  return contentRating === "MATURE" || contentRating === "ADULT_RESTRICTED";
}

export function canAccessMatureContent(
  user: Pick<User, "ageVerifiedAt">,
  preferences: Pick<UserPreferences, "matureContentEnabled"> | null | undefined,
) {
  return Boolean(user.ageVerifiedAt && preferences?.matureContentEnabled);
}

export function getAgeGateMessage(contentRating: ContentRating) {
  if (contentRating === "ADULT_RESTRICTED") {
    return "Ce contenu nécessite une vérification d'âge adulte et l'activation du contenu mature.";
  }
  return "Active le contenu mature et confirme ton âge pour continuer.";
}
