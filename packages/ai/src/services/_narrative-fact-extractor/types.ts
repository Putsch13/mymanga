/**
 * Types publics du module narrative-fact-extractor.
 *
 * `NarrativeExtractionContext` est passé à toutes les fonctions d'inférence
 * pour conditionner la détection (genre, ton, antagonistes, inventaire…).
 */
import type {
  NarrativeFact,
  PresenceObligation,
} from "@manga-ai-studio/core";

export interface NarrativeExtractionContext {
  projectGenre?: string | null;
  projectTone?: string | null;
  universeType?: string | null;
  characterIds?: string[];
  heroCharacterId?: string | null;
  antagonistIds?: string[];
  antagonistNames?: string[];
  recentContinuityEvents?: Array<{
    eventType: string;
    summary: string | null;
    entities?: {
      objectsGained?: string[];
      objectsLost?: string[];
      locationChange?: string;
    };
  }>;
  characterInventories?: Record<
    string,
    { carried: string[]; equipped: string[] }
  >;
}

export interface ChapterBundleExtractionResult {
  facts: NarrativeFact[];
  storyObjects: string[];
  presenceObligations: PresenceObligation[];
  speakerAnchors: Array<{
    beatId: string;
    speakerCharacterId: string;
    visibilityRequirement: "required_visible" | "offscreen_allowed" | "narration_only";
  }>;
}
