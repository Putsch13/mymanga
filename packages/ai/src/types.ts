import type { RenderingMode } from "@manga-ai-studio/core";

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
  raw?: unknown;
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
  needsInpaint: boolean;
  needsPoseVariation: boolean;
  preferPhotorealCover: boolean;
  explicitBlocked: boolean;
  goreStylizedMature: boolean;
}
