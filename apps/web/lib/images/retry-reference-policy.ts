type RetryMode = "environment" | "character" | "interaction" | "style" | "composition";

type RetryReferencePolicy = "NONE" | "LIGHT" | "STRONG";

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0) : [];
}

function roleSuggestsImportantCharacter(role: string) {
  return /hero|protagon|main|lead|support|ally|mentor|antagon|villain|speaker|important/i.test(role);
}

function tierSuggestsImportantCharacter(tier: string) {
  return /MAIN_HERO|SECONDARY_CORE|IMPORTANT_SUPPORTING_CHARACTER|RECURRING_NPC/i.test(tier);
}

export function inferImportantCharacterPresence(metadata: Record<string, unknown>) {
  const roles = readStringArray(metadata.panelCharacterRoles ?? metadata.characterRoles);
  const visibleCharacters = readStringArray(metadata.visibleCharacters);
  const characterIds = readStringArray(metadata.characterIds);
  const tiers = readStringArray(metadata.panelCharacterImportanceTiers);
  const entityRefs = Array.isArray(metadata.entityRefs) ? metadata.entityRefs : [];

  return Boolean(
    typeof metadata.heroCharacterId === "string"
    || roles.some(roleSuggestsImportantCharacter)
    || tiers.some(tierSuggestsImportantCharacter)
    || visibleCharacters.length > 0
    || characterIds.length > 0
    || entityRefs.some((entry) => {
      if (!entry || typeof entry !== "object") return false;
      const ref = entry as Record<string, unknown>;
      return typeof ref.characterId === "string" || typeof ref.characterName === "string";
    }),
  );
}

export function resolveRetryReferencePolicy(input: {
  retryMode: RetryMode | null;
  metadata: Record<string, unknown>;
  hasReusableCharacterLock: boolean;
}) {
  const importantCharacterPresent = inferImportantCharacterPresence(input.metadata);

  if (input.retryMode === "character") {
    return {
      referencePolicy: "STRONG" as RetryReferencePolicy,
      importantCharacterPresent,
      reason: "character_reroll_requires_strong_lock",
    };
  }

  if (input.retryMode === "environment" || input.retryMode === "composition") {
    if (importantCharacterPresent && input.hasReusableCharacterLock) {
      return {
        referencePolicy: "LIGHT" as RetryReferencePolicy,
        importantCharacterPresent,
        reason: "preserve_light_lock_for_important_character",
      };
    }
    return {
      referencePolicy: "NONE" as RetryReferencePolicy,
      importantCharacterPresent,
      reason: importantCharacterPresent
        ? "important_character_detected_but_no_reusable_lock"
        : "no_relevant_character_detected",
    };
  }

  return {
    referencePolicy: "LIGHT" as RetryReferencePolicy,
    importantCharacterPresent,
    reason: "default_retry_policy",
  };
}
