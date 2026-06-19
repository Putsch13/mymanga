export type RetryMode =
  | "environment"
  | "character"
  | "interaction"
  | "style"
  | "composition"
  // Premium specialized reroll modes
  | "prop"
  | "speaker"
  | "enemy_presence"
  | "subject_focus"
  | "cutaway"
  | "npc_population";

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
  | "full_reroll"
  // Premium specialized reroll goals
  | "prop_repair"
  | "speaker_anchor_repair"
  | "enemy_focus_repair"
  | "subject_focus_repair"
  | "cutaway_repair"
  | "population_repair";

export interface RerollPolicyDecision {
  rerollGoal: RerollGoal;
  referencePolicy: RetryReferencePolicy;
  /** Contraintes qui DOIVENT être préservées */
  preservedConstraints: string[];
  /** Contraintes qui peuvent être relâchées */
  relaxedConstraints: string[];
  reason: string;
  /** Prompt positif spécialisé pour ce reroll */
  positivePromptHint?: string;
  /** Prompt négatif spécialisé pour ce reroll */
  negativePromptHint?: string;
  /** Kind de reroll pour traçabilité et metadata */
  rerollKind?: string;
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
    // Premium modes
    case "prop": return "prop_repair";
    case "speaker": return "speaker_anchor_repair";
    case "enemy_presence": return "enemy_focus_repair";
    case "subject_focus": return "subject_focus_repair";
    case "cutaway": return "cutaway_repair";
    case "npc_population": return "population_repair";
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
      if (hasLookProfile) constraints.push("chapter_look_profile");
      break;
    // Premium goals — préserver le maximum sauf ce qui est réparé
    case "prop_repair":
      if (hasLookProfile) constraints.push("chapter_look_profile");
      if (hasFingerprint) constraints.push("character_fingerprint");
      if (hasAnchor) constraints.push("scene_anchor");
      constraints.push("character_identity", "outfit_continuity", "environment_context");
      break;
    case "speaker_anchor_repair":
      if (hasLookProfile) constraints.push("chapter_look_profile");
      if (hasFingerprint) constraints.push("character_fingerprint");
      if (hasAnchor) constraints.push("scene_anchor");
      constraints.push("character_identity", "environment_context");
      break;
    case "enemy_focus_repair":
      if (hasLookProfile) constraints.push("chapter_look_profile");
      if (hasAnchor) constraints.push("scene_anchor");
      constraints.push("environment_context");
      break;
    case "subject_focus_repair":
      if (hasLookProfile) constraints.push("chapter_look_profile");
      if (hasAnchor) constraints.push("scene_anchor");
      constraints.push("environment_context");
      break;
    case "cutaway_repair":
      if (hasLookProfile) constraints.push("chapter_look_profile");
      if (hasAnchor) constraints.push("scene_anchor");
      constraints.push("environment_context");
      break;
    case "population_repair":
      if (hasLookProfile) constraints.push("chapter_look_profile");
      if (hasFingerprint) constraints.push("character_fingerprint");
      if (hasAnchor) constraints.push("scene_anchor");
      constraints.push("character_identity", "environment_context");
      break;
  }

  return constraints;
}

/** Construire les contraintes relâchées selon le goal */
function buildRelaxedConstraints(goal: RerollGoal, hasMandatoryProps: boolean): string[] {
  switch (goal) {
    case "environment_only": return ["background_elements", "weather"];
    case "composition_only": return ["framing", "camera_angle", "spatial_layout"];
    case "expression_only": return ["facial_expression", "pose"];
    case "action_only": return ["action_pose", "motion_lines"];
    case "character_light": return ["soft_traits", "outfit_details"];
    case "character_hard": return ["background", "environment"];
    case "style_only": return ["style_family", "rendering_mode"];
    case "full_reroll": return ["everything_except_look_profile"];
    // Premium: ne JAMAIS relâcher les props si obligatoires
    case "prop_repair":
      // Les props obligatoires ne peuvent jamais être relâchés dans ce mode
      return ["framing", "camera_angle"];
    case "speaker_anchor_repair":
      return hasMandatoryProps ? ["framing", "camera_angle"] : ["framing", "camera_angle", "background_elements"];
    case "enemy_focus_repair":
      return hasMandatoryProps ? ["framing"] : ["framing", "background_elements"];
    case "subject_focus_repair":
      return hasMandatoryProps ? ["framing"] : ["framing", "camera_angle"];
    case "cutaway_repair":
      return hasMandatoryProps ? ["character_pose"] : ["character_pose", "character_expression"];
    case "population_repair":
      return hasMandatoryProps ? ["framing", "camera_angle"] : ["framing", "camera_angle", "character_expression"];
  }
}

