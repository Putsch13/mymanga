import type { PropOwnerCategory } from "@manga-ai-studio/core";

// ────────────────────────────────────────────────────────────────────────────
// P1.2 — Taxonomie des panel intents
// ────────────────────────────────────────────────────────────────────────────

export type PanelIntentType =
  | "hero_portrait"
  | "hero_action"
  | "hero_duo"
  | "hero_reaction"
  | "npc_focus"
  | "enemy_focus"
  | "enemy_reveal"
  | "ally_focus"
  | "group_conflict"
  | "group_presence"
  | "guard_presence"
  | "crowd_cutaway"
  | "reaction_cutaway"
  | "prop_insert"
  | "environment_establishing"
  | "environment_transition"
  | "aftermath"
  | "symbolic_insert"
  | "magic_manifestation"
  | "dialogue_anchor";

export type DominantSubjectType =
  | "hero"
  | "enemy"
  | "ally"
  | "npc"
  | "group"
  | "guard_group"
  | "crowd"
  | "environment"
  | "prop"
  | "aftermath"
  | "duo";

export type FramingCategory =
  | "portrait"
  | "closeup"
  | "medium"
  | "wide"
  | "establishing"
  | "insert"
  | "over_shoulder"
  | "splash";

export type ReferencePolicyIntent = "STRONG" | "LIGHT" | "NONE";

export interface RequiredEntity {
  entityType: "character" | "npc_group" | "crowd" | "creature";
  entityId?: string | null;
  label: string;
  role: "primary" | "secondary" | "background";
  mustBeReadable: boolean;
}

export interface IntentRequiredProp {
  canonicalName: string;
  ownerCategory: PropOwnerCategory;
  visibilityMode: string;
  mustBeVisible: boolean;
}

export interface SuppressedEntity {
  entityType: "character" | "framing" | "clause";
  label: string;
  reason: string;
}

export interface RequiredReferenceSet {
  characterRefs: boolean;
  sceneRefs: boolean;
  styleRefs: boolean;
  environmentRefs: boolean;
}

export interface VisualHierarchyLayer {
  foreground: string[];
  midground: string[];
  background: string[];
}

export interface PanelGenerationIntent {
  panelId: string;
  panelNumber: number;
  pageNumber: number;
  beatId: string;

  intentType: PanelIntentType;
  beatType: string;
  panelFunction: string;

  dominantSubject: DominantSubjectType;
  secondarySubjects: DominantSubjectType[];
  cutawayType: string | null;

  cameraIntent: FramingCategory;
  compositionIntent: string;
  shotType: string;
  cameraAngle: string | null;

  environmentPriority: number;
  characterPriority: number;
  propPriority: number;
  crowdPriority: number;

  requiredVisibleEntities: RequiredEntity[];
  requiredVisibleProps: IntentRequiredProp[];
  requiredLocationSignals: string[];

  suppressedEntities: SuppressedEntity[];
  suppressedPromptClauses: string[];

  allowedReferencePolicy: ReferencePolicyIntent;
  requiredReferenceSet: RequiredReferenceSet;

  forbiddenFraming: FramingCategory[];
  forbiddenPromptTokens: string[];

  visualHierarchy: VisualHierarchyLayer;

  reason: string;
}

export interface PanelPlanInput {
  panelId: string;
  panelNumber: number;
  pageNumber: number;
  beatId: string;
  beatType: string;
  subjectFocus: string | null;
  cutawayType: string | null;
  shotType: string;
  cameraAngle: string | null;
  purpose: string | null;
  caption: string;
  characterIds: string[];
  requiredProps: Array<{
    canonicalName: string;
    ownerCategory?: PropOwnerCategory;
    visibilityMode?: string;
    mustBeVisible?: boolean;
  }>;
  mustShowLocationSignals: string[];
  heroCenterAllowed: boolean;
  speakerAnchorCharacterId: string | null;
  npcGroupPresence: string[];
  creaturePresence: string[];
}

export interface CharacterCastInfo {
  characterId: string;
  name: string;
  role: string;
  importanceTier: string;
  isHero: boolean;
}

export interface LocationCanonInfo {
  locationName: string;
  mustShowSignals: string[];
  visualDescriptor: string | null;
}

export interface NarrativeFactInput {
  type: string;
  beatId: string;
  propCandidates?: string[];
  characterIds?: string[];
}

export interface GenerationIntentPlannerInput {
  chapterId: string;
  panels: PanelPlanInput[];
  castByCharacterId: Map<string, CharacterCastInfo>;
  heroCharacterId: string | null;
  locationCanon: Map<string, LocationCanonInfo>;
  narrativeFacts: NarrativeFactInput[];
}
