import type { ProductionOutline } from "@manga-ai-studio/core";

/**
 * Type d'entité visuelle découverte.
 */
export type DiscoveredEntityKind =
  | "character"
  | "npc_group"
  | "location"
  | "sublocation"
  | "vehicle_or_large_prop"
  | "species"
  | "robot"
  | "hybrid"
  | "creature"
  | "faction"
  | "prop"
  | "mystery_entity";

/**
 * Source de la découverte.
 */
export type DiscoverySource =
  | "existing_user_entity"
  | "story_text"
  | "dialogue"
  | "project_style"
  | "temporary_inference";

/**
 * Niveau de canonicité de l'entité.
 */
export type CanonLevel = "user_canon" | "chapter_temporary" | "mystery";

/**
 * Entité visuelle découverte.
 */
export interface DiscoveredVisualEntity {
  id?: string;
  label: string;
  kind: DiscoveredEntityKind;
  source: DiscoverySource;
  confidence: number;
  requiredBeats: string[];
  optionalBeats: string[];
  visualDescription: string;
  canonLevel: CanonLevel;
  detectedIn: string[];
  /** P1.9 — ID du beat où l'entité a été détectée pour la première fois */
  evidenceBeatId?: string;
  /** P1.9 — Extrait de texte prouvant la détection */
  evidenceText?: string;
  /** P1.9 — Si true, entité est requise ; sinon optionnelle */
  required: boolean;
}

/**
 * Liaison beat → entités visuelles.
 */
export interface BeatVisualBinding {
  beatId: string;
  characters: string[];
  locations: string[];
  npcGroups: string[];
  props: string[];
}

/**
 * Contrat de découverte visuelle pour un chapitre.
 */
export interface ChapterVisualDiscoveryContract {
  chapterId: string;
  characters: DiscoveredVisualEntity[];
  npcGroups: DiscoveredVisualEntity[];
  locations: DiscoveredVisualEntity[];
  /** P1.10 — Sous-contextes (pont du navire, cabine, etc.) */
  sublocations: DiscoveredVisualEntity[];
  /** P1.10 — Véhicules et grands props (navire, train, etc.) */
  vehiclesOrLargeProps: DiscoveredVisualEntity[];
  species: DiscoveredVisualEntity[];
  robots: DiscoveredVisualEntity[];
  hybrids: DiscoveredVisualEntity[];
  creatures: DiscoveredVisualEntity[];
  factions: DiscoveredVisualEntity[];
  props: DiscoveredVisualEntity[];
  forbiddenProps: string[];
  /** P1.9 — Entités rejetées car sans preuve textuelle */
  rejectedEntities: Array<{ label: string; reason: string }>;
  beatBindings: BeatVisualBinding[];
}

/**
 * Input pour le VisualDiscoveryPass.
 */
export interface VisualDiscoveryPassInput {
  chapterId: string;
  /** Texte narratif des beats. */
  beats: Array<{
    beatId: string;
    summary?: string | null;
    whyThisBeatExists?: string | null;
    dramaticChange?: string | null;
    characters?: string[];
    emotionKeywords?: string[];
  }>;
  /** Résumé du chapitre. */
  chapterSummary?: string | null;
  /** Intent utilisateur. */
  userIntent?: string | null;
  /** Dialogues existants. */
  dialogues?: Array<{ panelId: string; speaker: string; text: string }>;
  /** Personnages connus de l'utilisateur. */
  knownCharacters?: Array<{
    id: string;
    name: string;
    roleType?: string | null;
    description?: string | null;
  }>;
  /** Lieux connus de l'utilisateur. */
  knownLocations?: Array<{
    id: string;
    name: string;
    description?: string | null;
  }>;
  /** Production outline si disponible. */
  productionOutline?: ProductionOutline | null;
}

/**
 * Résultat du VisualDiscoveryPass.
 */
export interface VisualDiscoveryPassResult {
  contract: ChapterVisualDiscoveryContract;
  warnings: string[];
  stats: {
    charactersFound: number;
    locationsFound: number;
    sublocationsFound: number;
    vehiclesFound: number;
    npcGroupsFound: number;
    robotsFound: number;
    hybridsFound: number;
    creaturesFound: number;
    factionsFound: number;
    propsFound: number;
    forbiddenPropsStripped: number;
    rejectedCount: number;
  };
}
