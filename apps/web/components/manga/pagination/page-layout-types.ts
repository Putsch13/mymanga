/**
 * Sprint 1 — Reader refacto
 *
 * Types des layouts manga supportés par le pagination engine.
 *
 * Source de vérité CSS : `packages/core/src/types/page-layout-configs.ts`
 * (`PAGE_LAYOUT_CONFIGS`). On ne redéfinit PAS les grids ici — on se
 * contente de référencer les IDs.
 *
 * Attention : tous les templates de `PAGE_LAYOUT_CONFIGS` ne sont pas
 * utilisables par le moteur (par ex. `montage_rapid` = 8 slots, hors scope
 * Sprint 1 qui plafonne à 6 panels/page). On liste explicitement ceux qu'on
 * sait piloter.
 */

import type { PageLayoutTemplate } from "@manga-ai-studio/core";

export type MangaPageLayoutId = Extract<
  PageLayoutTemplate,
  | "splash"
  | "double_spread"
  | "grid_2x2"
  | "grid_2x3"
  | "action_strip"
  | "asymmetric_hero"
  | "cinematic_bar"
  | "focus_closeup"
  | "vertical_strip"
  // Phase 4 — native 5-panel layouts
  | "grid_1_2_2"
  | "hero_top_2_2"
  | "2_1_2_dialogue"
  | "staggered_5"
  | "vertical_hero_4"
>;

/** Nombre de slots supporté par chaque layout (aligné sur PAGE_LAYOUT_CONFIGS). */
export const LAYOUT_SLOT_COUNT: Record<MangaPageLayoutId, number> = {
  splash: 1,
  double_spread: 2,
  cinematic_bar: 3,
  vertical_strip: 3,
  asymmetric_hero: 3,
  focus_closeup: 3,
  grid_2x2: 4,
  grid_2x3: 6,
  action_strip: 6,
  // Phase 4 — 5-panel layouts
  grid_1_2_2: 5,
  hero_top_2_2: 5,
  "2_1_2_dialogue": 5,
  staggered_5: 5,
  vertical_hero_4: 5,
};
