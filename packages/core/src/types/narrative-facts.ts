import type {
  CharacterVisualDna,
  EnvironmentVisualDna,
  NpcVisualDna,
  SceneRosterEntry,
} from "./generation-debug-snapshot";
import type {
  ReaderPageTemplateId,
  ReaderTextPlacementHint,
} from "./reader-page-format";
import type { SceneContinuitySnapshot } from "./generation-debug-snapshot";
import type { PanelTextContract } from "../generation/panel-text-contract";
import type {
  CreatureVisualDna,
  FactionVisualDna,
  VehicleVisualDna,
} from "../visual-world/visual-world-contract";

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

/**
 * P0.4 — Catégorie de propriétaire d'un prop.
 * Permet de distinguer les props du héros des props des gardes/ennemis/PNJ.
 */
export type PropOwnerCategory =
  | "hero"
  | "enemy"
  | "guard"
  | "npc"
  | "ambient"
  | "unassigned";

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
  source:
    | "canon"
    | "continuity"
    | "story_inference"
    | "location_inference"
    /** Props / objets imposés par le `VisualWorldContract` (compositeur IA). */
    | "visual_world_contract";
  /**
   * P0.4 — Catégorie de propriétaire. Défaut: "unassigned".
   * Les props `guard` ou `enemy` ne doivent pas être attribués au héros.
   */
  ownerCategory?: PropOwnerCategory;
  /**
   * P0.4 — ID du personnage propriétaire si connu (facultatif).
   */
  ownerId?: string | null;
}

/** Props visuels issus du `VisualWorldContract` (hydratation PR3 — prompt / QA). */
export interface BlueprintPropVisualDna {
  id: string;
  canonicalName: string;
  category: string;
  visualDescription: string;
  visibilityPolicy?: "visible" | "mentioned" | "background" | null;
  symbolicMeaning?: string | null;
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
  | "aftermath"
  /** Entité du registre visuel (réf. `requiredEntityIds` / personnages liés). */
  | "visual_entity";

/** Fonction narrative du panel (QA / rebalancing premium). */
export type MangaPanelFunction =
  | "establishing"
  | "character_action"
  | "character_reaction"
  | "dialogue_speaker"
  | "dialogue_listener"
  | "opponent_pressure"
  | "impact"
  | "aftermath_with_actor"
  | "prop_with_actor"
  | "location_transition"
  | "cliffhanger"
  | "entity_action";

/** Texte réservé pour composition post-rendu (pas dans l’image FAL). */
export interface PanelTextBundle {
  dialogues?: Array<{ speaker: string; text: string }>;
  narration?: string | null;
  sfx?: string[];
  reservedZones?: string[];
  preferredAnchorZones?: string[];
  overflowStrategy?: string;
}

/**
 * Origine du slot panel — chaîne de décision explicite (canon auteur vs padding rythme, etc.).
 * Sert à la traçabilité QA / audit (« chaque case → règle ou choix pipeline »).
 */
export type PanelBlueprintOrigin =
  | "canonical_projection"
  | "author_raw_merged"
  | "rhythm_padding_clone"
  | "rhythm_padding_canonical_fallback"
  | "retrofit_inferred";

/**
 * Métadonnées de traçabilité persistées sur le blueprint (complément des champs éditoriaux).
 */
export interface PanelBlueprintProvenance {
  origin: PanelBlueprintOrigin;
  /** PanelId du plan canonique (slot) — toujours aligné post-merge */
  canonicalPanelId: string;
  canonicalBeatId: string;
  /**
   * Empreinte stable du synopsis/outline de production au moment du calcul (estimate / job).
   * Permet de relier visuellement le plan à une version de l’histoire sans stocker tout le texte.
   */
  narrativeMemoryDigest?: string;
  /** Règles produit ayant structuré ce panel (ordre significatif) */
  appliedRules: string[];
}

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
  /** Traçabilité canon / mémoire narrative (optionnel sur anciens plans — hydraté au prochain estimate ou job) */
  provenance?: PanelBlueprintProvenance;
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
  /** Personnages visibles sur le panel (shot plan / QA interaction) — aligné hydrate + préflight DNA. */
  visibleCharacterIds?: string[];
  /** Locuteur explicite si distinct de `speakerAnchorCharacterId` (optionnel). */
  speakerCharacterId?: string | null;
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
  /**
   * P4.1 — Panel contractualement critique (arme utilisée, décor d'établissement,
   * reveal d'ennemi, foule attendue, objet narratif). Ces panels sont prioritaires
   * en QA premium et reçoivent un retry renforcé (refs/props/subject focus).
   */
  contractualCritical?: boolean;
  notes?: string[];
  sceneContextLabel?: string | null;
  /** `characterId` optionnel — ancrage studio pour hydratation DNA / locuteur. */
  dialogueLines?: Array<{ speaker: string; text: string; characterId?: string }>;
  narrationText?: string | null;
  sfxCues?: string[];
  readerTemplateId?: ReaderPageTemplateId | null;
  textPlacementHint?: ReaderTextPlacementHint | null;
  sceneRoster?: SceneRosterEntry[];
  continuityState?: SceneContinuitySnapshot | null;
  characterVisualDna?: CharacterVisualDna[];
  /** Groupes PNJ monde (hors créatures / véhicules / factions — P0.12). */
  npcVisualDna?: NpcVisualDna[];
  /** Créatures liées au beat (VisualWorldContract → hydratation). */
  creatureVisualDna?: CreatureVisualDna[];
  vehicleVisualDna?: VehicleVisualDna[];
  factionVisualDna?: FactionVisualDna[];
  environmentVisualDna?: EnvironmentVisualDna | null;
  /** Ancre décor (souvent = `environmentVisualDna.anchorId` / id lieu VW). */
  environmentAnchorId?: string | null;
  /** Props visuels dérivés du monde IA (complément `requiredProps`). */
  propVisualDna?: BlueprintPropVisualDna[];
  /** Objets de continuité explicites (si le binding beat en fournit). */
  continuityObjectIds?: string[];

  /** IDs d’entités visuelles (registre premium) requises sur ce panel. */
  requiredEntityIds?: string[];
  /** Rôle narratif explicite (structure manga premium). */
  mangaPanelFunction?: MangaPanelFunction | null;
  /** Mode de rendu libre (ex. opponent_reveal, entity_action). */
  renderMode?: string | null;
  /** Politique de refs suggérée côté blueprint (STRONG / LIGHT / NEEDS_MODEL_SHEET / CANONIZE_FROM_FIRST_APPEARANCE). */
  referencePolicy?: string | null;
  /** Marqueur post-rebalance cutaway → acteur. */
  rebalancedFromCutaway?: boolean;
  /** Texte et zones réservées pour la composition lecteur (hors FAL). */
  panelTextBundle?: PanelTextBundle | null;
  /**
   * PR9 — Contrat texte unique (aligné sur `dialogueLines` / `narrationText` / `sfxCues` / `panelTextBundle`).
   * Hydraté à la projection canonique et recalculé après merge avec le rythme canonique.
   */
  textContract?: PanelTextContract | null;
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
    /** P1.6 — scène foule / PNJ attendue mais aucun panel ne la couvre */
    | "missing_npc_population"
    /** P1.7 — changement de lieu significatif sans establishing shot */
    | "missing_environment_establishing"
    /** P1.5 — arme / objet narratif obligatoire sans insert dédié */
    | "missing_weapon_insert"
    | "no_cutaway"
    | "shot_monotony";
  message: string;
  severity: "warning" | "blocking";
}
