import type { RenderingMode } from "@manga-ai-studio/core";

export type ImageProviderId = "fal" | "bfl" | "runware" | "stability";

export type ImageWorkflow =
  | "txt2img"
  | "img2img"
  | "multi_ref"
  | "inpaint"
  | "controlnet"
  | "lora_stack";

export interface ImageRoutingDecision {
  provider: ImageProviderId;
  model: string;
  workflow: ImageWorkflow;
  reason: string;
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
  isNewCharacter: boolean;
  hasCanonReferences: boolean;
  characterCountInScene: number;
  needsInpaint: boolean;
  needsPoseVariation: boolean;
  preferPhotorealCover: boolean;
  explicitBlocked: boolean;
  goreStylizedMature: boolean;
}
