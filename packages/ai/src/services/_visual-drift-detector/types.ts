import type { ChapterLookProfile } from "@manga-ai-studio/core";

export interface CharacterDriftInput {
  name: string;
  gender: string | null;
  hairColor: string | null;
  eyeColor: string | null;
  bodyDetails: string | null;
  appearance: string | null;
  outfitDefault?: string | null;
  wardrobeDetails?: string | null;
  canonSignatureText?: string | null;
  forbiddenVisualDrift?: string[] | null;
  canonicalReferenceAvailable?: boolean;
  paletteSignature?: string | null;
  accessorySignature?: string | null;
  /** Traits durs non négociables — leur absence = character_reroll */
  hardTraits?: string[] | null;
  /** Traits souples */
  softTraits?: string[] | null;
}

export interface DriftCheckInput {
  prompt: string;
  characters: CharacterDriftInput[];
  usedLoras: boolean;
  usedRefs: boolean;
  /** Type de beat narratif de la scène — permet de moduler les pénalités (ex: aftermath tolère les silhouettes) */
  beatEventType?: string | null;
  /** Catégorie de panel — ESTABLISHING_ENVIRONMENT réduit les pénalités de drift personnage */
  panelCategory?: string | null;
  /** Profil look chapitre autoritaire — permet de détecter le style mismatch */
  chapterLookProfile?: ChapterLookProfile | null;
  /** Ancre spatiale de la scène */
  sceneAnchor?: {
    castLineup: string[];
    spatialLayout: string;
    dominantLocation: string;
    characterPositions: Record<string, string>;
  } | null;
  /** Carte d'intention visuelle */
  intentCard?: {
    beatEventType: string;
    motionLevel: number;
    actionIntensity: number;
    mustShow: string[];
    sfxForbiddenTypes?: string[];
  } | null;
}

export type DriftSeverity = "none" | "low" | "medium" | "high" | "critical";

/**
 * Action recommandée après analyse de drift.
 * - keep: aucune action requise, le panel est cohérent
 * - soft_reroll: reroll léger avec lock personnage conservé (LIGHT policy)
 * - character_reroll: reroll ciblé sur le personnage (STRONG policy)
 * - style_reroll: reroll ciblé sur le style (look profile mismatch)
 * - full_reroll: reroll complet nécessaire (trop de conflits)
 * - flag_for_review: signaler en review sans reroll automatique
 */
export type DriftRecommendedAction =
  | "keep"
  | "soft_reroll"
  | "character_reroll"
  | "style_reroll"
  | "full_reroll"
  | "flag_for_review";

export interface DriftTraitMismatch {
  characterName: string;
  trait: string;
  expected: string;
  actual?: string | null;
  reason: string;
}

export interface DriftCheckResult {
  score: number;
  driftScore: number;
  styleDriftScore: number;
  characterDriftScore: number;
  beatAlignmentScore: number;
  sceneContinuityScore: number;
  pass: boolean;
  severity: DriftSeverity;
  chapterLookMismatch: boolean;
  issues: string[];
  reasons: string[];
  missingTraits: DriftTraitMismatch[];
  conflictingTraits: DriftTraitMismatch[];
  recommendedAction: DriftRecommendedAction;
  confidence: number;
  continuityRisk: boolean;
}
