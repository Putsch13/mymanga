/**
 * Types partagés pour les inputs des passes du pipeline.
 *
 * Pourquoi : `narrative-pass.ts` et `image-generation-pass.ts` recevaient leurs
 * inputs en `any` (commentaire G03 dans narrative-pass.ts : "input types remain
 * any[] pending Prisma import refactor (tech debt)"). Résultat : 56 `any` dans ces 2 fichiers.
 *
 * Ce fichier expose les types unifiés. Les passes les importent au lieu de
 * déclarer `chapter: any, project: any, rawCharacters: any[]`.
 *
 * Source d'autorité : `RunPremiumV3PipelineInput` dans `run-premium-v3-pipeline.ts`.
 * Pour rester cohérent, on réexporte les types canoniques quand ils existent
 * déjà ailleurs, et on définit ici uniquement ce qui manque.
 */

import type { Prisma } from "@manga-ai-studio/db";
import type {
  PremiumV3PipelineCharacter,
} from "../run-premium-v3-pipeline";

/* ============================================================================
 * Personnages
 * ========================================================================== */

/**
 * Personnage "raw" tel que reçu par les passes du pipeline.
 *
 * Aligné sur `PremiumV3PipelineCharacter` mais accepte des champs supplémentaires
 * qui peuvent provenir directement de Prisma sans être projetés (ex.
 * `voiceRegister`, `biography`, etc.).
 */
export type PassRawCharacter = PremiumV3PipelineCharacter & {
  // Champs Prisma supplémentaires souvent lus par les passes
  age?: number | null;
  biography?: string | null;
  appearance?: string | null;
  outfitDefault?: string | null;
  voiceRegister?: string | null;
  voiceVocabularyStyle?: string | null;
  voiceSentenceLength?: string | null;
  voiceFavoriteExpressions?: string[] | null;
  voiceForbiddenExpressions?: string[] | null;
  traits?: string[] | null;
  flaws?: string[] | null;
  gender?: string | null;
  objective?: string | null;
  fear?: string | null;
  trauma?: string | null;
  // Champs utilisés par image-generation-pass
  bodyDetails?: string | null;
  wardrobeDetails?: string | null;
  /** StableImageReference or legacy URL string */
  canonicalReference?: unknown;
  canonicalImageUrl?: string | null;
  recurrencePolicy?: string | null;
  faceCloseupReference?: unknown;
  entityKind?: string | null;
  speciesLabel?: string | null;
  visualSignatureText?: string | null;
  // Profils structurés (JSON Prisma)
  visualProfile?: Record<string, unknown> | null;
  bodyState?: Record<string, unknown> | null;
  wardrobeProfile?: Record<string, unknown> | null;
  speechProfile?: Record<string, unknown> | null;
  continuityProfile?: Record<string, unknown> | null;
  characterFingerprint?: Record<string, unknown> | null;
  /** Échappatoire pour champs additionnels Prisma. */
  [extraKey: string]: unknown;
};

/* ============================================================================
 * Style packs / LoRA
 * ========================================================================== */

export interface PassStylePack {
  id: string;
  name?: string;
  modelUrl?: string;
  triggerWord?: string;
  scale?: number;
  category?: string;
  renderFamily?: string;
  cameraLanguage?: string;
  backgroundDensity?: string;
  lineWeight?: string;
  shadingMode?: string;
  contrastProfile?: string;
  anatomyBias?: string;
  negativeConstraints?: string[];
  /** Champs Prisma additionnels qu'on peut traverser sans typer strictement. */
  metadata?: Prisma.JsonValue;
  [extraKey: string]: unknown;
}

export interface PassLoraAttachment {
  id: string;
  characterId?: string | null;
  modelUrl?: string;
  triggerWord?: string | null;
  scale?: number | null;
  category?: string | null;
  enabled: boolean;
  weight: number;
  lora: {
    name: string;
    status: string;
    weightsMeta: Record<string, unknown>;
  };
  /** Échappatoire pour champs additionnels. */
  [extraKey: string]: unknown;
}

/* ============================================================================
 * Chapter / Project (slices nécessaires aux passes)
 * ========================================================================== */

/**
 * Slice du chapitre lu par les passes.
 *
 * Tous les champs sont optional/nullable parce que chaque pass n'utilise qu'un
 * sous-ensemble. Si une pass a besoin d'un champ non-nullable, elle le narrow
 * elle-même.
 */
export interface PassChapter {
  id: string;
  projectId: string;
  chapterNumber: number;
  title?: string | null;
  userIntent?: string | null;
  summary?: string | null;
  outline?: Prisma.JsonValue | null;
  contentRating?: string | null;
  focusCharacterIds?: string[] | null;
  minimumImages?: number | null;
  /** Échappatoire pour les champs Prisma non encore explicitement typés. */
  [extraKey: string]: unknown;
}

export interface PassProject {
  id: string;
  title?: string | null;
  primaryGenre?: string | null;
  tone?: string | null;
  visualStyle?: string | null;
  contentRating?: string | null;
  format?: string | null;
  /** Échappatoire pour les champs Prisma non encore typés explicitement. */
  [extraKey: string]: unknown;
}

