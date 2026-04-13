/**
 * PanelContract: spécification visuelle contrôlée d'un panel avant génération.
 * Le panel n'est plus un prompt libre, c'est une spec visuelle stricte.
 */

import type { CharacterFingerprint } from "./character-fingerprint";
import type { SubjectFocus, CutawayType, RequiredProp } from "./narrative-facts";

export interface PanelContract {
  panelId: string;
  pageNumber: number;
  panelNumber: number;
  /** But narratif du panel */
  purpose: "establishing" | "reaction" | "dialogue" | "action" | "reveal" | "aftermath";
  /** Type de cadrage */
  shotType: "wide" | "medium" | "closeup" | "extreme_closeup" | "over_shoulder";
  /** Angle de caméra */
  cameraAngle: "eye_level" | "low_angle" | "high_angle" | "dutch";
  /** Personnages au focus */
  focusCharacters: string[];
  /** Personnages qui DOIVENT apparaître */
  requiredCharacters: string[];
  /** Extras en arrière-plan */
  backgroundExtras: string[];
  /** Description structurée de l'environnement principal */
  environmentPrimary?: string;
  /** Détails secondaires du décor */
  environmentSecondary?: string[];
  /** État du lieu / décor */
  environmentState?: string | null;
  weather?: string | null;
  timeOfDay?: string | null;
  foregroundSubjects?: string[];
  midgroundElements?: string[];
  backgroundElements?: string[];
  npcPresence?: string[];
  creaturePresence?: string[];
  interactionBeat?: string | null;
  environmentStoryHooks?: string[];
  persistentSceneAnchors?: string[];
  mustShowProps?: string[];
  mustShowLocationSignals?: string[];
  /** Éléments qui DOIVENT être visibles */
  mustShow: string[];
  /** Éléments qui NE DOIVENT PAS être visibles */
  mustNotShow: string[];
  /** Panel précédent dont il faut assurer la continuité visuelle */
  continuityFromPanelId?: string;
  /** IDs des visuels d'ancrage (keyframes, refs canoniques) */
  visualAnchorIds: string[];
  /** Fingerprints des personnages présents — clé = nom du personnage */
  characterFingerprints?: Record<string, CharacterFingerprint>;
  /** Carte d'intention visuelle du panel (beat, motionLevel, mustShow...) */
  intentCard?: {
    panelRole: string;
    beatEventType: string;
    emotionalTarget: string;
    actionIntensity: number;
    motionLevel: number;
    mustShow: string[];
    mustAvoid: string[];
    beatVisualConstraints: string[];
    sfxForbiddenTypes?: string[];
    continuityPriority: "high" | "medium" | "low";
    sfxIntent: string | null;
  };
  /** Ancre spatiale de la scène (positions, layout, décor établi) */
  sceneAnchor?: {
    sceneId: string;
    anchorImageId?: string;
    castLineup: string[];
    spatialLayout: string;
    dominantLocation: string;
    characterPositions: Record<string, "left" | "center" | "right" | "background">;
    dominantMood: string;
    weather?: string;
    timeOfDay?: string;
    persistentProps?: string[];
  };
  /** Plan de placement du texte */
  textBoxPlan: {
    narration?: boolean;
    dialogueCount: number;
    sfx?: string[];
    reservedZones: Array<"top-left" | "top-right" | "bottom-left" | "bottom-right" | "center">;
  };
  /** Hints de rendu pour le reader */
  renderHints: {
    targetAspectRatio: string;
    cropMode: "contain" | "cover";
    focalPoint?: { x: number; y: number };
  };
  // ─── Premium contractual fields ──────────────────────────────────────────
  /** Focus sujet principal du panel */
  subjectFocus?: SubjectFocus;
  /** Focus sujet secondaire */
  secondaryFocus?: SubjectFocus | null;
  /** L'ennemi/adversaire doit être visible dans ce panel */
  mustShowEnemy?: boolean;
  /** Nombre minimum de PNJ requis */
  requiredNpcCount?: number;
  /** ID du personnage porteur du dialogue (doit être visible) */
  speakerAnchorCharacterId?: string | null;
  /** Mode de portage du dialogue */
  dialogueCarrier?: "speaker_visible" | "offscreen_allowed" | "narration";
  /** Type de plan de coupe */
  cutawayType?: CutawayType;
  /** Le héros peut être centré dans ce panel */
  heroCenterAllowed?: boolean;
  /** Criticité du panel */
  panelCriticalityLevel?: "low" | "medium" | "high" | "critical";
  /** Props obligatoires typés */
  requiredPropsTyped?: RequiredProp[];
  /** Props optionnels typés */
  optionalPropsTyped?: RequiredProp[];
  /** Trace de debug panel — activée si MANGA_DEBUG_PANEL=true */
  panelDebugTrace?: {
    sourceBeat: string;
    panelIntent: string;
    promptDigest: string;
    refsRequested: string[];
    refsUsed: string[];
    refsIgnored: string[];
    charactersExpected: string[];
    styleProfileExpected: string;
    driftResult?: {
      score: number;
      severity: string;
      recommendedAction: string;
      styleDriftScore?: number;
      characterDriftScore?: number;
      beatAlignmentScore?: number;
    };
  };
}

