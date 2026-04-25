/**
 * P4.18 — Error codes stables pour le pipeline premium.
 *
 * Chaque erreur du pipeline a un code unique et stable qui permet :
 *   - Un diagnostic rapide sans parser les messages
 *   - Des dashboards / alertes sur des codes spécifiques
 *   - Une documentation centralisée des erreurs
 *
 * Convention de nommage :
 *   E_{DOMAIN}_{PROBLEM}
 *
 * Domaines :
 *   CAST       — contrat de cast (héros/personnages)
 *   RENDER     — preflight et génération d'images
 *   PROMPT     — construction des prompts
 *   VISUAL     — couverture visuelle et références
 *   DIALOGUE   — dialogues et ancrage
 *   STORY      — contrat narratif et beats
 *   ENTITY     — entités visuelles (personnages, groupes, lieux)
 */

export const PIPELINE_ERROR_CODES = {
  // ═══════════════════════════════════════════════════════════════════════════
  // CAST — Contrat de cast
  // ═══════════════════════════════════════════════════════════════════════════
  E_CAST_HERO_MISSING: "E_CAST_HERO_MISSING",
  E_CAST_HERO_NOT_IN_ACTIVE: "E_CAST_HERO_NOT_IN_ACTIVE",
  E_CAST_ACTIVE_EMPTY: "E_CAST_ACTIVE_EMPTY",
  E_CAST_SUPPORT_NOT_IN_ACTIVE: "E_CAST_SUPPORT_NOT_IN_ACTIVE",
  E_CAST_DUPLICATE_HERO: "E_CAST_DUPLICATE_HERO",
  E_CAST_MEMBER_NOT_IN_ACTIVE: "E_CAST_MEMBER_NOT_IN_ACTIVE",

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER — Preflight et génération
  // ═══════════════════════════════════════════════════════════════════════════
  E_RENDER_SPEC_BUILD_FAILED: "E_RENDER_SPEC_BUILD_FAILED",
  E_RENDER_SPEC_INVALID: "E_RENDER_SPEC_INVALID",
  E_RENDER_SPEC_MISSING_PANEL_PURPOSE: "E_RENDER_SPEC_MISSING_PANEL_PURPOSE",
  E_RENDER_SPEC_MISSING_RENDER_MODE: "E_RENDER_SPEC_MISSING_RENDER_MODE",
  E_RENDER_SPEC_MISSING_SHOT_TYPE: "E_RENDER_SPEC_MISSING_SHOT_TYPE",
  E_RENDER_SPEC_MISSING_SUBJECT_FOCUS: "E_RENDER_SPEC_MISSING_SUBJECT_FOCUS",
  E_RENDER_SPEC_CONTRADICTION: "E_RENDER_SPEC_CONTRADICTION",
  E_RENDER_DIALOGUE_TWO_SHOT_NEEDS_TWO_CHARACTERS: "E_RENDER_DIALOGUE_TWO_SHOT_NEEDS_TWO_CHARACTERS",
  E_RENDER_CHARACTER_MODE_NEEDS_CHARACTER: "E_RENDER_CHARACTER_MODE_NEEDS_CHARACTER",
  E_RENDER_MISSING_CHARACTER_REFS: "E_RENDER_MISSING_CHARACTER_REFS",
  E_RENDER_MISSING_FACE_CLOSEUP_REF: "E_RENDER_MISSING_FACE_CLOSEUP_REF",
  E_RENDER_UNKNOWN_RENDER_MODE: "E_RENDER_UNKNOWN_RENDER_MODE",
  E_RENDER_HERO_WITHOUT_REFS: "E_RENDER_HERO_WITHOUT_REFS",
  E_RENDER_STRONG_POLICY_WITHOUT_REFS: "E_RENDER_STRONG_POLICY_WITHOUT_REFS",
  E_RENDER_QUEUE_INCOMPLETE: "E_RENDER_QUEUE_INCOMPLETE",
  E_RENDER_FAL_FAILED: "E_RENDER_FAL_FAILED",

  // ═══════════════════════════════════════════════════════════════════════════
  // PROMPT — Construction des prompts
  // ═══════════════════════════════════════════════════════════════════════════
  E_PROMPT_CONTRADICTORY_TOKENS: "E_PROMPT_CONTRADICTORY_TOKENS",
  E_PROMPT_NEGATION_IN_POSITIVE: "E_PROMPT_NEGATION_IN_POSITIVE",
  E_PROMPT_HARD_LOCK_WITHOUT_REFS: "E_PROMPT_HARD_LOCK_WITHOUT_REFS",
  E_PROMPT_TOO_SHORT: "E_PROMPT_TOO_SHORT",
  E_PROMPT_TOO_LONG: "E_PROMPT_TOO_LONG",

  // ═══════════════════════════════════════════════════════════════════════════
  // VISUAL — Couverture visuelle et références
  // ═══════════════════════════════════════════════════════════════════════════
  E_VISUAL_CHARACTER_NOT_COVERED: "E_VISUAL_CHARACTER_NOT_COVERED",
  E_VISUAL_LOCATION_NOT_COVERED: "E_VISUAL_LOCATION_NOT_COVERED",
  E_VISUAL_PROP_NOT_COVERED: "E_VISUAL_PROP_NOT_COVERED",
  E_VISUAL_NPC_GROUP_NOT_COVERED: "E_VISUAL_NPC_GROUP_NOT_COVERED",
  E_VISUAL_PHANTOM_PROP_DETECTED: "E_VISUAL_PHANTOM_PROP_DETECTED",
  E_VISUAL_MEMORY_EMPTY: "E_VISUAL_MEMORY_EMPTY",
  E_VISUAL_ENV_ANCHOR_MISSING: "E_VISUAL_ENV_ANCHOR_MISSING",

  // ═══════════════════════════════════════════════════════════════════════════
  // DIALOGUE — Dialogues et ancrage
  // ═══════════════════════════════════════════════════════════════════════════
  E_DIALOGUE_FLOATING_LINE: "E_DIALOGUE_FLOATING_LINE",
  E_DIALOGUE_MISSING_SPEAKER: "E_DIALOGUE_MISSING_SPEAKER",
  E_DIALOGUE_SPEAKER_NOT_IN_PANEL: "E_DIALOGUE_SPEAKER_NOT_IN_PANEL",
  E_DIALOGUE_SPEAKER_NOT_ANCHORED: "E_DIALOGUE_SPEAKER_NOT_ANCHORED",
  E_DIALOGUE_ENRICHMENT_DISABLED: "E_DIALOGUE_ENRICHMENT_DISABLED",
  E_DIALOGUE_NO_BEATS_TOUCHED: "E_DIALOGUE_NO_BEATS_TOUCHED",

  // ═══════════════════════════════════════════════════════════════════════════
  // STORY — Contrat narratif et beats
  // ═══════════════════════════════════════════════════════════════════════════
  E_STORY_BEAT_NOT_COVERED: "E_STORY_BEAT_NOT_COVERED",
  E_STORY_CHARACTER_MISSING_FROM_BEAT: "E_STORY_CHARACTER_MISSING_FROM_BEAT",
  E_STORY_LOCATION_MISSING_FROM_BEAT: "E_STORY_LOCATION_MISSING_FROM_BEAT",
  E_STORY_EMOTIONAL_ARC_BROKEN: "E_STORY_EMOTIONAL_ARC_BROKEN",
  E_STORY_INTERACTION_MISSING: "E_STORY_INTERACTION_MISSING",

  // ═══════════════════════════════════════════════════════════════════════════
  // ENTITY — Entités visuelles
  // ═══════════════════════════════════════════════════════════════════════════
  E_ENTITY_UNKNOWN_KIND: "E_ENTITY_UNKNOWN_KIND",
  E_ENTITY_ROLE_AMBIGUOUS: "E_ENTITY_ROLE_AMBIGUOUS",
  E_ENTITY_NPC_GROUP_UNRESOLVED: "E_ENTITY_NPC_GROUP_UNRESOLVED",
  E_ENTITY_PHANTOM_PROP: "E_ENTITY_PHANTOM_PROP",
  E_ENTITY_UNKNOWN_PROP: "E_ENTITY_UNKNOWN_PROP",
} as const;

