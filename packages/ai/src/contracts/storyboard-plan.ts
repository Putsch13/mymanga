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

import type {
  CharacterVisualDna,
  EnvironmentVisualDna,
  NpcVisualDna,
  ReaderPageTemplateId,
  ReaderTextPlacementHint,
  SceneContinuitySnapshot,
  SceneRosterEntry,
} from "@manga-ai-studio/core";

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
  /**
   * Révélation d'un antagoniste / ennemi visible — cadrage menaçant,
   * posture identifiable, distinct de `enemy_closeup` qui focalise
   * l'émotion. Utilisé pour "première apparition de l'ennemi".
   */
  | "enemy_reveal"
  /**
   * Révélation d'une ou plusieurs créatures (animaux fantastiques,
   * monstres, espèces non-humanoïdes). OBLIGATOIRE dès qu'un beat
   * introduit une créature — un `establishing_environment` ne couvre pas.
   */
  | "creature_reveal"
  /**
   * Silhouette menaçante observée de loin ou en backlit. Obligatoire
   * pour les beats "ombre / silhouette / observateur invisible".
   */
  | "threat_silhouette"
  /**
   * Dialogue en post-combat / post-événement — cadrage moyen, émotion
   * contenue, décor altéré en arrière-plan. Distinct de combat_aftermath
   * qui est un plan large muet.
   */
  | "aftermath_dialogue"
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
  /**
   * Créature / animal fantastique / monstre. Distinct de `enemy`
   * (humanoïde antagoniste) — obligatoire quand le beat introduit une
   * espèce non-humaine.
   */
  | "creature"
  /**
   * Menace observée de loin (silhouette, ombre, présence ambiante
   * identifiable mais sans visage clair).
   */
  | "threat"
  | "reaction";

export type StoryboardCutawayType =
  | "none"
  | "environment"
  | "prop_insert"
  | "reaction"
  | "crowd"
  | "aftermath"
  | "surveillance";

/**
 * COMMIT P3.B — PanelPurpose enum strict (22 valeurs).
 *
 * `panelPurpose` exprime l'INTENTION ÉDITORIALE d'une case. C'est ce
 * qui distingue :
 *   - un `reaction_closeup` qui renforce un beat dialogue,
 *   - d'un `prop_insert` qui révèle un indice,
 *   - d'un `combat_impact` qui matérialise le choc d'un combat.
 *
 * Avant : `panelPurpose: string` — le LLM storyboard pouvait produire
 * n'importe quel libellé, et le renderer acceptait. Résultat : des
 * `panel=unknown` qui retombaient sur le fallback legacy
 * `CHARACTER_IN_SCENE` en prod.
 *
 * Maintenant : enum fermé. Le render-spec-validator refuse toute valeur
 * hors liste.
 */
export const PANEL_PURPOSES = [
  "dialogue_anchor",
  "reaction_closeup",
  "hero_focus",
  "npc_focus",
  "enemy_focus",
  "group_tension",
  "dialogue_over_shoulder",
  "confrontation_standoff",
  "threat_silhouette",
  "creature_reveal",
  "environment_cutaway",
  "prop_insert",
  "surveillance_insert",
  "combat_anticipation",
  "combat_release",
  "combat_impact",
  "combat_counter",
  "combat_aftermath",
  "location_establishing",
  "transition",
  "page_turn_cliffhanger",
  "emotional_breathing_space",
] as const;

export type PanelPurpose = (typeof PANEL_PURPOSES)[number];

export function isPanelPurpose(value: unknown): value is PanelPurpose {
  return typeof value === "string" && (PANEL_PURPOSES as readonly string[]).includes(value);
}

export interface StoryboardPanelDialogue {
  speaker: string;
  text: string;
}

export interface StoryboardPanelVisualAnchors {
  characterIds: string[];
  environmentAnchorId?: string | null;
  previousPanelAnchorId?: string | null;
}

