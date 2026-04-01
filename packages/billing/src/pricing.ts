import type { RenderingMode } from "@manga-ai-studio/core";
import type { ImageProviderId } from "@manga-ai-studio/ai";

export type PricingKey =
  | `image:${RenderingMode}`
  | `image:provider:${ImageProviderId}`
  | "chapter:text"
  | "chapter:illustrated";

const BASE_IMAGE_BY_MODE: Record<RenderingMode, number> = {
  CHARACTER_SHEET: 50,
  CHARACTER_EXPRESSION_SET: 45,
  OUTFIT_VARIATION: 35,
  LOCATION_KEYFRAME: 30,
  PANEL_DRAFT: 20,
  PANEL_FINAL: 40,
  COVER_ART: 55,
  INPAINT_FIX: 25,
  POSE_LOCK_VARIATION: 30,
  STYLE_TRANSFER_VARIATION: 35,
};

const PROVIDER_MULTIPLIER: Record<ImageProviderId, number> = {
  fal: 1,
  bfl: 1.1,
  runware: 0.95,
  stability: 1.15,
};

export function estimateImageTokens(mode: RenderingMode, provider: ImageProviderId): number {
  const base = BASE_IMAGE_BY_MODE[mode] ?? 25;
  return Math.ceil(base * PROVIDER_MULTIPLIER[provider]);
}

export function estimateChapterTextTokens(): number {
  return 80;
}