export interface PassJob {
  id: string;
  status?: string | null;
  chapterId?: string | null;
  /** Échappatoire. */
  [extraKey: string]: unknown;
}

/* ============================================================================
 * NPCs / Props / blueprints
 * ========================================================================== */

export interface PassNpcProfile {
  id: string;
  name?: string | null;
  label?: string | null;
  groupKey?: string | null;
  shortVisualCore?: string | null;
  outfitSignature?: string | null;
  isGroup?: boolean | null;
  importanceLevel?: string | number | null;
  appearanceCount?: number | null;
  /** Échappatoire pour champs additionnels. */
  [extraKey: string]: unknown;
}

export interface PassPropInventoryItem {
  id: string;
  name?: string | null;
  category?: string | null;
  description?: string | null;
  characterId?: string | null;
  visualDescription?: string | null;
  propCanonicalName?: string | null;
  /** Échappatoire pour champs additionnels. */
  [extraKey: string]: unknown;
}

/**
 * Blueprint de panel premium tel que consommé par les passes après le
 * storyboard. Riche : on accepte des champs additionnels.
 */
export interface PassPanelBlueprint {
  panelId: string;
  beatId?: string | null;
  pageNumber?: number | null;
  panelNumber?: number | null;
  characters?: string[] | null;
  description?: string | null;
  cameraAngle?: string | null;
  emotionalDelta?: number | null;
  servedEventIds?: string[] | null;
  forbiddenVisualDrift?: string[] | null;
  /** Échappatoire pour les multiples champs additionnels du blueprint. */
  [extraKey: string]: unknown;
}

export interface PassPlannedImage {
  id?: string | null;
  panelId?: string | null;
  sceneImageId?: string | null;
  sceneIndex?: number | null;
  baseMetadata?: { panelId?: string | null; beatId?: string | null; [k: string]: unknown } | null;
  panel?: {
    characters?: string[];
    [k: string]: unknown;
  } | null;
  [extraKey: string]: unknown;
}

/* ============================================================================
 * Style / look profile / controls
 * ========================================================================== */

export interface PassChapterLookProfile {
  mode: string;
  primaryLora?: string;
  secondaryLoras?: string[];
  paletteSeed?: string;
  lighting?: string;
  /** Échappatoire. */
  [extraKey: string]: unknown;
}

export interface PassEffectiveCreativeControls {
  shotDiversity?: string;
  rhythmPreference?: string;
  intensityCap?: number;
  noveltyLevel?: number;
  worldStrictness?: number;
  visualExoticism?: number;
  npcVariety?: number;
  environmentRichness?: number;
  /** Échappatoire. */
  [extraKey: string]: unknown;
}

export interface PassAdultEngineDescriptor {
  enabled: boolean;
  level?: string | null;
  policy?: string | null;
  /** Échappatoire. */
  [extraKey: string]: unknown;
}

/* ============================================================================
 * Bundle / context / studio snapshot
 * ========================================================================== */

export interface PassRevisedBundle {
  outline: {
    chapter_title?: string;
    cliffhanger?: string;
    [k: string]: unknown;
  };
  memory: {
    narrativeSummary: string;
    [k: string]: unknown;
  };
  scenes?: Array<{
    location?: string;
    characters?: string[];
    summary?: string;
    [k: string]: unknown;
  }>;
  [extraKey: string]: unknown;
}

export interface PassRenderContext {
  jobId?: string;
  runId?: string;
  project?: {
    tone?: string;
    primaryGenre?: string;
    visualStyle?: string;
    [k: string]: unknown;
  };
  /** Échappatoire. */
  [extraKey: string]: unknown;
}

export type PassStudioSnapshot = Prisma.JsonValue;

/* ============================================================================
 * Visual world / discovery
 * ========================================================================== */

export interface PassVisualDiscoveryInput {
  chapterId: string;
  projectId: string;
  userIntent: string;
  knownLocations?: string[];
  knownCharacters?: string[];
  /** Échappatoire pour champs additionnels. */
  [extraKey: string]: unknown;
}

/* ============================================================================
 * Aides communes
 * ========================================================================== */

/**
 * Char-ref utilisé dans les prompts. Sortie de `buildCharacterRefs` etc.
 * Compatible avec StableImageReference pour les cas où les deux sont utilisés.
 */
export interface PassCharacterRef {
  id?: string | null;
  characterId?: string | null;
  url?: string | null;
  resolvedUrl?: string | null;
  type?: string | null;
  sourceType?: string | null;
  sourceUrl?: string | null;
  publicUrl?: string | null;
  signedUrl?: string | null;
  falCdnUrl?: string | null;
  /** Échappatoire pour champs additionnels. */
  [extraKey: string]: unknown;
}

/**
 * LoRA utilisée pour un panel.
 */
export interface PassPanelLora {
  url: string;
  triggerWord?: string | null;
  scale?: number | null;
  /** Échappatoire pour champs additionnels. */
  [extraKey: string]: unknown;
}
