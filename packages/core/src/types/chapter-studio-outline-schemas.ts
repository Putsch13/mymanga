/**
 * chapter-studio-outline-schemas.ts
 *
 * Schémas Zod : intent, contrat narratif, sélection cast, canon input,
 * editorial outline, production beat/outline/plan/adjustments.
 *
 * Extrait de `chapter-studio.ts` (audit-v9, < 500 lignes/fichier).
 */

import { z } from "zod";
import { PREMIUM_PANEL_RANGE } from "../premium-panel-range";
import type {
  NarrativeFact,
  PresenceObligation,
  RequiredProp,
} from "./narrative-facts";
import {
  chapterFocusBudgetSchema,
  chapterObjectStateSchema,
  narrativeFactSchema,
  panelBlueprintPremiumSchema,
  presenceObligationSchema,
  requiredPropSchema,
} from "./chapter-studio-premium-schemas";

export const chapterIntentSchema = z.object({
  chapterNumber: z.number().int().positive().optional().nullable(),
  workingTitle: z.string().optional().nullable(),
  shortPitch: z.string().optional().nullable(),
  arcPosition: z.string().optional().nullable(),
  emotionalGoal: z.string().optional().nullable(),
  mainConflict: z.string().optional().nullable(),
  endingMode: z.enum(["cliffhanger", "resolution", "twist", "escalation"]).optional().nullable(),
  arcImportance: z.enum(["low", "medium", "high", "critical"]).optional().nullable(),
});

export type ChapterIntent = z.infer<typeof chapterIntentSchema>;

export const chapterNarrativeContractSchema = z.object({
  emotionalGoal: z.string(),
  heroStateAtStart: z.string(),
  heroStateAtEnd: z.string(),
  centralConflict: z.string(),
  revealOrInformationGain: z.string(),
  relationshipShift: z.string().optional().nullable(),
  chapterQuestion: z.string(),
  endingMode: z.enum(["cliffhanger", "resolution", "twist", "escalation"]),
  tone: z.string(),
  dominantTone: z.string().optional().nullable(),
  intensityCurve: z.array(z.number().min(0).max(100)).default([]),
  keyMotif: z.string().optional().nullable(),
  forbiddenNarrativeMisses: z.array(z.string()).default([]),
});

export type ChapterNarrativeContract = z.infer<typeof chapterNarrativeContractSchema>;

export const chapterCharacterSelectionSchema = z.object({
  heroCharacterId: z.string().optional().nullable(),
  /** Héros / co-protagoniste officiel (contrat studio — QA, prompts, équilibre). */
  secondaryHeroCharacterId: z.string().optional().nullable(),
  /** Rôle narratif secondaire distinct du co-héros (readiness / couverture panels). */
  deuteragonistCharacterId: z.string().optional().nullable(),
  /** Cast narratif principal (héros, héros 2, antagonistes récurrents). */
  coreCastCharacterIds: z.array(z.string()).default([]),
  activeCharacterIds: z.array(z.string()).default([]),
  lockedCharacterIds: z.array(z.string()).default([]),
  speakingCharacterIds: z.array(z.string()).default([]),
  evolvingCharacterIds: z.array(z.string()).default([]),
  antagonistCharacterIds: z.array(z.string()).default([]),
  recurringNpcIds: z.array(z.string()).default([]),
});

export type ChapterCharacterSelection = z.infer<typeof chapterCharacterSelectionSchema>;

export const chapterCanonInputSchema = z.object({
  heroOutfitId: z.string().optional().nullable(),
  activeCharacters: z.array(z.string()).default([]),
  allowedVisualChanges: z.array(z.string()).default([]),
  currentLocation: z.string().optional().nullable(),
  weather: z.string().optional().nullable(),
  timeOfDay: z.string().optional().nullable(),
  injuries: z.array(z.string()).default([]),
  carriedObjects: z.array(z.string()).default([]),
  continuityNotes: z.array(z.string()).default([]),
  inheritedFromPreviousChapter: z.boolean().default(true),
  universeConstraints: z.array(z.string()).default([]),
});

export type ChapterCanonInput = z.infer<typeof chapterCanonInputSchema>;

export const editorialOutlineBeatSchema = z.object({
  beatId: z.string(),
  label: z.string(),
  summary: z.string(),
  narrativePurpose: z.string().optional().nullable(),
  dramaticShift: z.string().optional().nullable(),
  involvedCharacters: z.array(z.string()).default([]),
});

export const editorialOutlineSchema = z.object({
  summary: z.string(),
  validationNotes: z.array(z.string()).default([]),
  beats: z.array(editorialOutlineBeatSchema).min(1).max(5),
});

export type EditorialOutline = z.infer<typeof editorialOutlineSchema>;

