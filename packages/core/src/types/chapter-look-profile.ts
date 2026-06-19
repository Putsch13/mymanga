/**
 * ChapterLookProfile — profil visuel autoritaire d'un chapitre.
 * Source de vérité unique pour la famille visuelle : interdit les mélanges implicites.
 * Passé à : SceneBlueprintInput, PanelPromptInput, RoutingContext, DriftCheckInput.
 */

export type ChapterLookMode =
  | "premium_manga_bw"
  | "premium_manga_color"
  | "anime_cel_shaded_consistent";

export interface ChapterLookProfile {
  id: string;
  mode: ChapterLookMode;
  renderMode: string;
  styleFamily: string;
  lineStyle: string;
  shadingStyle: string;
  anatomyStyle: string;
  colorDiscipline: string;
  backgroundDensity: "sparse" | "medium" | "rich";
  textureDiscipline: string;
  faceRenderingStyle: string;
  sfxStyle: string;
  cameraLanguage: string;
  actionLanguage: string;
  romanceLanguage: string;
  /** Familles visuelles incompatibles — interdit le mélange dans un même chapitre */
  incompatibleFamilies: string[];
  /** Capacités provider requises pour respecter ce look */
  providerCapabilityRequired: string[];
}

/** 3 profils premium prédéfinis */
export const CHAPTER_LOOK_PROFILES: Record<ChapterLookMode, Omit<ChapterLookProfile, "id">> = {
  premium_manga_bw: {
    mode: "premium_manga_bw",
    renderMode: "ink_lineart",
    styleFamily: "manga_bw",
    lineStyle: "clean ink lines, variable weight, expressive hatching",
    shadingStyle: "cel shading with ink hatching, no gradients",
    anatomyStyle: "manga proportions, expressive faces, dynamic poses",
    colorDiscipline: "black and white only, no color fills",
    backgroundDensity: "rich",
    textureDiscipline: "screen tones, cross-hatching, speed lines",
    faceRenderingStyle: "manga face canon: large expressive eyes, clean linework",
    sfxStyle: "bold manga SFX lettering integrated into panels",
    cameraLanguage: "dynamic angles, dutch tilts for tension, wide for establishing",
    actionLanguage: "speed lines, impact bursts, motion blur arcs",
    romanceLanguage: "soft screentones, floral overlays, intimate framing",
    incompatibleFamilies: ["photorealistic", "anime_tv_color", "semi_realistic", "cyberpunk_neon"],
    providerCapabilityRequired: ["manga_style", "lineart"],
  },
  premium_manga_color: {
    mode: "premium_manga_color",
    renderMode: "colored_manga",
    styleFamily: "manga_color",
    lineStyle: "clean ink lines with color fills",
    shadingStyle: "flat cel shading with soft gradients on key panels",
    anatomyStyle: "manga proportions, expressive faces, dynamic poses",
    colorDiscipline: "limited palette per scene, consistent color coding per character",
    backgroundDensity: "rich",
    textureDiscipline: "minimal texture, clean color blocks",
    faceRenderingStyle: "manga face canon: large expressive eyes, colored iris",
    sfxStyle: "colored manga SFX lettering",
    cameraLanguage: "dynamic angles, color emphasis for emotional beats",
    actionLanguage: "speed lines, colored impact bursts, energy auras",
    romanceLanguage: "warm palette, soft bokeh, pastel overlays",
    incompatibleFamilies: ["photorealistic", "semi_realistic", "cyberpunk_neon", "manga_bw"],
    providerCapabilityRequired: ["manga_style", "color_consistency"],
  },
  anime_cel_shaded_consistent: {
    mode: "anime_cel_shaded_consistent",
    renderMode: "anime_cel",
    styleFamily: "anime_cel",
    lineStyle: "clean anime outlines, consistent weight",
    shadingStyle: "hard cel shading, anime highlight style",
    anatomyStyle: "anime proportions, large eyes, stylized features",
    colorDiscipline: "vibrant consistent palette, character color coding strict",
    backgroundDensity: "medium",
    textureDiscipline: "smooth fills, minimal texture",
    faceRenderingStyle: "anime face: large eyes, small nose, expressive mouth",
    sfxStyle: "anime-style SFX overlays",
    cameraLanguage: "standard anime framing, reaction shots, wide establishing",
    actionLanguage: "anime speed lines, flash frames, impact frames",
    romanceLanguage: "sparkle overlays, soft focus, warm lighting",
    incompatibleFamilies: ["photorealistic", "manga_bw", "semi_realistic"],
    providerCapabilityRequired: ["anime_style", "cel_shading"],
  },
};

/** Résoudre le look profile depuis un mode ou retourner le défaut */
export function resolveChapterLookProfile(
  mode: ChapterLookMode | null | undefined,
  customId?: string,
): ChapterLookProfile {
  const effectiveMode: ChapterLookMode = mode ?? "premium_manga_bw";
  return {
    id: customId ?? effectiveMode,
    ...CHAPTER_LOOK_PROFILES[effectiveMode],
  };
}

/** Construire le bloc prompt depuis le look profile */
export function buildLookProfilePromptBlock(profile: ChapterLookProfile): string {
  return [
    `Style: ${profile.styleFamily}, ${profile.lineStyle}`,
    `Shading: ${profile.shadingStyle}`,
    `Anatomy: ${profile.anatomyStyle}`,
    `Face: ${profile.faceRenderingStyle}`,
    `Action: ${profile.actionLanguage}`,
  ].join(". ");
}

/** Construire le bloc négatif depuis le look profile */
export function buildLookProfileNegativeBlock(profile: ChapterLookProfile): string {
  return profile.incompatibleFamilies.join(", ");
}
