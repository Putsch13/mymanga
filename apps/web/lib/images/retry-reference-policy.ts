export type RetryMode = "environment" | "character" | "interaction" | "style" | "composition";

export type RetryReferencePolicy = "NONE" | "LIGHT" | "STRONG";

/**
 * Objectif de reroll hiérarchique.
 * Chaque type définit ce qui est préservé et ce qui est relâché.
 */
export type RerollGoal =
  | "environment_only"
  | "composition_only"
  | "expression_only"
  | "action_only"
  | "character_light"
  | "character_hard"
  | "style_only"
  | "full_reroll";

export interface RerollPolicyDecision {
  rerollGoal: RerollGoal;
  referencePolicy: RetryReferencePolicy;
  /** Contraintes qui DOIVENT être préservées */
  preservedConstraints: string[];
  /** Contraintes qui peuvent être relâchées */
  relaxedConstraints: string[];
  reason: string;
}

/** Mapper RetryMode → RerollGoal */
function retryModeToRerollGoal(
  retryMode: RetryMode | null,
  recommendedAction?: string | null,
): RerollGoal {
  // Si le drift detector a une recommandation, l'utiliser en priorité
  if (recommendedAction === "style_reroll") return "style_only";
  if (recommendedAction === "character_reroll") return "character_hard";
  if (recommendedAction === "full_reroll") return "full_reroll";

  switch (retryMode) {
    case "environment": return "environment_only";
    case "composition": return "composition_only";
    case "character": return "character_hard";
    case "style": return "style_only";
    case "interaction": return "expression_only";
    default: return "environment_only";
  }
}

/** Construire les contraintes préservées selon le goal */
function buildPreservedConstraints(goal: RerollGoal, hasLookProfile: boolean, hasFingerprint: boolean, hasAnchor: boolean): string[] {
  const constraints: string[] = [];

  switch (goal) {
    case "environment_only":
      if (hasLookProfile) constraints.push("chapter_look_profile");
      if (hasFingerprint) constraints.push("character_fingerprint");
      if (hasAnchor) constraints.push("scene_anchor");
      constraints.push("character_identity");
      break;
    case "composition_only":
      if (hasLookProfile) constraints.push("chapter_look_profile");
      if (hasFingerprint) constraints.push("character_fingerprint");
      if (hasAnchor) constraints.push("scene_anchor");
      break;
    case "expression_only":
      if (hasLookProfile) constraints.push("chapter_look_profile");
      if (hasFingerprint) constraints.push("character_fingerprint");
      constraints.push("outfit_continuity");
      break;
    case "action_only":
      if (hasLookProfile) constraints.push("chapter_look_profile");
      if (hasFingerprint) constraints.push("character_fingerprint");
      break;
    case "character_light":
      if (hasLookProfile) constraints.push("chapter_look_profile");
      if (hasAnchor) constraints.push("scene_anchor");
      constraints.push("hard_traits");
      break;
    case "character_hard":
      if (hasLookProfile) constraints.push("chapter_look_profile");
      constraints.push("hard_traits", "forbidden_drift");
      break;
    case "style_only":
      if (hasFingerprint) constraints.push("character_fingerprint");
      if (hasAnchor) constraints.push("scene_anchor");
      break;
    case "full_reroll":
      // Rien de préservé sauf le look profile minimum
      if (hasLookProfile) constraints.push("chapter_look_profile");
      break;
  }

  return constraints;
}

/** Construire les contraintes relâchées selon le goal */
function buildRelaxedConstraints(goal: RerollGoal): string[] {
  switch (goal) {
    case "environment_only": return ["background_elements", "props", "weather"];
    case "composition_only": return ["framing", "camera_angle", "spatial_layout"];
    case "expression_only": return ["facial_expression", "pose"];
    case "action_only": return ["action_pose", "motion_lines"];
    case "character_light": return ["soft_traits", "outfit_details"];
    case "character_hard": return ["background", "environment"];
    case "style_only": return ["style_family", "rendering_mode"];
    case "full_reroll": return ["everything_except_look_profile"];
  }
}

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
  /** Action recommandée par le drift detector */
  recommendedAction?: string | null;
  /** Présence d'un look profile */
  hasLookProfile?: boolean;
  /** Présence d'un fingerprint */
  hasFingerprint?: boolean;
  /** Présence d'un scene anchor */
  hasSceneAnchor?: boolean;
}) {
  const importantCharacterPresent = inferImportantCharacterPresence(input.metadata);
  const hasLookProfile = input.hasLookProfile ?? false;
  const hasFingerprint = input.hasFingerprint ?? false;
  const hasAnchor = input.hasSceneAnchor ?? false;

  const rerollGoal = retryModeToRerollGoal(input.retryMode, input.recommendedAction);
  const preservedConstraints = buildPreservedConstraints(rerollGoal, hasLookProfile, hasFingerprint, hasAnchor);
  const relaxedConstraints = buildRelaxedConstraints(rerollGoal);

  // Déterminer la politique de refs selon le goal
  let referencePolicy: RetryReferencePolicy;
  let reason: string;

  if (rerollGoal === "character_hard") {
    referencePolicy = "STRONG";
    reason = "character_hard_reroll_requires_strong_lock";
  } else if (rerollGoal === "character_light") {
    referencePolicy = importantCharacterPresent && input.hasReusableCharacterLock ? "LIGHT" : "NONE";
    reason = referencePolicy === "LIGHT" ? "character_light_with_lock" : "character_light_no_lock";
  } else if (rerollGoal === "style_only") {
    referencePolicy = hasFingerprint ? "LIGHT" : "NONE";
    reason = "style_reroll_preserve_character_if_possible";
  } else if (rerollGoal === "environment_only" || rerollGoal === "composition_only") {
    if (importantCharacterPresent && input.hasReusableCharacterLock) {
      referencePolicy = "LIGHT";
      reason = "preserve_light_lock_for_important_character";
    } else {
      referencePolicy = "NONE";
      reason = importantCharacterPresent
        ? "important_character_detected_but_no_reusable_lock"
        : "no_relevant_character_detected";
    }
  } else if (rerollGoal === "full_reroll") {
    referencePolicy = "NONE";
    reason = "full_reroll_no_constraints";
  } else {
    referencePolicy = "LIGHT";
    reason = "default_retry_policy";
  }

  return {
    referencePolicy,
    importantCharacterPresent,
    reason,
    rerollGoal,
    preservedConstraints,
    relaxedConstraints,
  };
}