export const productionBeatSchema = z.object({
  beatId: z.string(),
  summary: z.string(),
  narrativeFunction: z.string(),
  whyThisBeatExists: z.string(),
  dramaticChange: z.string(),
  involvedCharacters: z.array(z.string()).default([]),
  involvedCharacterLabels: z.array(z.string()).optional(),
  unresolvedCharacterRefs: z.array(z.string()).optional(),
  activeCanonConstraints: z.array(z.string()).default([]),
  environmentContext: z.array(z.string()).default([]),
  visualPriority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  estimatedPanels: z.number().int().min(1).default(4),
  criticality: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  continuityDependencies: z.array(z.string()).default([]),
  infoGained: z.string().optional().nullable(),
  emotionProduced: z.string().optional().nullable(),
  indispensabilityScore: z.number().int().min(0).max(100).default(60),
  redundancyRisk: z.number().int().min(0).max(100).default(20),
  narrativeFacts: z.array(narrativeFactSchema).optional(),
  requiredProps: z.array(requiredPropSchema).optional(),
  presenceObligations: z.array(presenceObligationSchema).optional(),
  mustShowEnemy: z.boolean().optional(),
  speakerAnchorCharacterId: z.string().nullable().optional(),
  speakerAnchorCharacterName: z.string().nullable().optional(),
  subjectFocusHint: z.string().nullable().optional(),
  cutawayHint: z.string().nullable().optional(),
});

export type ProductionBeat = z.infer<typeof productionBeatSchema> & {
  narrativeFacts?: NarrativeFact[];
  requiredProps?: RequiredProp[];
  presenceObligations?: PresenceObligation[];
};

export const productionOutlineSchema = z.object({
  source: z.enum(["manual", "estimated", "generated", "legacy_adapted", "premium_rebuilt"]).default("generated"),
  chapterGoal: z.string(),
  cliffhanger: z.string(),
  beats: z.array(productionBeatSchema).min(1).max(24),
});

export type ProductionOutline = z.infer<typeof productionOutlineSchema>;

export const productionPlanPageSchema = z.object({
  pageNumber: z.number().int().positive(),
  beatIds: z.array(z.string()).default([]),
  panelCount: z.number().int().min(1),
  imageTarget: z.number().int().min(1),
  criticalPanelCount: z.number().int().min(0).default(0),
});

export type ProductionPlanPage = z.infer<typeof productionPlanPageSchema>;

export const productionPlanAdjustmentSchema = z.object({
  type: z.enum([
    "reaction_shot",
    "establishing_shot",
    "transition_shot",
    "beat_split",
    "emotional_extension",
    "combat_extension",
  ]),
  beatId: z.string().optional().nullable(),
  reason: z.string(),
  addedImages: z.number().int().min(1).default(1),
});

export type ProductionPlanAdjustment = z.infer<typeof productionPlanAdjustmentSchema>;

export const productionPlanSchema = z.object({
  pageCount: z.number().int().min(0).default(0),
  pages: z.array(productionPlanPageSchema).default([]),
  panelsPerPage: z.array(z.number().int().min(1)).default([]),
  estimatedImages: z.number().int().min(0).default(0),
  targetImages: z.number().int().min(0).default(0),
  minimumImages: z.number().int().min(0).default(PREMIUM_PANEL_RANGE.min),
  criticalPanels: z.array(z.string()).default([]),
  lockedCharacters: z.array(z.string()).default([]),
  compressionRisks: z.array(z.string()).default([]),
  enrichmentAdjustments: z.array(productionPlanAdjustmentSchema).default([]),
  imageBudgetStatus: z.enum(["under_target", "on_target", "over_target"]).default("on_target"),
  panelBlueprints: z.array(panelBlueprintPremiumSchema).optional(),
  focusDistribution: z.record(z.string(), z.number()).optional(),
  shotDistribution: z.record(z.string(), z.number()).optional(),
  propCoverage: z.object({ covered: z.array(z.string()), missing: z.array(z.string()) }).optional(),
  enemyCoverage: z.object({ panelCount: z.number(), beatsCovered: z.array(z.string()) }).optional(),
  npcCoverage: z.object({ panelCount: z.number(), avgNpcCount: z.number() }).optional(),
  dialogueAnchorCoverage: z
    .object({ anchored: z.number().default(0), floating: z.number().default(0) })
    .optional(),
  cutawayCoverage: z.object({ count: z.number().default(0), ratio: z.number().default(0) }).optional(),
  heroCenterRatio: z.number().min(0).max(1).optional(),
  premiumReadinessScore: z.number().min(0).max(1).optional(),
  focusBudget: chapterFocusBudgetSchema.optional(),
  objectStateTimeline: z.array(chapterObjectStateSchema).optional(),
});

export type ProductionPlan = z.infer<typeof productionPlanSchema>;
