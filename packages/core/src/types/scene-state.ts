/**
 * SceneState: état explicite et obligatoire d'une scène manga.
 * Empêche les dérives intra-chapitre (lieu, personnages, tenues, props).
 */

export interface SceneState {
  sceneId: string;
  locationId: string;
  timeOfDay: string;
  atmosphere: string;
  /** Cast présent dans la scène avec leur état complet */
  cast: Array<{
    characterId: string;
    outfitId: string;
    emotion: string;
    injuries: string[];
    position: string;
    hasSpokenRecently: boolean;
  }>;
  /** Extras (PNJ) de la scène */
  extras: Array<{
    extraId: string;
    role: string;
    anchorSlot: string;
    visualSeed: string;
  }>;
  /** État des props/accessoires dans la scène */
  propState: string[];
  /** Niveau de menace/tension */
  threatLevel: number;
  /** Routes d'échappement possibles (pour cohérence spatiale) */
  escapeRoutes?: string[];
}

/** Origine de la définition d’archetype (contrat IA, canon DB, ou inférence héritée). */
export type SceneExtraSource = "ai_generated" | "db_canon" | "legacy";

/**
 * SceneExtra: PNJ/figurant dans une scène.
 * `archetypeId` est stable pour dédup / templates ; `archetypeLabel` alimente prompts et UI.
 */
export interface SceneExtra {
  id: string;
  sceneId: string;
  archetypeId: string;
  archetypeLabel: string;
  source: SceneExtraSource;
  visualSignature: {
    genderPresentation?: string;
    hair?: string;
    outfit?: string;
    silhouette?: string;
  };
  anchorSlot: string;
  reusePriority: number;
  canSpeak: boolean;
}

/**
 * Type de PNJ selon leur importance narrative
 */
export type NpcType = "ambient" | "support" | "narrative";

/**
 * RequiredContinuityBundle: contraintes obligatoires pour le chapitre suivant.
 */
export interface RequiredContinuityBundle {
  openThreads: Array<{
    id: string;
    label: string;
    mandatoryPayoffWindow?: [number, number];
    priority: "low" | "medium" | "high";
  }>;
  characterCarryOver: Array<{
    characterId: string;
    location?: string;
    outfit?: string;
    injuries?: string[];
    emotionalState?: string;
    unresolvedGoal?: string;
  }>;
  unresolvedConsequences: string[];
  forbiddenRetcons: string[];
}
