/**
 * DIFF-3 — Catalogue de style presets manga/BD prêts à l'emploi.
 *
 * Chaque preset fournit :
 *  - un `visualStyle` injecté dans le prompt positif via `resolveVisualStyle`,
 *  - des axes StylePack (anatomyBias, backgroundDensity, cameraLanguage),
 *  - des termes positifs/négatifs additionnels spécifiques au style,
 *  - des métadonnées UI (label FR, description courte, tags genre).
 *
 * Utilisé côté serveur pour pré-remplir un StylePack et côté client pour
 * présenter une galerie de presets dans le studio projet.
 */

export type StylePresetSlug =
  | "shonen_classic"
  | "shonen_modern"
  | "shojo_soft"
  | "shojo_dark"
  | "seinen_gritty"
  | "seinen_noir"
  | "cyberpunk_neon"
  | "post_apocalyptic"
  | "isekai_fantasy"
  | "mecha_industrial"
  | "slice_of_life"
  | "horror_body"
  | "sports_dynamic"
  | "historical_edo"
  | "webtoon_korean";

export interface StylePresetDefinition {
  slug: StylePresetSlug;
  label: string;
  description: string;
  tags: string[];
  /** Phrase injectée dans le prompt (positif). */
  visualStyle: string;
  /** Axes StylePack à appliquer si le projet ne les a pas déjà définis. */
  stylePackHints: {
    renderFamily?: "manga" | "comic" | "bd" | "webtoon" | "storybook";
    lineWeight?: "thin" | "medium" | "thick" | "variable";
    shadingMode?: "ink_bw" | "screentone" | "grayscale" | "flat_color" | "watercolor" | "cel_color";
    contrastProfile?: "soft" | "balanced" | "dramatic" | "high_contrast";
    anatomyBias?: "stylized" | "realistic" | "chibi" | "dynamic" | "grounded";
    backgroundDensity?: "minimal" | "medium" | "detailed" | "architectural";
    cameraLanguage?: "manga_dynamic" | "cinematic" | "static" | "webtoon_vertical" | "comic_grid";
  };
  /** Mots-clés additionnels pour renforcer le rendu. */
  positiveTerms: string[];
  /** Termes négatifs spécifiques (anti-photoréalisme, etc.). */
  negativeTerms: string[];
}

