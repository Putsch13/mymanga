/**
 * Contrat visuel local au chapitre — cible pour une extraction IA
 * (`extractChapterVisualContract`) : chaque entité doit citer ses beats sources.
 * La couverture visuelle premium privilégie ce contrat (sections species / robots / hybrids / …) + sanitation optionnelle du plan brut selon la politique UI.
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
  /** Espèces / peuples non humains (section dédiée — en plus des `groups.kind=species`). */
  species: ChapterVisualContractCreatureSlice[];
  /** Entités mécaniques / IA visibles comme sujets. */
  robots: ChapterVisualContractCreatureSlice[];
  /** Chimères, demi-humains, créatures hybrides nommées. */
  hybrids: ChapterVisualContractCreatureSlice[];
  creatures: ChapterVisualContractCreatureSlice[];
  props: ChapterVisualContractPropSlice[];
  ambientElements: ChapterVisualContractPropSlice[];
  rejectedOrUnrelated: ChapterVisualContractRejectedSlice[];
  needsClarification?: boolean;
}
