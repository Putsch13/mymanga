/**
 * Contrat visuel local au chapitre — cible pour une extraction IA
 * (`extractChapterVisualContract`) : chaque entité doit citer ses beats sources.
 * Le pipeline actuel s’appuie encore sur des heuristiques + `sanitizeVisualContractBeforeCoverage`.
 */

export type ChapterVisualEntityImportance = "required" | "optional" | "ambient";

export interface ChapterVisualContractLocationSlice {
  name: string;
  description: string;
  confidence: number;
  sourceBeatIds: string[];
  importance: ChapterVisualEntityImportance;
}

export interface ChapterVisualContractCharacterSlice {
  name: string;
  role: "main" | "secondary" | "npc" | "unknown";
  knownCharacterId?: string;
  confidence: number;
  sourceBeatIds: string[];
  importance: ChapterVisualEntityImportance;
}

export interface ChapterVisualContractGroupSlice {
  name: string;
  kind: "npc_group" | "species" | "crowd" | "faction";
  description: string;
  confidence: number;
  sourceBeatIds: string[];
  importance: ChapterVisualEntityImportance;
}

export interface ChapterVisualContractCreatureSlice {
  name: string;
  kind: "monster" | "hybrid" | "robot" | "animal" | "spirit" | "unknown";
  description: string;
  confidence: number;
  sourceBeatIds: string[];
  importance: ChapterVisualEntityImportance;
}

export interface ChapterVisualContractPropSlice {
  name: string;
  description: string;
  importance: ChapterVisualEntityImportance;
  confidence: number;
  sourceBeatIds: string[];
}

export interface ChapterVisualContractRejectedSlice {
  name: string;
  reason: string;
}

export interface ChapterVisualContract {
  mainLocation: ChapterVisualContractLocationSlice | null;
  secondaryLocations: ChapterVisualContractLocationSlice[];
  characters: ChapterVisualContractCharacterSlice[];
  groups: ChapterVisualContractGroupSlice[];
  creatures: ChapterVisualContractCreatureSlice[];
  props: ChapterVisualContractPropSlice[];
  ambientElements: ChapterVisualContractPropSlice[];
  rejectedOrUnrelated: ChapterVisualContractRejectedSlice[];
  needsClarification?: boolean;
}
