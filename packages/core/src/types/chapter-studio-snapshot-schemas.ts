/**
 * chapter-studio-snapshot-schemas.ts
 *
 * Schémas Zod : autofill meta, estimate context, look profile, pipeline
 * preferences, wizard state, studioData et le snapshot top-level.
 *
 * Extrait de `chapter-studio.ts` (audit-v9, < 500 lignes/fichier).
 */

import { z } from "zod";
import { chapterAiReadinessSchema } from "../ai-readiness";
import { visualWorldContractSchema } from "../visual-world/visual-world-contract";
import { chapterIntentContractSchema } from "./chapter-intent-contract";
import { intentNarrativeContractSchema } from "../intent/intent-narrative-contract";
import { dialogueContractSchema } from "./dialogue-contract";
import { chapterVisualStyleContractSchema } from "./chapter-visual-style-contract";
import {
  characterCanonSchema,
  chapterStudioStatusSchema,
  chapterStudioStepSchema,
  locationCanonSchema,
  projectCanonSchema,
} from "./chapter-studio-canon-schemas";
import {
  chapterCanonInputSchema,
  chapterCharacterSelectionSchema,
  chapterIntentSchema,
  chapterNarrativeContractSchema,
  editorialOutlineSchema,
  productionOutlineSchema,
  productionPlanSchema,
} from "./chapter-studio-outline-schemas";
import {
  chapterCreativeControlsSchema,
  chapterQAReportSchema,
  chapterReadinessReportSchema,
} from "./chapter-studio-readiness-schemas";
import {
  chapterEntitiesSchema,
  chapterEntityRegistrySchema,
} from "./chapter-studio-world-schemas";

export const autofillMetaSchema = z.object({
  source: z.literal("ai_autofill"),
  generatedAt: z.string(),
  mode: z.enum(["brief", "cast_canon", "plan", "all_missing", "repair_readiness", "rewrite_beat"]),
  confidence: z.number().min(0).max(1).default(0.5),
  assumptions: z.array(z.string()).default([]),
  appliedFields: z.array(z.string()).default([]),
  unresolvedQuestions: z.array(z.string()).default([]),
});

export type AutofillMeta = z.infer<typeof autofillMetaSchema>;

/** Sous-ensemble du plan canonique renvoyé par POST /chapters/estimate (persisté avec le snapshot). */
export const estimateCanonicalProductionPlanSchema = z.object({
  format: z.enum(["manga", "webtoon"]),
  beatCount: z.number().int().min(0),
  panelCount: z.number().int().min(0),
  metrics: z.unknown(),
  rhythm: z.unknown(),
  qa: z.unknown(),
});

export type EstimateCanonicalProductionPlan = z.infer<typeof estimateCanonicalProductionPlanSchema>;

export const estimateContextSchema = z.object({
  targetChapterId: z.string().optional().nullable(),
  targetChapterNumber: z.number().int().positive().optional().nullable(),
  contextDigest: z.string().optional().nullable(),
  creativityControlsUsed: z.record(z.string(), z.unknown()).optional().nullable(),
  estimateSource: z.enum(["new_chapter", "existing_chapter"]).default("new_chapter"),
  estimatedAt: z.string(),
  canonicalProductionPlan: estimateCanonicalProductionPlanSchema.optional(),
  /** P1.2 — état des moteurs IA au moment de l’estimation (persisté avec le snapshot). */
  aiReadiness: chapterAiReadinessSchema.optional(),
  premiumBlockingReasons: z.array(z.string()).optional(),
  /**
   * P0.2 — même agrégat que `planReady` côté POST /estimate : le snapshot studio
   * sait si le dernier estimate était aligné launch (QA canonique, refs, continuity).
   */
  launchAlignedReady: z.boolean().optional(),
  planStatus: z.enum(["ready", "incomplete"]).optional(),
  continuityPreflight: z
    .object({
      ok: z.boolean(),
      blockers: z.array(z.string()),
      panelCount: z.number().int().min(0),
    })
    .optional(),
  characterRefResolutionOk: z.boolean().optional(),
  finalStructuralQaValid: z.boolean().optional(),
});

export type EstimateContext = z.infer<typeof estimateContextSchema>;

export const chapterLookProfileModeSchema = z.enum([
  "premium_manga_bw",
  "premium_manga_color",
  "anime_cel_shaded_consistent",
]);

export type ChapterLookProfileMode = z.infer<typeof chapterLookProfileModeSchema>;

export const chapterLookProfileSchema = z.object({
  mode: chapterLookProfileModeSchema,
  renderMode: z.string().optional().nullable(),
  styleFamily: z.string().optional().nullable(),
  lineStyle: z.string().optional().nullable(),
  shadingStyle: z.string().optional().nullable(),
  anatomyStyle: z.string().optional().nullable(),
  colorDiscipline: z.string().optional().nullable(),
  backgroundDensity: z.enum(["sparse", "medium", "rich"]).optional().nullable(),
  textureDiscipline: z.string().optional().nullable(),
  faceRenderingStyle: z.string().optional().nullable(),
  sfxStyle: z.string().optional().nullable(),
  cameraLanguage: z.string().optional().nullable(),
  actionLanguage: z.string().optional().nullable(),
  romanceLanguage: z.string().optional().nullable(),
  incompatibleFamilies: z.array(z.string()).default([]),
  providerCapabilityRequired: z.array(z.string()).default([]),
});

