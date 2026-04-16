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

export const pageShotPlanSchema = z.object({
  pageNumber: z.number(),
  template: z.enum(["splash", "double_page", "grid_4", "grid_6", "asymmetric", "vertical_strip"]),
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
