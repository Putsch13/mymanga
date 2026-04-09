/**
 * PanelContract: spécification visuelle contrôlée d'un panel avant génération.
 * Le panel n'est plus un prompt libre, c'est une spec visuelle stricte.
 */

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
}

/**
 * PanelValidationResult: résultat de la validation d'un panel généré.
 */
export interface PanelValidationResult {
  panelId: string;
  score: number;
  qualityScores?: {
    characterConsistencyScore: number;
    backgroundPresenceScore: number;
    environmentReadabilityScore: number;
    interactionScore: number;
    shotComplianceScore: number;
    styleConsistencyScore: number;
    releaseScore: number;
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
      | "style_drift";
    message: string;
    autoFixable: boolean;
  }>;
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
