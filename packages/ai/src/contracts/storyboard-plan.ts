/**
 * StoryboardPlan — Source de vérité éditoriale d'un chapitre.
 *
 * Produit par l'IA 2 (Manga Editor / Storyboard Director, cf.
 * manga-editor-agent.ts) à partir d'un StoryArc. Consommé par :
 *   - render-pass (pour produire des PanelRenderSpec panel par panel)
 *   - reader (pour rendre les pages EXACTEMENT telles que décidées)
 *   - panel-qa-pass / page-qa-pass (diagnostics éditoriaux)
 *
 * Règles fortes :
 *   - le StoryboardPlan décide TOUT le découpage (pages, layouts, panels)
 *   - le render-pass ne décide plus la dramaturgie
 *   - le reader ne repagine PAS quand un StoryboardPlan existe
 *   - chaque panel DOIT avoir un renderMode explicite
 *   - chaque panel DOIT avoir un sourceBeatId pointant sur un StoryBeat
 */

export type StoryboardLayoutTemplate =
  | "splash"
  | "double_spread"
  | "grid_2x2"
  | "grid_2x3"
  | "action_strip"
  | "asymmetric_hero"
  | "cinematic_bar"
  | "focus_closeup"
  | "vertical_strip"
  | "grid_1_2_2"
  | "hero_top_2_2"
  | "2_1_2_dialogue"
  | "staggered_5"
  | "vertical_hero_4";

export type StoryboardRenderMode =
  | "establishing_environment"
  | "silent_transition"
  | "dialogue_two_shot"
  | "dialogue_over_shoulder"
  | "reaction_closeup"
  | "hero_closeup"
  | "npc_closeup"
  | "enemy_closeup"
  | "insert_object"
  | "surveillance_reveal"
  | "group_tension"
  | "combat_exchange"
  | "combat_aftermath";

export type StoryboardShotType =
  | "wide"
  | "medium"
  | "closeup"
  | "extreme_closeup"
  | "over_shoulder";

export type StoryboardCameraAngle =
  | "eye_level"
  | "low"
  | "high"
  | "dutch"
  | "birds_eye"
  | "worm";

export type StoryboardSubjectFocus =
  | "hero"
  | "important_npc"
  | "enemy"
  | "group"
  | "environment"
  | "prop"
  | "reaction";

export type StoryboardCutawayType =
  | "none"
  | "environment"
  | "prop_insert"
  | "reaction"
  | "crowd"
  | "aftermath"
  | "surveillance";

export interface StoryboardPanelDialogue {
  speaker: string;
  text: string;
}

export interface StoryboardPanelVisualAnchors {
  characterIds: string[];
  environmentAnchorId?: string | null;
  previousPanelAnchorId?: string | null;
}

export interface StoryboardPanel {
  panelId: string;
  pageNumber: number;
  panelNumberInPage: number;
  globalPanelIndex: number;
  sourceBeatId: string;
  panelPurpose: string;
  renderMode: StoryboardRenderMode;
  shotType: StoryboardShotType;
  cameraAngle: StoryboardCameraAngle;
  subjectFocus: StoryboardSubjectFocus;
  cutawayType: StoryboardCutawayType;
  characters: string[];
  locationId: string | null;
  locationName: string;
  actionLine: string;
  emotionLine: string;
  dialogue: StoryboardPanelDialogue[];
  narration?: string | null;
  sfx?: string[];
  mustShow: string[];
  mustNotShow: string[];
  continuityNotes: string[];
  visualAnchors: StoryboardPanelVisualAnchors;
}

export interface StoryboardPage {
  pageNumber: number;
  layoutTemplate: StoryboardLayoutTemplate;
  dramaticRole: string;
  beatIds: string[];
  panels: StoryboardPanel[];
}

export interface StoryboardEditorialDiagnostics {
  varietyScore: number;
  heroFocusRatio: number;
  environmentRatio: number;
  insertRatio: number;
  reactionRatio: number;
  warnings: string[];
  blockers: string[];
}

export interface StoryboardPlan {
  chapterId: string;
  totalTargetPanels: number;
  pages: StoryboardPage[];
  editorialDiagnostics: StoryboardEditorialDiagnostics;
}

export const STORYBOARD_LAYOUT_TEMPLATES: readonly StoryboardLayoutTemplate[] = [
  "splash",
  "double_spread",
  "grid_2x2",
  "grid_2x3",
  "action_strip",
  "asymmetric_hero",
  "cinematic_bar",
  "focus_closeup",
  "vertical_strip",
  "grid_1_2_2",
  "hero_top_2_2",
  "2_1_2_dialogue",
  "staggered_5",
  "vertical_hero_4",
] as const;

export const STORYBOARD_RENDER_MODES: readonly StoryboardRenderMode[] = [
  "establishing_environment",
  "silent_transition",
  "dialogue_two_shot",
  "dialogue_over_shoulder",
  "reaction_closeup",
  "hero_closeup",
  "npc_closeup",
  "enemy_closeup",
  "insert_object",
  "surveillance_reveal",
  "group_tension",
  "combat_exchange",
  "combat_aftermath",
] as const;

export const STORYBOARD_SHOT_TYPES: readonly StoryboardShotType[] = [
  "wide",
  "medium",
  "closeup",
  "extreme_closeup",
  "over_shoulder",
] as const;

export const STORYBOARD_SUBJECT_FOCUSES: readonly StoryboardSubjectFocus[] = [
  "hero",
  "important_npc",
  "enemy",
  "group",
  "environment",
  "prop",
  "reaction",
] as const;

export const STORYBOARD_CUTAWAY_TYPES: readonly StoryboardCutawayType[] = [
  "none",
  "environment",
  "prop_insert",
  "reaction",
  "crowd",
  "aftermath",
  "surveillance",
] as const;
