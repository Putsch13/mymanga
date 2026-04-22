/**
 * ChapterStyleBible — référence stylistique stricte pour le rendu d'un
 * chapitre. Immuable dans le cadre d'un chapitre.
 *
 * Consommé par :
 *   - render-spec-builder (injection dans chaque PanelRenderSpec)
 *   - minimal-panel-prompt-builder (bloc "style")
 *   - panel-qa-pass (vérification de drift stylistique)
 *
 * Doit rester compact. Pas de prose, pas de mélange avec la narration.
 */

export type ChapterStylePalette =
  | "monochrome_ink"
  | "duotone_shadow"
  | "grayscale_screentone"
  | "color_selective"
  | "full_color_manga"
  | "color_limited_palette";

export type ChapterInkingStyle =
  | "sharp_clean_lines"
  | "rough_sketchy_lines"
  | "heavy_ink_weight"
  | "light_ink_weight"
  | "mixed_contrast";

export interface ChapterStyleBible {
  artStyle: string;
  toneKeywords: string[];
  palette: ChapterStylePalette;
  inking: ChapterInkingStyle;
  screentoneIntensity: "none" | "light" | "medium" | "heavy";
  lineWeightHint: "fine" | "medium" | "bold" | "variable";
  panelBorderStyle: "clean" | "rough" | "broken" | "none";
  backgroundDensity: "minimal" | "medium" | "detailed";
  referenceAuthors: string[];
  forbiddenStyleKeywords: string[];
  noTextInsideImage: boolean;
}

export function createDefaultChapterStyleBible(): ChapterStyleBible {
  return {
    artStyle: "modern seinen manga, black and white with screentones",
    toneKeywords: ["cinematic", "grounded", "expressive"],
    palette: "grayscale_screentone",
    inking: "sharp_clean_lines",
    screentoneIntensity: "medium",
    lineWeightHint: "variable",
    panelBorderStyle: "clean",
    backgroundDensity: "medium",
    referenceAuthors: [],
    forbiddenStyleKeywords: [
      "3d render",
      "photorealistic",
      "chibi",
      "disney",
      "watercolor",
      "oil painting",
    ],
    noTextInsideImage: true,
  };
}