export type ChapterLookProfileStudio = z.infer<typeof chapterLookProfileSchema>;

export const chapterPipelinePreferencesSchema = z.object({
  /** Active le dialoguiste scène OpenAI pour ce chapitre (en plus de OPENAI_SCENE_DIALOGUE_ENRICH côté serveur). */
  sceneDialogueEnrich: z.boolean().optional(),
});

export type ChapterPipelinePreferences = z.infer<typeof chapterPipelinePreferencesSchema>;

/** P0.4 — état du wizard « premier chapitre » persisté dans le snapshot studio (pas de state React seul). */
export const chapterWizardStateSchema = z.object({
  currentStep: z.string().min(1).default("intent"),
  completedSteps: z.array(z.string()).default([]),
  dismissedTips: z.array(z.string()).default([]),
});

export type ChapterWizardState = z.infer<typeof chapterWizardStateSchema>;

export const chapterStudioDataSchema = z.object({
  intent: chapterIntentSchema.optional(),
  narrativeContract: chapterNarrativeContractSchema.optional(),
  characterSelection: chapterCharacterSelectionSchema.optional(),
  projectCanon: projectCanonSchema.optional(),
  characterCanons: z.array(characterCanonSchema).default([]),
  locationCanons: z.array(locationCanonSchema).default([]),
  chapterCanon: chapterCanonInputSchema.optional(),
  editorialOutline: editorialOutlineSchema.optional(),
  productionOutline: productionOutlineSchema.optional(),
  productionPlan: productionPlanSchema.optional(),
  selectedPlotLabel: z.enum(["safe", "bold", "shock"]).default("bold"),
  creativityControls: chapterCreativeControlsSchema.default({}),
  readinessReport: chapterReadinessReportSchema.optional(),
  qaReport: chapterQAReportSchema.optional(),
  lastCompletedStep: chapterStudioStepSchema.optional(),
  autofillMeta: autofillMetaSchema.optional(),
  estimateContext: estimateContextSchema.optional(),
  entityRegistry: chapterEntityRegistrySchema.optional(),
  /** P0.9 — Monde vivant (PNJ, créatures, props, véhicules, factions) — wizard ch.1 + sync VisualWorld. */
  chapterEntities: chapterEntitiesSchema.optional(),
  /** Profil look visuel autoritaire du chapitre — source de vérité style */
  chapterLookProfile: chapterLookProfileSchema.optional(),
  /** P0.10 — Direction artistique wizard (enrichit / pilote `chapterLookProfile`). */
  chapterVisualStyleContract: chapterVisualStyleContractSchema.optional(),
  /** Préférences pipeline (flags optionnels persistés avec le snapshot studio). */
  pipelinePreferences: chapterPipelinePreferencesSchema.optional(),
  /** P1.2 — dernier état readiness IA (optionnel ; peut être rafraîchi au launch). */
  aiReadiness: chapterAiReadinessSchema.optional(),
  premiumBlockingReasons: z.array(z.string()).optional(),
  /** Contrat monde visuel IA (persisté avec le snapshot pour estimate/launch). */
  visualWorldContract: visualWorldContractSchema.optional(),
  /** P0.5 — intention compilée / validée (wizard premium). */
  chapterIntentContract: chapterIntentContractSchema.optional(),
  /**
   * FIX-11 (CRITIQUE) — Contrat d'intention narratif compilé (events,
   * personnages, lieux et NPC groups requis). Doit être persisté ici par
   * la route `/intent-compile` pour que le pipeline (`run-full-chapter-pipeline`)
   * réutilise EXACTEMENT le contrat produit par le builder côté studio
   * (avec résolution de pronoms, etc.) au lieu de le reconstruire
   * heuristiquement avec un contexte appauvri.
   */
  intentNarrativeContract: intentNarrativeContractSchema.optional().nullable(),
  /** P1.2 / P0.14 — contrat dialogues validé studio (persisté → job → empreinte génération). */
  chapterDialogueContract: dialogueContractSchema.optional(),
  /** P0.4 — progression wizard chapitre 1 (étape courante, jalons, astuces masquées). */
  chapterWizard: chapterWizardStateSchema.optional(),
});

export type ChapterStudioData = z.infer<typeof chapterStudioDataSchema>;

export const chapterStudioSnapshotSchema = z.object({
  status: chapterStudioStatusSchema.default("DRAFT"),
  currentStep: chapterStudioStepSchema.default("intent"),
  data: chapterStudioDataSchema.default({ characterCanons: [], locationCanons: [] }),
  history: z
    .array(
      z.object({
        from: chapterStudioStatusSchema,
        to: chapterStudioStatusSchema,
        at: z.string(),
        reason: z.string().optional().nullable(),
      }),
    )
    .default([]),
  autosaveVersion: z.number().int().min(0).default(1),
  updatedAt: z.string().optional().nullable(),
});

export type ChapterStudioSnapshot = z.infer<typeof chapterStudioSnapshotSchema>;
