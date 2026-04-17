/**
 * P1-4 — Source of truth unique pour les layouts de page manga.
 *
 * Avant : `packages/ai/.../page-layout-engine.ts` contenait les configs CSS,
 * ET `apps/web/components/manga/manga-page-grid.tsx` les redéfinissait en
 * local (commentaire original : "évite d'importer @manga-ai-studio/ai côté
 * client"). Résultat : les deux copies ont dérivé (areas/weights/ratios
 * n'étaient que dans ai, pas côté client, et rien ne garantissait qu'un
 * nouveau template ajouté côté serveur atteindrait le client).
 *
 * Ici on place uniquement les DONNÉES de layout (pas de logique AI), dans
 * `@manga-ai-studio/core` qui est le seul package déjà importé dans les
 * composants client. Les deux côtés partagent donc désormais la même table.
 */

export type PageLayoutTemplate =
  | "splash"           // 1 panel pleine page — beat révélation, ouverture chapitre
  | "double_spread"    // 2 panels sur double page — action climax
  | "grid_2x2"         // 4 panels égaux — dialogue posé
  | "grid_2x3"         // 6 panels — rythme standard
  | "action_strip"     // 1 grand + 4 petits en strip — combat
  | "asymmetric_hero"  // 1 grand gauche + 2 petits droite — focus héros
  | "cinematic_bar"    // 3 panels horizontaux panoramiques — paysage / révélation lieu
  | "focus_closeup"    // 1 très grand + 2 petits réaction — émotion
  | "montage_rapid"    // 8 petits panels — flash-back / time-lapse
  | "vertical_strip";  // 3 panels verticaux — chase / chute

export interface PageLayoutConfig {
  cssGridTemplate: string;
  cssGridAreas: string;
  areas: string[];
  panelWeights: number[];
  defaultAspectRatios: string[];
}

export const PAGE_LAYOUT_CONFIGS: Record<PageLayoutTemplate, PageLayoutConfig> = {
  splash: {
    cssGridTemplate: "1fr",
    cssGridAreas: `"a"`,
    areas: ["a"],
    panelWeights: [1],
    defaultAspectRatios: ["3:4"],
  },
  double_spread: {
    cssGridTemplate: "1fr 1fr",
    cssGridAreas: `"a b"`,
    areas: ["a", "b"],
    panelWeights: [0.5, 0.5],
    defaultAspectRatios: ["3:4", "3:4"],
  },
  grid_2x2: {
    cssGridTemplate: "1fr 1fr / 1fr 1fr",
    cssGridAreas: `"a b" "c d"`,
    areas: ["a", "b", "c", "d"],
    panelWeights: [0.25, 0.25, 0.25, 0.25],
    defaultAspectRatios: ["1:1", "1:1", "1:1", "1:1"],
  },
  grid_2x3: {
    cssGridTemplate: "1fr 1fr / 1fr 1fr 1fr",
    cssGridAreas: `"a b c" "d e f"`,
    areas: ["a", "b", "c", "d", "e", "f"],
    panelWeights: [0.167, 0.167, 0.167, 0.167, 0.167, 0.167],
    defaultAspectRatios: ["3:4", "3:4", "3:4", "3:4", "3:4", "3:4"],
  },
  action_strip: {
    cssGridTemplate: "1.5fr 1fr 1fr / 1fr 1fr 1fr",
    cssGridAreas: `"a a b" "a a c" "d e f"`,
    areas: ["a", "b", "c", "d", "e", "f"],
    panelWeights: [0.40, 0.15, 0.15, 0.10, 0.10, 0.10],
    defaultAspectRatios: ["4:3", "3:4", "3:4", "1:1", "1:1", "1:1"],
  },
  asymmetric_hero: {
    cssGridTemplate: "1.2fr 1fr / 1fr 1fr 1fr",
    cssGridAreas: `"a a b" "a a c"`,
    areas: ["a", "b", "c"],
    panelWeights: [0.50, 0.25, 0.25],
    defaultAspectRatios: ["3:4", "1:1", "1:1"],
  },
  cinematic_bar: {
    cssGridTemplate: "1fr 1fr 1fr / 1fr",
    cssGridAreas: `"a" "b" "c"`,
    areas: ["a", "b", "c"],
    panelWeights: [0.33, 0.34, 0.33],
    defaultAspectRatios: ["16:9", "16:9", "16:9"],
  },
  focus_closeup: {
    cssGridTemplate: "1.5fr 1fr / 1fr 1fr",
    cssGridAreas: `"a a" "b c"`,
    areas: ["a", "b", "c"],
    panelWeights: [0.60, 0.20, 0.20],
    defaultAspectRatios: ["2:1", "1:1", "1:1"],
  },
  montage_rapid: {
    cssGridTemplate: "1fr 1fr / 1fr 1fr 1fr 1fr",
    cssGridAreas: `"a b c d" "e f g h"`,
    areas: ["a", "b", "c", "d", "e", "f", "g", "h"],
    panelWeights: Array(8).fill(0.125),
    defaultAspectRatios: Array(8).fill("3:4"),
  },
  vertical_strip: {
    cssGridTemplate: "1fr / 1fr 1fr 1fr",
    cssGridAreas: `"a b c"`,
    areas: ["a", "b", "c"],
    panelWeights: [0.33, 0.34, 0.33],
    defaultAspectRatios: ["1:2", "1:2", "1:2"],
  },
};
