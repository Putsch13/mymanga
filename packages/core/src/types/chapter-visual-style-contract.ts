/**
 * P0.10 — Direction artistique / style manga verrouillé au niveau chapitre (wizard).
 * Complète `chapterLookProfile` (pipeline) avec des champs UX riches.
 */
import { z } from "zod";

export const chapterVisualFormatSchema = z.enum(["manga", "webtoon", "comics"]);
export type ChapterVisualFormat = z.infer<typeof chapterVisualFormatSchema>;

export const chapterVisualColorModeSchema = z.enum(["bw", "color"]);
export type ChapterVisualColorMode = z.infer<typeof chapterVisualColorModeSchema>;

export const chapterVisualDensitySchema = z.enum(["low", "medium", "high"]);
export type ChapterVisualDensity = z.infer<typeof chapterVisualDensitySchema>;

export const chapterVisualStyleContractSchema = z.object({
  format: chapterVisualFormatSchema,
  /** Ex. "2:3", "9:16", "4:5" — libellé court pour prompts. */
  aspectRatio: z.string().optional().nullable(),
  colorMode: chapterVisualColorModeSchema,
  /** Famille / sous-genre visuel (shonen, seinen, cyberpunk…). */
  styleGenre: z.string().min(1),
  detailLevel: chapterVisualDensitySchema.optional().default("medium"),
  inkingStyle: z.string().optional().nullable(),
  contrastLevel: chapterVisualDensitySchema.optional().default("medium"),
  framingStyle: z.string().optional().nullable(),
  dialogueDensityVisual: chapterVisualDensitySchema.optional().default("medium"),
  actionDensityVisual: chapterVisualDensitySchema.optional().default("medium"),
  cutawayLevel: chapterVisualDensitySchema.optional().default("medium"),
  forbiddenVisualDrift: z.array(z.string()).default([]),
});

export type ChapterVisualStyleContract = z.infer<typeof chapterVisualStyleContractSchema>;
