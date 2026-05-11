/**
 * chapter-studio-readiness-schemas.ts
 *
 * Schémas Zod : image counts, readiness issues, contract status, readiness
 * report, qa axis/panel/chapter, creative controls.
 *
 * Extrait de `chapter-studio.ts` (audit-v9, < 500 lignes/fichier).
 */

import { z } from "zod";
import { PREMIUM_PANEL_RANGE } from "../premium-panel-range";
import { chapterStudioStepSchema } from "./chapter-studio-canon-schemas";

export const chapterImageCountSchema = z.object({
  estimatedImages: z.number().int().min(0).default(0),
  targetImages: z.number().int().min(0).default(0),
  minimumImages: z.number().int().min(0).default(PREMIUM_PANEL_RANGE.min),
  generatedImages: z.number().int().min(0).default(0),
  acceptedImages: z.number().int().min(0).default(0),
  rejectedImages: z.number().int().min(0).default(0),
  missingImages: z.number().int().min(0).default(0),
});

export type ChapterImageCount = z.infer<typeof chapterImageCountSchema>;

export const chapterReadinessIssueSchema = z.object({
  id: z.string(),
  step: chapterStudioStepSchema,
  field: z.string().optional().nullable(),
  message: z.string(),
  ctaLabel: z.string().optional().nullable(),
  action: z
    .enum(["open_step", "focus_field", "generate_outline", "open_generation", "open_review"])
    .default("open_step"),
});

export type ChapterReadinessIssue = z.infer<typeof chapterReadinessIssueSchema>;

/**
 * Diagnostic structuré du contrat de production.
 * - `ok` : `panelBlueprints.length >= minimumImages` — le contrat peut partir en génération.
 * - `missing_blueprints` : `productionPlan` présent mais `panelBlueprints` absent/vide.
 * - `incomplete_blueprints` : `0 < panelBlueprints.length < minimumImages`.
 * - `missing_production_plan` : pas de `productionPlan` du tout.
 */
export const chapterContractStatusSchema = z.enum([
  "ok",
  "missing_production_plan",
  "missing_blueprints",
  "incomplete_blueprints",
]);

export type ChapterContractStatus = z.infer<typeof chapterContractStatusSchema>;

export const chapterLaunchBlockedReasonSchema = z.enum([
  "incomplete_plan",
  "missing_production_plan",
  "missing_blueprints",
  "invalid_blueprints",
]);

export type ChapterLaunchBlockedReason = z.infer<typeof chapterLaunchBlockedReasonSchema>;

export const chapterReadinessReportSchema = z.object({
  status: z.enum(["blocked", "warning", "ready"]).default("blocked"),
  preparationScore: z.number().int().min(0).max(100).default(0),
  blockingIssues: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  blockerItems: z.array(chapterReadinessIssueSchema).default([]),
  warningItems: z.array(chapterReadinessIssueSchema).default([]),
  completedSteps: z.array(chapterStudioStepSchema).default([]),
  imageCounts: chapterImageCountSchema.default({}),
  panelBlueprintCount: z.number().int().min(0).optional(),
  contractStatus: chapterContractStatusSchema.optional(),
  // P1.1 — booléen dérivé `contractStatus === "ok"`, exposé pour éviter aux
  // composants UI de refaire la comparaison.
  contractComplete: z.boolean().optional(),
  launchBlocked: z.boolean().optional(),
  launchBlockedReason: chapterLaunchBlockedReasonSchema.nullable().optional(),
});

export type ChapterReadinessReport = z.infer<typeof chapterReadinessReportSchema>;

export const qaAxisScoreSchema = z.object({
  characterFidelity: z.number().min(0).max(1),
  narrativeRelevance: z.number().min(0).max(1),
  compositionReadability: z.number().min(0).max(1),
  environmentConsistency: z.number().min(0).max(1),
  propComplianceScore: z.number().min(0).max(1).optional(),
  subjectFocusScore: z.number().min(0).max(1).optional(),
  dialogueAnchorScore: z.number().min(0).max(1).optional(),
  enemyPresenceScore: z.number().min(0).max(1).optional(),
  populationScore: z.number().min(0).max(1).optional(),
});

export const qaPanelResultSchema = z.object({
  panelId: z.string(),
  critical: z.boolean().default(false),
  score: z.number().min(0).max(1),
  axisScores: qaAxisScoreSchema,
  rejectionReasons: z.array(z.string()).default([]),
  repairSuggestions: z.array(z.string()).default([]),
  rerollCount: z.number().int().min(0).default(0),
});

export const chapterQAReportSchema = z.object({
  panelResults: z.array(qaPanelResultSchema).default([]),
  pageScore: z.number().min(0).max(1).default(0),
  chapterScore: z.number().min(0).max(1).default(0),
  acceptedPanelCount: z.number().int().min(0).default(0),
  rejectedPanelCount: z.number().int().min(0).default(0),
  missingCriticalPanels: z.array(z.string()).default([]),
});

export type ChapterQAReport = z.infer<typeof chapterQAReportSchema>;

export const chapterCreativeControlsSchema = z.object({
  noveltyLevel: z.number().int().min(0).max(100).default(55),
  worldStrictness: z.number().int().min(0).max(100).default(85),
  visualExoticism: z.number().int().min(0).max(100).default(50),
  npcVariety: z.number().int().min(0).max(100).default(60),
  environmentRichness: z.number().int().min(0).max(100).default(78),
});

export type ChapterCreativeControls = z.infer<typeof chapterCreativeControlsSchema>;