/**
 * PanelValidationResult: résultat de la validation d'un panel généré.
 */
export interface PanelValidationResult {
  panelId: string;
  score: number;
  panelCriticality?: {
    level: "NON_CRITICAL" | "CRITICAL";
    reasons: string[];
  };
  qualityScores?: {
    characterConsistencyScore: number;
    backgroundPresenceScore: number;
    environmentReadabilityScore: number;
    interactionScore: number;
    shotComplianceScore: number;
    styleConsistencyScore: number;
    releaseScore: number;
    visionScore?: number | null;
    // Premium contractual scores
    propComplianceScore?: number;
    subjectFocusScore?: number;
    dialogueAnchorScore?: number;
    enemyPresenceScore?: number;
    populationScore?: number;
    cutawayComplianceScore?: number;
  };
  visionAnalysis?: {
    enabled: boolean;
    model?: string | null;
    confidence?: number | null;
    findings: string[];
  };
  propertyChecks?: Array<{
    property: string;
    ok: boolean;
    message: string;
  }>;
  issues: Array<{
    severity: "critical" | "major" | "minor";
    type:
      | "missing_character"
      | "wrong_gender"
      | "wrong_hair"
      | "wrong_eyes"
      | "wrong_outfit"
      | "wrong_cadrage"
      | "missing_element"
      | "forbidden_element"
      | "empty_background"
      | "weak_environment"
      | "weak_interaction"
      | "style_drift"
      | "missing_visual_qa"
      // Premium contractual issues
      | "missing_prop"
      | "missing_weapon"
      | "missing_device"
      | "missing_enemy_presence"
      | "missing_dialogue_anchor"
      | "wrong_subject_focus"
      | "cutaway_not_respected"
      | "cutaway_collapsed_to_hero"
      | "wrong_cutaway_target"
      | "object_used_but_not_visible"
      | "npc_population_missing"
      | "crowd_presence_missing";
    message: string;
    autoFixable: boolean;
  }>;
  qaWasRequired?: boolean;
  qaWasExecuted?: boolean;
  qaFailureReason?: string | null;
  qaBypassReason?: string | null;
  requiredReroll: boolean;
}

/**
 * Beat: un beat narratif dans l'outline.
 */
export interface BeatAdvancement {
  beatId: string;
  /** Qu'est-ce qui change ? */
  whatChanges: string;
  /** Qu'apprend le lecteur ? */
  readerLearns: string;
  /** Quelle décision ou conséquence ? */
  consequence?: string;
  /** Pourquoi ce beat existe ? */
  narrativeJustification: string;
  /** Score de pertinence (0-1, reject si < 0.6) */
  relevanceScore: number;
}