export const STYLE_PRESETS: Record<StylePresetSlug, StylePresetDefinition> = {
  shonen_classic: {
    slug: "shonen_classic",
    label: "Shonen classique",
    description: "Action nerveuse, contrastes forts, trames screentone, lignes dynamiques 90s/2000s.",
    tags: ["shonen", "action", "manga"],
    visualStyle:
      "classic 90s shonen manga art, clean inked lineart, screentone shading, dynamic speed lines, high-contrast black and white",
    stylePackHints: {
      renderFamily: "manga",
      lineWeight: "variable",
      shadingMode: "screentone",
      contrastProfile: "dramatic",
      anatomyBias: "dynamic",
      backgroundDensity: "medium",
      cameraLanguage: "manga_dynamic",
    },
    positiveTerms: ["screentone textures", "action speed lines", "bold inking", "classic shonen panel"],
    negativeTerms: ["photorealistic", "3d render", "muted colors", "washed out", "soft pastel"],
  },
  shonen_modern: {
    slug: "shonen_modern",
    label: "Shonen moderne",
    description: "Ligne claire moderne, trames digitales, rendu éditorial (Jump 2020+).",
    tags: ["shonen", "modern", "manga"],
    visualStyle:
      "modern shonen manga art 2020s, crisp digital inking, selective screentones, cinematic paneling, high dynamic range black and white",
    stylePackHints: {
      renderFamily: "manga",
      lineWeight: "medium",
      shadingMode: "screentone",
      contrastProfile: "high_contrast",
      anatomyBias: "dynamic",
      backgroundDensity: "detailed",
      cameraLanguage: "cinematic",
    },
    positiveTerms: ["digital inking", "selective detail", "high-key lighting", "sharp black and white manga"],
    negativeTerms: ["pencil sketch", "unfinished lines", "photorealistic", "3d render"],
  },
  shojo_soft: {
    slug: "shojo_soft",
    label: "Shojo doux",
    description: "Lignes fines, éclats floraux, décors oniriques, expressions tendres.",
    tags: ["shojo", "romance", "manga"],
    visualStyle:
      "soft shojo manga art, delicate thin linework, sparkling floral backgrounds, expressive dreamy eyes, light screentone",
    stylePackHints: {
      renderFamily: "manga",
      lineWeight: "thin",
      shadingMode: "screentone",
      contrastProfile: "soft",
      anatomyBias: "stylized",
      backgroundDensity: "medium",
      cameraLanguage: "manga_dynamic",
    },
    positiveTerms: ["delicate linework", "floral screentone", "tender expressions", "shojo sparkle overlay"],
    negativeTerms: ["aggressive shading", "grimdark", "photorealistic", "gore", "harsh contrast"],
  },
  shojo_dark: {
    slug: "shojo_dark",
    label: "Shojo sombre",
    description: "Shojo gothique, ambiances nocturnes, ligne fine + contraste profond.",
    tags: ["shojo", "gothic", "dark romance"],
    visualStyle:
      "dark shojo gothic manga art, fine elegant linework, moody chiaroscuro, nocturnal palette, melancholic composition",
    stylePackHints: {
      renderFamily: "manga",
      lineWeight: "thin",
      shadingMode: "ink_bw",
      contrastProfile: "dramatic",
      anatomyBias: "stylized",
      backgroundDensity: "medium",
      cameraLanguage: "cinematic",
    },
    positiveTerms: ["nocturnal mood", "gothic elegance", "chiaroscuro", "melancholic atmosphere"],
    negativeTerms: ["pastel kawaii", "photorealistic", "comedic", "bright saturated"],
  },
  seinen_gritty: {
    slug: "seinen_gritty",
    label: "Seinen âpre",
    description: "Traits grenus, ambiance adulte, violence contenue, décors urbains ancrés.",
    tags: ["seinen", "mature", "grounded"],
    visualStyle:
      "gritty seinen manga art, heavy inked linework, grounded stylised anatomy, grainy ink textures, mature storytelling composition",
    stylePackHints: {
      renderFamily: "manga",
      lineWeight: "thick",
      shadingMode: "ink_bw",
      contrastProfile: "dramatic",
      anatomyBias: "grounded",
      backgroundDensity: "detailed",
      cameraLanguage: "cinematic",
    },
    positiveTerms: ["grainy ink", "grounded realism", "urban density", "heavy shadows", "lived-in textures"],
    negativeTerms: ["chibi", "cute", "sparkle", "saturated cartoon colors", "photorealistic", "photograph"],
  },
  seinen_noir: {
    slug: "seinen_noir",
    label: "Noir (polar)",
    description: "Polar noir/roman graphique, chiaroscuro massif, blancs absents, atmosphère pluvieuse.",
    tags: ["noir", "detective", "seinen"],
    visualStyle:
      "noir detective manga, high-contrast chiaroscuro, grounded stylised anatomy, heavy black spotting, rain-soaked atmosphere, cinematic low-key lighting",
    stylePackHints: {
      renderFamily: "manga",
      lineWeight: "thick",
      shadingMode: "ink_bw",
      contrastProfile: "high_contrast",
      anatomyBias: "grounded",
      backgroundDensity: "architectural",
      cameraLanguage: "cinematic",
    },
    positiveTerms: ["heavy black spotting", "rain mood", "dramatic shadows", "film noir lighting"],
    negativeTerms: ["pastel", "cartoon", "chibi", "saturated", "sparkle", "photorealistic", "photograph"],
  },
  cyberpunk_neon: {
    slug: "cyberpunk_neon",
    label: "Cyberpunk néon",
    description: "Néons, pluie, HUD holographiques, megacity nocturne, esthétique tech-noir.",
    tags: ["cyberpunk", "sci-fi", "seinen"],
    visualStyle:
      "cyberpunk manga art, grounded stylised anatomy, neon-lit megacity, holographic hud accents, rain reflections, tech-noir atmosphere, heavy inking",
    stylePackHints: {
      renderFamily: "manga",
      lineWeight: "medium",
      shadingMode: "ink_bw",
      contrastProfile: "high_contrast",
      anatomyBias: "grounded",
      backgroundDensity: "architectural",
      cameraLanguage: "cinematic",
    },
    positiveTerms: ["neon signage", "holographic interfaces", "wet asphalt reflections", "megacity skyline"],
    negativeTerms: ["medieval", "rural", "pastoral", "chibi", "photorealistic", "photograph"],
  },
  post_apocalyptic: {
    slug: "post_apocalyptic",
    label: "Post-apocalyptique",
    description: "Ruines, poussière, lumière sableuse, silhouettes harassées, décors brisés.",
    tags: ["post-apo", "wasteland", "seinen"],
    visualStyle:
      "post-apocalyptic manga art, ruined cityscape, dusty haze, weathered textures, worn survivor silhouettes, ashen high-contrast inking",
    stylePackHints: {
      renderFamily: "manga",
      lineWeight: "thick",
      shadingMode: "ink_bw",
      contrastProfile: "dramatic",
      anatomyBias: "grounded",
      backgroundDensity: "detailed",
      cameraLanguage: "cinematic",
    },
    positiveTerms: ["ruined skyline", "dust particles", "weathered props", "ash haze"],
    negativeTerms: ["clean urban", "bright saturated", "cute"],
  },
  isekai_fantasy: {
    slug: "isekai_fantasy",
    label: "Isekai fantasy",
    description: "Décors fantastiques, lumière magique, armures/robes détaillées, ambiance épique.",
    tags: ["isekai", "fantasy", "shonen"],
    visualStyle:
      "isekai fantasy manga art, epic high-fantasy landscapes, magical light effects, detailed armor and robes, heroic composition",
    stylePackHints: {
      renderFamily: "manga",
      lineWeight: "medium",
      shadingMode: "screentone",
      contrastProfile: "dramatic",
      anatomyBias: "stylized",
      backgroundDensity: "architectural",
      cameraLanguage: "cinematic",
    },
    positiveTerms: ["magical aura", "epic vista", "elaborate armor details", "fantasy iconography"],
    negativeTerms: ["modern tech", "neon", "urban skyscrapers", "photorealistic"],
  },
  mecha_industrial: {
    slug: "mecha_industrial",
    label: "Mecha industriel",
    description: "Mechas, hangars, rivets, machinerie lourde, éclairage métallique.",
    tags: ["mecha", "sci-fi", "seinen"],
    visualStyle:
      "mecha industrial manga art, grounded stylised anatomy, detailed robot mechanical designs, heavy machinery hangars, metallic lighting, panel-line heavy inking",
    stylePackHints: {
      renderFamily: "manga",
      lineWeight: "thick",
      shadingMode: "ink_bw",
      contrastProfile: "high_contrast",
      anatomyBias: "grounded",
      backgroundDensity: "architectural",
      cameraLanguage: "manga_dynamic",
    },
    positiveTerms: ["panel lines", "rivets", "hydraulic joints", "mechanical detail density"],
    negativeTerms: ["organic soft", "chibi", "pastel", "photorealistic", "photograph"],
  },
  slice_of_life: {
    slug: "slice_of_life",
    label: "Tranche de vie",
    description: "Quotidien, lumière douce, trames légères, expressions calmes et authentiques.",
    tags: ["slice of life", "seinen", "shonen"],
    visualStyle:
      "slice-of-life manga art, warm everyday lighting, light screentones, gentle expressions, unhurried panel rhythm",
    stylePackHints: {
      renderFamily: "manga",
      lineWeight: "thin",
      shadingMode: "screentone",
      contrastProfile: "soft",
      anatomyBias: "stylized",
      backgroundDensity: "medium",
      cameraLanguage: "static",
    },
    positiveTerms: ["natural daylight", "casual poses", "light screentone", "subtle emotions"],
    negativeTerms: ["explosion", "battle", "gore", "cyberpunk"],
  },
  horror_body: {
    slug: "horror_body",
    label: "Horreur / Body-horror",
    description: "Horreur graphique, encrage dense, anatomies déformées stylisées, ambiances malsaines.",
    tags: ["horror", "seinen", "mature"],
    visualStyle:
      "horror body-horror manga art, dense ink hatching, grounded stylised distorted anatomy, unsettling atmospheric shadows, gritty textures",
    stylePackHints: {
      renderFamily: "manga",
      lineWeight: "thick",
      shadingMode: "ink_bw",
      contrastProfile: "high_contrast",
      anatomyBias: "grounded",
      backgroundDensity: "detailed",
      cameraLanguage: "cinematic",
    },
    positiveTerms: ["ink hatching", "eerie shadows", "oppressive atmosphere", "visceral detail"],
    negativeTerms: ["cute", "chibi", "sparkle", "romance comedy", "photorealistic", "photograph"],
  },
  sports_dynamic: {
    slug: "sports_dynamic",
    label: "Sports dynamique",
    description: "Mouvement extrême, lignes de vitesse, effort musculaire, cadrages bas.",
    tags: ["sports", "shonen", "action"],
    visualStyle:
      "dynamic sports manga art, extreme motion blur, speed lines, muscular effort details, low angle dramatic composition",
    stylePackHints: {
      renderFamily: "manga",
      lineWeight: "variable",
      shadingMode: "screentone",
      contrastProfile: "dramatic",
      anatomyBias: "dynamic",
      backgroundDensity: "minimal",
      cameraLanguage: "manga_dynamic",
    },
    positiveTerms: ["motion blur", "speed lines", "sweat drops", "impact frames"],
    negativeTerms: ["static", "passive", "chibi cute"],
  },
  historical_edo: {
    slug: "historical_edo",
    label: "Japon Edo historique",
    description: "Japon médiéval/Edo, kimonos, ukiyo-e, calligraphie, lumière de lanternes.",
    tags: ["historical", "edo", "seinen"],
    visualStyle:
      "historical edo-period manga art, kimono garments, ukiyo-e inspired linework, washi paper textures, lantern-lit scenes",
    stylePackHints: {
      renderFamily: "manga",
      lineWeight: "thin",
      shadingMode: "ink_bw",
      contrastProfile: "balanced",
      anatomyBias: "grounded",
      backgroundDensity: "architectural",
      cameraLanguage: "cinematic",
    },
    positiveTerms: ["kimono folds", "ukiyo-e inking", "washi texture", "lantern glow"],
    negativeTerms: ["modern tech", "neon", "skyscraper", "guns"],
  },
  webtoon_korean: {
    slug: "webtoon_korean",
    label: "Webtoon vertical",
    description: "Webtoon coréen, couleurs cel-shading, lecture verticale, cadrages larges panoramiques.",
    tags: ["webtoon", "korean", "color"],
    visualStyle:
      "korean webtoon art, clean digital color cel-shading, bright vibrant palette, vertical scroll composition, crisp lineart",
    stylePackHints: {
      renderFamily: "webtoon",
      lineWeight: "medium",
      shadingMode: "cel_color",
      contrastProfile: "balanced",
      anatomyBias: "stylized",
      backgroundDensity: "medium",
      cameraLanguage: "webtoon_vertical",
    },
    positiveTerms: ["cel shading", "digital color", "vertical scroll panels", "vibrant highlights"],
    negativeTerms: ["screentone black and white", "dense cross-hatching", "pencil sketch"],
  },
};

