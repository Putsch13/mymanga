export interface PreflightPanelValidationInput {
  panelId: string;
  positivePrompt: string;
  negativePrompt?: string;
  shotType?: string | null;
  purpose?: string | null;
  mustShow?: string[];
  backgroundExtras?: string[];
  hasSceneKeyframe: boolean;
  hasCharacterLock: boolean;
  characterCount: number;
  /** P0.2 — Inputs de routing pour détecter les contradictions de cadrage */
  panelCategory?: "CHARACTER_LOCK" | "CHARACTER_IN_SCENE" | "ESTABLISHING_ENVIRONMENT" | "LOCAL_FIX" | null;
  subjectFocus?: string | null;
  cutawayType?: string | null;
}

export interface PreflightPanelValidationResult {
  ok: boolean;
  reasons: string[];
  warnings: string[];
}

// ────────────────────────────────────────────────────────────────────────────
// P0.2 — Tokens de cadrage contradictoires
// ────────────────────────────────────────────────────────────────────────────

/**
 * Tokens qui ne doivent JAMAIS apparaître ensemble avec un panel environment.
 * Si panelCategory=ESTABLISHING_ENVIRONMENT ou subjectFocus=environment/aftermath,
 * ces tokens cassent le rendu car Flux les interprète comme "rends le héros".
 */
const FORBIDDEN_ON_ENVIRONMENT = [
  /close-up portrait/i,
  /face filling frame/i,
  /hero panel/i,
  /manga hero panel/i,
  /tight framing/i,
  /hero medium shot/i,
  /character portrait/i,
  /extreme close-up hero/i,
  /hero showcase/i,
  /protagonist centered/i,
  /main character foreground/i,
];

/**
 * Tokens qui ne doivent JAMAIS apparaître sur un cutaway prop.
 */
const FORBIDDEN_ON_PROP_CUTAWAY = [
  /hero portrait/i,
  /hero medium shot/i,
  /character portrait/i,
  /close-up portrait/i,
  /face filling frame/i,
  /hero panel/i,
  /manga hero panel/i,
  /main cast foreground/i,
  /protagonist centered/i,
];

/**
 * Tokens qui ne doivent JAMAIS apparaître sur un cutaway crowd/npc_group.
 */
const FORBIDDEN_ON_CROWD_CUTAWAY = [
  /portrait framing/i,
  /single-character hero framing/i,
  /hero portrait/i,
  /close-up portrait.*hero/i,
  /protagonist centered/i,
  /hero panel/i,
  /hero showcase/i,
];

/**
 * Tokens qui ne doivent JAMAIS apparaître sur un cutaway reaction non-héros.
 */
const FORBIDDEN_ON_REACTION_CUTAWAY = [
  /hero showcase/i,
  /grand hero panel/i,
  /protagonist centered/i,
  /hero lock/i,
  /main hero foreground/i,
];

function detectFramingContradictions(
  prompt: string,
  panelCategory: string | null | undefined,
  subjectFocus: string | null | undefined,
  cutawayType: string | null | undefined,
): string[] {
  const contradictions: string[] = [];

  const isEnvironmentPanel =
    panelCategory === "ESTABLISHING_ENVIRONMENT"
    || subjectFocus === "environment"
    || subjectFocus === "aftermath"
    || cutawayType === "environment"
    || cutawayType === "environment_establishing"
    || cutawayType === "location_transition"
    || cutawayType === "aftermath";

  const isPropCutaway =
    subjectFocus === "prop"
    || cutawayType === "prop_insert"
    || cutawayType === "object_insert";

  const isCrowdCutaway =
    cutawayType === "crowd"
    || cutawayType === "npc_group"
    || subjectFocus === "group";

  const isReactionCutaway =
    subjectFocus === "reaction"
    || cutawayType === "reaction"
    || cutawayType === "reaction_insert";

  if (isEnvironmentPanel) {
    for (const pattern of FORBIDDEN_ON_ENVIRONMENT) {
      if (pattern.test(prompt)) {
        contradictions.push(`framing_contradiction:environment+${pattern.source}`);
      }
    }
  }

  if (isPropCutaway) {
    for (const pattern of FORBIDDEN_ON_PROP_CUTAWAY) {
      if (pattern.test(prompt)) {
        contradictions.push(`framing_contradiction:prop+${pattern.source}`);
      }
    }
  }

  if (isCrowdCutaway) {
    for (const pattern of FORBIDDEN_ON_CROWD_CUTAWAY) {
      if (pattern.test(prompt)) {
        contradictions.push(`framing_contradiction:crowd+${pattern.source}`);
      }
    }
  }

  if (isReactionCutaway) {
    for (const pattern of FORBIDDEN_ON_REACTION_CUTAWAY) {
      if (pattern.test(prompt)) {
        contradictions.push(`framing_contradiction:reaction+${pattern.source}`);
      }
    }
  }

  return contradictions;
}

export function validatePreflightPanel(input: PreflightPanelValidationInput): PreflightPanelValidationResult {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const promptLength = input.positivePrompt.length;
  const wideOrNarrative = input.shotType === "wide" || input.purpose === "establishing" || input.characterCount >= 2;

  if (promptLength > 1800) {
    warnings.push("prompt_too_long");
  }
  // Keyframe manquant = warning (pas bloquant) : beaucoup de scènes sont rendues sans keyframe
  // (génération Fal échouée ou pipeline en cours) et un bloquant ici casserait toute la génération.
  // Le vrai critère critique reste la présence de signaux d'environnement (mustShow / backgroundExtras).
  if (wideOrNarrative && !input.hasSceneKeyframe) {
    warnings.push("missing_scene_keyframe");
  }
  if (wideOrNarrative && (input.mustShow?.length ?? 0) === 0 && (input.backgroundExtras?.length ?? 0) === 0) {
    reasons.push("missing_environment_signals");
  }
  if (!wideOrNarrative && input.characterCount > 0 && !input.hasCharacterLock) {
    warnings.push("character_lock_not_available");
  }
  if (!input.positivePrompt.trim()) {
    reasons.push("empty_positive_prompt");
  }

  // P0.2 — Détecter les contradictions de cadrage
  const framingContradictions = detectFramingContradictions(
    input.positivePrompt,
    input.panelCategory,
    input.subjectFocus,
    input.cutawayType,
  );
  for (const contradiction of framingContradictions) {
    warnings.push(contradiction);
  }

  return {
    ok: reasons.length === 0,
    reasons,
    warnings,
  };
}
