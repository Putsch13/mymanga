import type { CharacterImportanceTier, RenderingMode } from "@manga-ai-studio/core";

export type ImageProviderId = "fal" | "bfl" | "runware" | "stability";

export type ImageWorkflow =
  | "txt2img"
  | "img2img"
  | "multi_ref"
  | "inpaint"
  | "controlnet"
  | "lora_stack";

export type ReferencePolicy = "NONE" | "LIGHT" | "STRONG";

export type FalPanelCategory =
  | "ESTABLISHING_ENVIRONMENT"
  | "CHARACTER_IN_SCENE"
  | "CHARACTER_LOCK"
  | "LOCAL_FIX";

export type RerollKind =
  | "REROLL_ENVIRONMENT"
  | "REROLL_CHARACTER_FIDELITY"
  | "REROLL_INTERACTION"
  | "REROLL_STYLE"
  | "REROLL_COMPOSITION";

export interface ImageRoutingDecision {
  provider: ImageProviderId;
  model: string;
  workflow: ImageWorkflow;
  reason: string;
  panelCategory?: FalPanelCategory;
  sceneArchetype?: string;
  referencePolicy?: ReferencePolicy;
  sceneComplexityScore?: number;
  environmentCritical?: boolean;
  continuityCritical?: boolean;
  crowdCritical?: boolean;
  interactionCritical?: boolean;
  retryPolicy?: "standard" | "robust";
  sizePreset?: string;
}

export interface LoraRef {
  /** URL des poids .safetensors hébergés (ex: fal.media) */
  url: string;
  /** Mot déclencheur à injecter dans le prompt */
  triggerWord: string;
  /** Poids du LoRA (0.5–1.0) */
  scale?: number;
}

export interface GenerateImageInput {
  mode: RenderingMode;
  positivePrompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  referenceImageUrls?: string[];
  maskUrl?: string;
  /** LoRA(s) à appliquer pour ce panel */
  loras?: LoraRef[];
  providerParams?: Record<string, unknown>;
}

export interface GenerateImageResult {
  imageUrl: string;
  provider: ImageProviderId;
  model: string;
  requestId?: string;
  jobId?: string;
  timings?: Record<string, unknown>;
  raw?: unknown;
  /**
   * Seed réellement utilisé par le provider. Critique pour la cohérence visuelle :
   * permet de reproduire une génération identique (même perso / même décor / même pose)
   * lors d'un retry ou d'une itération de reroll contrôlée.
   */
  seed?: number | null;
}

export interface ImageGenerationProvider {
  readonly id: ImageProviderId;
  generateImage(input: GenerateImageInput): Promise<GenerateImageResult>;
  editImage?(input: GenerateImageInput): Promise<GenerateImageResult>;
}

export interface RoutingContext {
  mode: RenderingMode;
  contentIntensityLayer: string;
  adultEngine?: "realistic" | "fantasy";
  isNewCharacter: boolean;
  hasCanonReferences: boolean;
  characterCountInScene: number;
  purpose?: string;
  npcCount?: number;
  creatureCount?: number;
  hasNpcGroup?: boolean;
  hasCreatureGroup?: boolean;
  shotType?: "wide" | "medium" | "closeup" | "extreme_closeup" | "over_shoulder";
  cameraAngle?: string;
  environmentPriority?: "low" | "medium" | "high";
  locationComplexity?: number;
  environmentDensityRequired?: "low" | "medium" | "high";
  continuityWeight?: number;
  scenePurpose?: string;
  styleBackgroundDensity?: string | null;
  styleReferenceRequired?: boolean;
  panelCharacterRoles?: string[];
  panelCharacterImportanceTiers?: CharacterImportanceTier[];
  heroPresent?: boolean;
  heroFocus?: boolean;
  needsInpaint: boolean;
  needsPoseVariation: boolean;
  preferPhotorealCover: boolean;
  explicitBlocked: boolean;
  goreStylizedMature: boolean;
  /** Profil look chapitre — utilisé pour filtrer les providers incompatibles */
  chapterLookProfileMode?: string | null;
  /** Type de beat — influence le routing */
  beatEventType?: string | null;
  /** Focus du panel depuis le blueprint premium ou shot-plan — prioritaire sur crowdCritical */
  subjectFocus?: "hero" | "npc" | "important_npc" | "enemy" | "antagonist" | "environment" | "group" | "prop" | "reaction" | "aftermath" | null;
  /**
   * Type de cutaway propagé depuis le panelContract (shot-plan). Un cutaway
   * explicite (environment, prop_insert, aftermath, reaction, crowd, ...) doit
   * primer sur toute déduction héros implicite. La valeur est une string libre
   * (non validée ici) — la normalisation canonique est faite par
   * `normalizeCutawayType` en amont.
   */
  cutawayType?: string | null;
  /**
   * P1.3 — Sujet dominant résolu à partir de `subjectFocus`, `cutawayType`,
   * du cast et du shotType. Source de vérité pour savoir sur quoi le panel
   * est réellement centré (sans biais héros implicite).
   */
  dominantSubject?: {
    kind:
      | "hero"
      | "enemy"
      | "ally"
      | "npc"
      | "group"
      | "guard_group"
      | "crowd"
      | "environment"
      | "prop"
      | "reaction"
      | "aftermath"
      | "none";
    characterIndex: number | null;
    characterTier:
      | "MAIN_HERO"
      | "SECONDARY_CORE"
      | "IMPORTANT_SUPPORTING_CHARACTER"
      | "RECURRING_NPC"
      | "BACKGROUND_EXTRA"
      | null;
    provenance: "explicit" | "inferred" | "default";
    reason: string;
  };
}