/**
 * COMMIT P5 — catégorisation stricte des PNJ / ennemis / figurants.
 *
 * Le legacy traitait tout comme `passerby:ambient-depth` et se plaignait
 * que "les PNJ ne sont pas fiables". La vérité : il n'y avait pas de
 * contrat qui distinguait un figurant anonyme d'un antagoniste récurrent
 * avec une mémoire visuelle dédiée.
 *
 * Maintenant :
 *   - `ambient_extra`     : figurant de foule, pas de mémoire visuelle
 *     (passerby, civil, badaud)
 *   - `recurring_npc`     : PNJ secondaire qui revient, mémoire visuelle
 *     légère (silhouette + accessoire marker suffisent)
 *   - `important_npc`     : PNJ narratif avec rôle, continuity ID stable,
 *     droit aux panels dédiés (`npc_focus`, `npc_closeup`)
 *   - `antagonist_enemy`  : ennemi/antagoniste nommé, continuity ID +
 *     face ref dédiée, droit à silhouette/reveal/standoff/impact
 */
export const NPC_CATEGORIES = [
  "ambient_extra",
  "recurring_npc",
  "important_npc",
  "antagonist_enemy",
] as const;

export type NpcCategory = (typeof NPC_CATEGORIES)[number];

export function isNpcCategory(value: unknown): value is NpcCategory {
  return typeof value === "string" && (NPC_CATEGORIES as readonly string[]).includes(value);
}

/**
 * COMMIT P5 — représentation d'un PNJ attaché à un panel.
 *
 * Les PNJ `important_npc` et `antagonist_enemy` DOIVENT avoir un
 * `continuityId` stable à travers le chapitre. Les `ambient_extra`
 * peuvent être anonymes.
 */
export interface StoryboardPanelNpc {
  /**
   * ID de continuité du PNJ (ex: `npc:shopkeeper-elio` pour un
   * important_npc). OBLIGATOIRE pour important_npc et antagonist_enemy,
   * optionnel pour ambient_extra / recurring_npc.
   */
  continuityId?: string;
  category: NpcCategory;
  displayName?: string;
  /**
   * Fonction narrative pour les important_npc / antagonist_enemy
   * (ex: "client du bar qui livre l'indice", "mercenaire qui
   * impose le combat"). Utilisé par le storyboard validator pour
   * refuser les important_npc sans fonction explicite.
   */
  narrativeFunction?: string;
}

export interface StoryboardPanel {
  panelId: string;
  pageNumber: number;
  panelNumberInPage: number;
  globalPanelIndex: number;
  sourceBeatId: string;
  /**
   * COMMIT P3.B — intention éditoriale stricte. Refusée par le
   * render-spec-validator si hors de PANEL_PURPOSES.
   */
  panelPurpose: PanelPurpose;
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
  sceneContextLabel?: string | null;
  readerTemplateId?: ReaderPageTemplateId | null;
  textPlacementHint?: ReaderTextPlacementHint | null;
  sceneRoster?: SceneRosterEntry[];
  continuityState?: SceneContinuitySnapshot | null;
  characterVisualDna?: CharacterVisualDna[];
  npcVisualDna?: NpcVisualDna[];
  environmentVisualDna?: EnvironmentVisualDna | null;
  /**
   * COMMIT P5 — PNJ / ennemis attachés au panel, catégorisés.
   * Optionnel (backward compat), mais le storyboard-validator
   * en mode strict refuse qu'un `important_npc` apparaisse sans
   * `continuityId` et sans `narrativeFunction`.
   */
  npcs?: StoryboardPanelNpc[];
  /**
   * PATCH 8 — place / ratio / slot prévus pour le reader et FAL avant rendu.
   * Si absents, `inferStoryboardPanelLayoutMeta(renderMode)` les déduit.
   */
  layoutHint?: string | null;
  targetAspectRatio?: "portrait" | "landscape" | "square" | null;
  /** Souvent égal à `renderMode` (ex. `hero_closeup`, `creature_reveal`). */
  slotType?: string | null;
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
  "enemy_reveal",
  "creature_reveal",
  "threat_silhouette",
  "aftermath_dialogue",
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
  "creature",
  "threat",
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