export type PipelineErrorCode =
  (typeof PIPELINE_ERROR_CODES)[keyof typeof PIPELINE_ERROR_CODES];

/**
 * Structure standard pour une erreur de pipeline avec code stable.
 */
export interface PipelineError {
  code: PipelineErrorCode;
  message: string;
  panelId?: string;
  beatId?: string;
  characterId?: string;
  entityId?: string;
  expected?: string | number;
  actual?: string | number;
  suggestedFix?: string;
}

/**
 * Crée une PipelineError avec les champs de base.
 */
export function createPipelineError(
  code: PipelineErrorCode,
  message: string,
  context?: Partial<Omit<PipelineError, "code" | "message">>,
): PipelineError {
  return {
    code,
    message,
    ...context,
  };
}

/**
 * Formate une PipelineError pour les logs.
 */
export function formatPipelineError(error: PipelineError): string {
  const parts = [`[${error.code}] ${error.message}`];
  if (error.panelId) parts.push(`panel=${error.panelId}`);
  if (error.beatId) parts.push(`beat=${error.beatId}`);
  if (error.characterId) parts.push(`character=${error.characterId}`);
  if (error.expected !== undefined && error.actual !== undefined) {
    parts.push(`expected=${error.expected} actual=${error.actual}`);
  }
  if (error.suggestedFix) parts.push(`suggestedFix=${error.suggestedFix}`);
  return parts.join(" ");
}

/**
 * Base class pour les erreurs de pipeline avec code stable.
 */
export class PipelineValidationError extends Error {
  readonly code: PipelineErrorCode;
  readonly context: Partial<PipelineError>;

  constructor(pipelineError: PipelineError) {
    super(formatPipelineError(pipelineError));
    this.name = "PipelineValidationError";
    this.code = pipelineError.code;
    this.context = pipelineError;
  }
}