/**
 * Liste triée pour consommation UI.
 */
export const STYLE_PRESET_LIST: StylePresetDefinition[] = Object.values(STYLE_PRESETS);

export function getStylePreset(slug: string | null | undefined): StylePresetDefinition | null {
  if (!slug) return null;
  const normalized = slug as StylePresetSlug;
  return STYLE_PRESETS[normalized] ?? null;
}

/**
 * Construit une entrée `StylePackRef` (pour le prompt composer) à partir d'un preset.
 * N'écrase rien côté DB : c'est un hint consommé par `resolveVisualStyle`.
 */
export function stylePackFromPreset(slug: string | null | undefined) {
  const preset = getStylePreset(slug);
  if (!preset) return null;
  return {
    name: preset.label,
    description: preset.description,
    visualStyle: preset.visualStyle,
    anatomyBias: preset.stylePackHints.anatomyBias ?? null,
    backgroundDensity: preset.stylePackHints.backgroundDensity ?? null,
    cameraLanguage: preset.stylePackHints.cameraLanguage ?? null,
  };
}

/**
 * Retourne les termes additionnels (positifs/négatifs) d'un preset.
 * À fusionner dans le prompt final par la couche qui connaît le preset choisi.
 */
export function stylePresetExtraTerms(slug: string | null | undefined): {
  positive: string[];
  negative: string[];
} {
  const preset = getStylePreset(slug);
  if (!preset) return { positive: [], negative: [] };
  return { positive: preset.positiveTerms, negative: preset.negativeTerms };
}
