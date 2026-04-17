import { z } from "zod";

export const panelShotPlanSchema = z.object({
  panelNumber: z.number(),
  shotType: z.enum(["wide", "establishing", "medium", "closeup", "extreme_closeup", "over_shoulder"]),
  cameraAngle: z.enum(["eye_level", "low", "high", "dutch", "worm", "birds_eye"]),
  subjectFocus: z.enum(["hero", "antagonist", "important_npc", "group", "environment", "prop", "reaction"]),
  cutawayType: z.enum(["none", "hands", "eyes", "object", "landscape", "crowd_reaction"]),
  heroCenterAllowed: z.boolean(),
  transitionFromPrevious: z.enum(["moment_to_moment", "action_to_action", "subject_to_subject", "scene_to_scene", "aspect_to_aspect"]),
  emphasisReason: z.string().nullable(),
});
export type PanelShotPlan = z.infer<typeof panelShotPlanSchema>;

// BUG-17 fix : le vocabulaire template du ShotPlan est désormais aligné sur celui
// du reader (`PAGE_LAYOUT_CONFIGS` dans apps/web/components/manga/manga-page-grid.tsx
// et `PageLayoutTemplate` dans packages/ai/src/services/page-layout-engine.ts).
// Avant : le ShotPlan émettait "grid_4"/"grid_6"/"asymmetric"/"double_page" qui
// n'étaient reconnus par aucun des deux consommateurs → le `pageLayoutTemplate`
// persisté en DB ne matchait aucune config reader → fallback silencieux sur
// les layouts legacy A-F, rendant le LayoutEngine inutile.
export const pageShotPlanSchema = z.object({
  pageNumber: z.number(),
  template: z.enum([
    "splash",
    "double_spread",
    "grid_2x2",
    "grid_2x3",
    "asymmetric_hero",
    "vertical_strip",
    "action_strip",
    "cinematic_bar",
    "focus_closeup",
    "montage_rapid",
  ]),
  panels: z.array(panelShotPlanSchema),
  respirationPanel: z.number().nullable(),
});
export type PageShotPlan = z.infer<typeof pageShotPlanSchema>;

export const chapterShotPlanSchema = z.object({
  pages: z.array(pageShotPlanSchema),
  rhythm: z.enum(["contemplative", "standard", "kinetic", "mixed"]),
  diversityTargets: z.object({
    wide: z.number(),
    medium: z.number(),
    closeup: z.number(),
    cutaway: z.number(),
  }),
  emphasis: z.array(z.object({
    pageNumber: z.number(),
    panelNumber: z.number(),
    reason: z.string(),
    device: z.enum(["splash", "double_page", "silence_beat", "cutaway_insert", "extreme_closeup"]),
  })),
});
export type ChapterShotPlan = z.infer<typeof chapterShotPlanSchema>;
