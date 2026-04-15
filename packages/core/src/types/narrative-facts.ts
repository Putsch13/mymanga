// ─── Narrative Facts ──────────────────────────────────────────────────────────

export type NarrativeFactType =
  | "action"
  | "dialogue"
  | "threat"
  | "movement"
  | "reveal"
  | "prop_usage"
  | "prop_presence"
  | "prop_transfer"
  | "enemy_presence"
  | "npc_presence"
  | "location_signal"
  | "location_emphasis"
  | "emotional_reaction"
  | "reaction"
  | "observation"
  | "world_state_signal";

export interface NarrativeFact {
  id: string;
  beatId: string;
  panelHintIds?: string[];
  type: NarrativeFactType;
  actorIds: string[];
  targetIds: string[];
  propCandidates: string[];
  locationSignals: string[];
  requiredVisibility: "must_show" | "may_show" | "offscreen_allowed";
  evidenceStrength: number;
  source: "outline" | "continuity" | "dialogue" | "canon" | "inference";
  notes?: string[];
}

// ─── Required Props ───────────────────────────────────────────────────────────

export type PropNarrativeRole =
  | "action_tool"
  | "threat"
  | "communication"
  | "computation"
  | "evidence"
  | "worldbuilding"
  | "ritual"
  | "medical"
  | "travel"
  | "payoff";

export type PropVisibilityMode =
  | "in_hand"
  | "on_body"
  | "foreground_insert"
  | "background_support"
  | "used_in_action"
  | "on_surface"
  | "aftermath_trace";

export interface RequiredProp {
  id: string;
  canonicalName: string;
  aliases: string[];
  category: string;
  narrativeRole: PropNarrativeRole;
  requiredForBeatIds: string[];
  preferredPanelIds?: string[];
  visibilityMode: PropVisibilityMode;
  mustBeVisible: boolean;
  confidence: number;
  source: "canon" | "continuity" | "story_inference" | "location_inference";
}

// ─── Presence Obligations ─────────────────────────────────────────────────────

export interface PresenceObligation {
  id: string;
  beatId: string;
  panelIds?: string[];
  entityType: "hero" | "ally" | "enemy" | "npc" | "crowd" | "creature";
  entityIdOrLabel: string;
  requirement: "must_show" | "should_show" | "background_ok";
  minVisualSalience: "high" | "medium" | "low";
  reason: string;
}

// ─── Chapter Object State ─────────────────────────────────────────────────────

export interface ChapterObjectState {
  objectId: string;
  ownerCharacterId?: string | null;
  sceneId?: string | null;
  locationLabel?: string | null;
  state:
    | "carried"
    | "equipped"
    | "used"
    | "dropped"
    | "broken"
    | "hidden"
    | "consumed";
  visualRequirement: "must_show" | "show_when_relevant" | "trace_only";
  lastSeenPanelId?: string | null;
}

// ─── Panel Blueprint Premium ──────────────────────────────────────────────────

export type SubjectFocus =
  | "hero"
  | "enemy"
  | "ally"
  | "duo"
  | "npc"
  | "group"
  | "environment"
  | "prop"
  | "reaction"
  | "speaker"
  | "location"
  | "aftermath";

export type CutawayType =
  | "none"
  | "environment"
  | "enemy"
  | "prop_insert"
  | "reaction"
  | "npc_group"
  | "surveillance"
  | "aftermath"
  | "movement_trace"
  | "crowd"
  // Extended variants used in scene-blueprint
  | "environment_establishing"
  | "enemy_reveal"
  | "object_insert"
  | "reaction_insert"
  | "location_transition"
  | "threat_insert";

export interface PanelBlueprintPremium {
  panelId: string;
  beatId: string;
  /** Index du panel dans le beat (0-based) */
  panelIndex?: number;
  pageNumber?: number | null;
  /** Numéro de panel dans la page (1-based, alias de panelIndex+1) */
  panelNumber: number;
  purpose: string;
  shotType: string;
  cameraAngle: string;
  subjectFocus: SubjectFocus;
  secondaryFocus?: SubjectFocus | null;
  /** IDs des personnages obligatoires (alias spec) */
  requiredCharacters?: string[];
  requiredCharacterIds?: string[];
  /** IDs des personnages obligatoires (usage interne) */
  mustShowCharacterIds?: string[];
  mayShowCharacterIds?: string[];
  mustShowEnemy: boolean;
  requiredNpcCount: number;
  requiredSubjects?: string[];
  requiredProps: RequiredProp[];
  optionalProps?: RequiredProp[];
  /** Obligations de présence (spec P0.1) */
  presenceObligations?: PresenceObligation[];
  requiredLocationSignals: string[];
  speakerAnchorCharacterId?: string | null;
  speakerAnchorCharacterName?: string | null;
  dialogueCarrier?: "speaker_visible" | "offscreen_allowed" | "narration";
  /** Nombre de lignes de dialogue ancrées */
  dialogueLinesAnchored?: number;
  cutawayType: CutawayType;
  heroCenterAllowed: boolean;
  criticality: "low" | "medium" | "high" | "critical";
  notes?: string[];
}

// ─── Focus Budget ─────────────────────────────────────────────────────────────

export interface ChapterFocusBudget {
  totalPanels: number;
  heroCenterRatio: number;
  focusDistribution: Record<SubjectFocus, number>;
  shotDistribution: Record<string, number>;
  cutawayCount: number;
  cutawayRatio: number;
  /** Panels avec héros en focus principal */
  heroFocusPanels: number;
  enemyFocusPanels: number;
  environmentPanels: number;
  propInsertPanels: number;
  /** Panels de réaction */
  reactionPanels: number;
  /** Panels avec speaker visible */
  speakerPanels: number;
  /** Panels de groupe */
  groupPanels: number;
  /** Panels de coupe (cutaway) */
  cutawayPanels: number;
  npcPanels: number;
  violations: FocusBudgetViolation[];
}

export interface FocusBudgetViolation {
  type:
    | "hero_overload"
    | "missing_environment"
    | "missing_enemy_focus"
    | "missing_prop_insert"
    | "no_cutaway"
    | "shot_monotony";
  message: string;
  severity: "warning" | "blocking";
}