/** Prompts spécialisés par mode de reroll */
function buildSpecializedPromptHints(goal: RerollGoal): { positive?: string; negative?: string } {
  switch (goal) {
    case "prop_repair":
      return {
        positive: "required prop clearly visible, object legible and foreground, correct object usage, object integrated in action, prop readable",
        negative: "missing object, generic clutter replacing object, unreadable prop, prop absent, object hidden",
      };
    case "speaker_anchor_repair":
      return {
        positive: "speaker visible, face readable, dialogue carrier clearly framed, character expression clear, speaker in frame",
        negative: "speaker offscreen, wrong character emphasis, anonymous talking head, speaker hidden, face obscured",
      };
    case "enemy_focus_repair":
      return {
        positive: "enemy clearly present, threatening silhouette, adversary readable, villain in frame, antagonist visible",
        negative: "enemy absent, hero-centered replacement, adversary missing, villain offscreen",
      };
    case "subject_focus_repair":
      return {
        positive: "correct subject as primary focus, subject readable and dominant in composition",
        negative: "wrong subject dominant, hero portrait replacing intended subject, subject collapsed",
      };
    case "cutaway_repair":
      return {
        positive: "environment cutaway, no hero-centric composition, location readable, scene context visible, cutaway shot",
        negative: "hero portrait, floating character, no environment signal, character-only composition, hero face dominant",
      };
    case "population_repair":
      return {
        positive: "crowd visible, NPC presence, people in background, populated scene, ambient characters, bystanders visible",
        negative: "empty background, no crowd, isolated characters, depopulated scene, missing NPC presence",
      };
    default:
      return {};
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
  /** Le panel a des props obligatoires — ne jamais les relâcher */
  hasMandatoryProps?: boolean;
  /**
   * P0.3 — Refs scene-level disponibles (keyframes, décor, style refs).
   * Pour les rerolls environment/composition, on ne veut JAMAIS partir en NONE
   * si des refs scène sont disponibles.
   */
  hasSceneReferences?: boolean;
  /**
   * P0.3 — Refs style disponibles (LoRAs, style refs).
   * Pour préserver la continuité visuelle.
   */
  hasStyleReferences?: boolean;
}) {
  const importantCharacterPresent = inferImportantCharacterPresence(input.metadata);
  const hasLookProfile = input.hasLookProfile ?? false;
  const hasFingerprint = input.hasFingerprint ?? false;
  const hasAnchor = input.hasSceneAnchor ?? false;
  const hasMandatoryProps = input.hasMandatoryProps ?? false;
  // P0.3 — Nouvelles variables pour les refs non-personnage
  const hasSceneRefs = input.hasSceneReferences ?? false;
  const hasStyleRefs = input.hasStyleReferences ?? false;

  const rerollGoal = retryModeToRerollGoal(input.retryMode, input.recommendedAction);
  const preservedConstraints = buildPreservedConstraints(rerollGoal, hasLookProfile, hasFingerprint, hasAnchor);
  const relaxedConstraints = buildRelaxedConstraints(rerollGoal, hasMandatoryProps);

  // Règle critique : si des props sont obligatoires, "props" ne peut jamais apparaître dans relaxedConstraints
  const safeRelaxedConstraints = hasMandatoryProps
    ? relaxedConstraints.filter((c) => c !== "props" && c !== "required_props")
    : relaxedConstraints;

  const { positive: positivePromptHint, negative: negativePromptHint } = buildSpecializedPromptHints(rerollGoal);

  // Déterminer la politique de refs selon le goal
  let referencePolicy: RetryReferencePolicy;
  let reason: string;

  // P0.3 — Matrice de reroll : chaque type de reroll indique si on peut partir en NONE.
  // Pour les rerolls "environment" et "composition", on NE DOIT JAMAIS partir en NONE
  // si des refs sont disponibles (scene refs, style refs, ou character refs).
  // La logique précédente ne regardait que les character refs, ce qui faisait perdre
  // les refs décor/scène sur les rerolls composition/environment.

  if (rerollGoal === "character_hard") {
    referencePolicy = "STRONG";
    reason = "character_hard_reroll_requires_strong_lock";
  } else if (rerollGoal === "character_light") {
    referencePolicy = importantCharacterPresent && input.hasReusableCharacterLock ? "LIGHT" : "NONE";
    reason = referencePolicy === "LIGHT" ? "character_light_with_lock" : "character_light_no_lock";
  } else if (rerollGoal === "style_only") {
    // P0.3 — Style reroll : conserver tout ce qu'on peut (scene + character + style refs)
    const anyRefsAvailable = hasFingerprint || hasSceneRefs || hasStyleRefs || hasAnchor;
    referencePolicy = anyRefsAvailable ? "LIGHT" : "NONE";
    reason = anyRefsAvailable ? "style_reroll_preserve_available_refs" : "style_reroll_no_refs";
  } else if (rerollGoal === "environment_only") {
    // P0.3 — Environment reroll : JAMAIS NONE si des refs scène sont disponibles.
    // On veut préserver : scene keyframes, style refs, décor refs, ET character refs si présents.
    const anyRefsAvailable = hasSceneRefs || hasStyleRefs || hasAnchor || input.hasReusableCharacterLock;
    if (anyRefsAvailable) {
      referencePolicy = "LIGHT";
      reason = "environment_reroll_preserve_scene_and_style_refs";
    } else if (importantCharacterPresent && input.hasReusableCharacterLock) {
      referencePolicy = "LIGHT";
      reason = "preserve_light_lock_for_important_character";
    } else {
      referencePolicy = "NONE";
      reason = "environment_reroll_no_refs_available";
    }
  } else if (rerollGoal === "composition_only") {
    // P0.3 — Composition reroll : JAMAIS NONE si des refs sont disponibles.
    // Réparer la composition sans perdre la mémoire du panel.
    const anyRefsAvailable = hasSceneRefs || hasStyleRefs || hasAnchor || input.hasReusableCharacterLock || hasFingerprint;
    if (anyRefsAvailable) {
      referencePolicy = "LIGHT";
      reason = "composition_reroll_preserve_available_refs";
    } else {
      referencePolicy = "NONE";
      reason = "composition_reroll_no_refs_available";
    }
  } else if (rerollGoal === "full_reroll") {
    // P0.3 — Full reroll : on relaxe tout SAUF si des refs sont disponibles
    // Dans ce cas, on garde au moins LIGHT pour ne pas perdre toute mémoire.
    const anyRefsAvailable = hasSceneRefs || hasStyleRefs || hasAnchor;
    referencePolicy = anyRefsAvailable ? "LIGHT" : "NONE";
    reason = anyRefsAvailable ? "full_reroll_preserve_minimal_refs" : "full_reroll_no_constraints";
  } else if (rerollGoal === "prop_repair") {
    // Préserver personnage + style, réparer seulement le prop
    const anyRefsAvailable = hasFingerprint || hasSceneRefs || hasStyleRefs;
    referencePolicy = anyRefsAvailable ? "LIGHT" : "NONE";
    reason = "prop_repair_preserve_character_and_style";
  } else if (rerollGoal === "speaker_anchor_repair") {
    const anyRefsAvailable = hasFingerprint || hasSceneRefs || hasStyleRefs;
    referencePolicy = anyRefsAvailable ? "LIGHT" : "NONE";
    reason = "speaker_repair_preserve_character_identity";
  } else if (rerollGoal === "enemy_focus_repair") {
    // P0.3 — Enemy focus repair : conserver les refs scène pour le décor
    referencePolicy = (hasSceneRefs || hasAnchor) ? "LIGHT" : "NONE";
    reason = hasSceneRefs ? "enemy_focus_repair_preserve_scene_refs" : "enemy_focus_repair_shift_composition";
  } else if (rerollGoal === "subject_focus_repair") {
    // P0.3 — Subject focus repair : conserver les refs scène
    referencePolicy = (hasSceneRefs || hasAnchor) ? "LIGHT" : "NONE";
    reason = hasSceneRefs ? "subject_focus_repair_preserve_scene_refs" : "subject_focus_repair_shift_composition";
  } else if (rerollGoal === "cutaway_repair") {
    // P0.3 — Cutaway repair : toujours préserver les refs scène/décor
    const anyRefsAvailable = hasAnchor || hasSceneRefs || hasStyleRefs;
    referencePolicy = anyRefsAvailable ? "LIGHT" : "NONE";
    reason = anyRefsAvailable ? "cutaway_repair_preserve_scene_anchor" : "cutaway_repair_no_refs";
  } else if (rerollGoal === "population_repair") {
    const anyRefsAvailable = hasFingerprint || hasSceneRefs || hasStyleRefs;
    referencePolicy = anyRefsAvailable ? "LIGHT" : "NONE";
    reason = "population_repair_preserve_character_add_crowd";
  } else {
    referencePolicy = "LIGHT";
    reason = "default_retry_policy";
  }

  // Déterminer le rerollKind pour traçabilité
  const rerollKindMap: Partial<Record<RerollGoal, string>> = {
    prop_repair: "REROLL_PROP",
    speaker_anchor_repair: "REROLL_SPEAKER_ANCHOR",
    enemy_focus_repair: "REROLL_ENEMY_PRESENCE",
    subject_focus_repair: "REROLL_SUBJECT_FOCUS",
    cutaway_repair: "REROLL_CUTAWAY",
    population_repair: "REROLL_NPC_POPULATION",
    character_hard: "REROLL_CHARACTER_HARD",
    character_light: "REROLL_CHARACTER_LIGHT",
    style_only: "REROLL_STYLE",
    environment_only: "REROLL_ENVIRONMENT",
    composition_only: "REROLL_COMPOSITION",
    full_reroll: "REROLL_FULL",
  };
  const rerollKind = rerollKindMap[rerollGoal] ?? "REROLL_GENERIC";

  return {
    referencePolicy,
    importantCharacterPresent,
    reason,
    rerollGoal,
    preservedConstraints,
    relaxedConstraints: safeRelaxedConstraints,
    positivePromptHint,
    negativePromptHint,
    rerollKind,
  };
}
