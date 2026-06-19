import type { RenderingMode } from "@manga-ai-studio/core";

export type PremiumImagePresetMode = Extract<
  RenderingMode,
  "CHARACTER_SHEET" | "PANEL_DRAFT" | "PANEL_FINAL"
>;

export type ImageGenerationSize = {
  width: number;
  height: number;
  futureUpscaleTarget: {
    width: number;
    height: number;
  } | null;
};

export type FalImageSizePresetKey =
  | "character_ref"
  | "panel_story"
  | "panel_establishing"
  | "reroll_local"
  | "reroll_scene";

export const PREMIUM_IMAGE_SIZES: Record<PremiumImagePresetMode, ImageGenerationSize> = {
  CHARACTER_SHEET: {
    width: 768,
    height: 1024,
    futureUpscaleTarget: {
      width: 1536,
      height: 2048,
    },
  },
  PANEL_DRAFT: {
    width: 768,
    height: 1024,
    futureUpscaleTarget: {
      width: 1536,
      height: 2048,
    },
  },
  PANEL_FINAL: {
    width: 768,
    height: 1024,
    futureUpscaleTarget: {
      width: 1536,
      height: 2048,
    },
  },
};

export const FAL_IMAGE_SIZE_PRESETS: Record<FalImageSizePresetKey, { width: number; height: number }> = {
  character_ref: { width: 768, height: 1024 },
  panel_story: { width: 768, height: 1024 },
  panel_establishing: { width: 896, height: 1152 },
  reroll_local: { width: 768, height: 1024 },
  reroll_scene: { width: 896, height: 1152 },
};

export function getPremiumImageSize(mode: PremiumImagePresetMode): ImageGenerationSize {
  return PREMIUM_IMAGE_SIZES[mode];
}

export function resolvePremiumImageSize(
  mode: PremiumImagePresetMode,
  current?: { width?: number | null; height?: number | null },
): { width: number; height: number } {
  const preset = getPremiumImageSize(mode);
  return {
    width: current?.width && current.width > 0 ? current.width : preset.width,
    height: current?.height && current.height > 0 ? current.height : preset.height,
  };
}

export function getFalImageSizePreset(key: FalImageSizePresetKey) {
  return FAL_IMAGE_SIZE_PRESETS[key];
}
