import { z } from "zod";
import type { ApprovedChapterOutline } from "./approved-outline";

export const chapterStudioStepSchema = z.enum([
  "intent",
  "narrative_contract",
  "characters",
  "canon",
  "editorial_outline",
  "production_outline",
  "production_plan",
  "readiness",
  "generation",
  "review",
]);

export type ChapterStudioStep = z.infer<typeof chapterStudioStepSchema>;

export const chapterStudioStatusSchema = z.enum([
  "DRAFT",
  "NARRATIVE_CONTRACT_READY",
  "CANON_READY",
  "OUTLINE_EDITORIAL_READY",
  "OUTLINE_PRODUCTION_READY",
  "PRODUCTION_PLAN_READY",
  "READY_FOR_GENERATION",
  "GENERATING",
  "GENERATION_PARTIAL",
  "QA_REVIEW",
  "NEEDS_FIXES",
  "COMPLETED",
  "PUBLISHED",
]);

export type ChapterStudioStatus = z.infer<typeof chapterStudioStatusSchema>;

export const canonLockStrengthSchema = z.enum([
  "HARD_LOCK",
  "STRONG",
  "MEDIUM",
  "LIGHT",
  "NONE",
]);

export type CanonLockStrength = z.infer<typeof canonLockStrengthSchema>;

export const characterImportanceTierSchema = z.enum([
  "MAIN_HERO",
  "SECONDARY_CORE",
  "IMPORTANT_SUPPORTING_CHARACTER",
  "RECURRING_NPC",
  "BACKGROUND_EXTRA",
]);

export type CharacterImportanceTier = z.infer<typeof characterImportanceTierSchema>;

export const projectCanonSchema = z.object({
  artStyleCanon: z.array(z.string()).default([]),
  worldRules: z.array(z.string()).default([]),
  toneRules: z.array(z.string()).default([]),
  violenceLevel: z.number().int().min(0).max(100).optional().nullable(),
  romanceLevel: z.number().int().min(0).max(100).optional().nullable(),
  supernaturalRules: z.array(z.string()).default([]),
  panelingPreferences: z.array(z.string()).default([]),
  blackAndWhitePolicy: z.string().optional().nullable(),
  inkingPolicy: z.string().optional().nullable(),
  negativeStyleRules: z.array(z.string()).default([]),
});

export type ProjectCanon = z.infer<typeof projectCanonSchema>;

export const outfitCanonSchema = z.object({
  outfitId: z.string(),
  characterId: z.string(),
  label: z.string(),
  top: z.string().optional().nullable(),
  bottom: z.string().optional().nullable(),
  shoes: z.string().optional().nullable(),
  accessories: z.array(z.string()).default([]),
  stateTags: z.array(z.string()).default([]),
  seasonContext: z.string().optional().nullable(),
  colorMemory: z.array(z.string()).default([]),
  shapeMemory: z.array(z.string()).default([]),
  continuityPriority: z.number().int().min(0).max(100).default(50),
});

export type OutfitCanon = z.infer<typeof outfitCanonSchema>;

export const characterCanonSchema = z.object({
  characterId: z.string(),
  role: z.string().optional().nullable(),
  canonicalName: z.string(),
  importanceTier: characterImportanceTierSchema.default("IMPORTANT_SUPPORTING_CHARACTER"),
  lockStrength: canonLockStrengthSchema.default("MEDIUM"),
  visualIdentity: z.array(z.string()).default([]),
  silhouette: z.string().optional().nullable(),
  faceTraits: z.array(z.string()).default([]),
  eyeTraits: z.array(z.string()).default([]),
  hairTraits: z.array(z.string()).default([]),
  skinTone: z.string().optional().nullable(),
  bodyType: z.string().optional().nullable(),
  apparentAge: z.string().optional().nullable(),
  accessories: z.array(z.string()).default([]),
  signatureMarks: z.array(z.string()).default([]),
  defaultOutfitId: z.string().optional().nullable(),
  defaultOutfitSet: z.array(outfitCanonSchema).default([]),
  emotionalRange: z.array(z.string()).default([]),
  forbiddenDrift: z.array(z.string()).default([]),
  mustKeep: z.array(z.string()).default([]),
  optionalVariation: z.array(z.string()).default([]),
  referenceAssets: z.array(z.string()).default([]),
  loraBindings: z.array(z.string()).default([]),
  fingerprint: z.record(z.string(), z.unknown()).default({}),
});

export type CharacterCanon = z.infer<typeof characterCanonSchema>;

export const locationCanonSchema = z.object({
  locationId: z.string(),
  label: z.string(),
  visualMarkers: z.array(z.string()).default([]),
  architecture: z.array(z.string()).default([]),
  density: z.string().optional().nullable(),
  atmosphere: z.array(z.string()).default([]),
  timeOfDayVariants: z.array(z.string()).default([]),
  weatherVariants: z.array(z.string()).default([]),
  mustKeep: z.array(z.string()).default([]),
  forbiddenDrift: z.array(z.string()).default([]),
});

export type LocationCanon = z.infer<typeof locationCanonSchema>;

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
});

export type ProductionBeat = z.infer<typeof productionBeatSchema>;

export const productionOutlineSchema = z.object({
  source: z.enum(["manual", "estimated", "generated", "legacy_adapted"]).default("generated"),
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
  pageCount: z.number().int().positive(),
  pages: z.array(productionPlanPageSchema).min(1),
  panelsPerPage: z.array(z.number().int().min(1)).default([]),
  estimatedImages: z.number().int().min(0),
  targetImages: z.number().int().min(0),
  minimumImages: z.number().int().min(0).default(55),
  criticalPanels: z.array(z.string()).default([]),
  lockedCharacters: z.array(z.string()).default([]),
  compressionRisks: z.array(z.string()).default([]),
  enrichmentAdjustments: z.array(productionPlanAdjustmentSchema).default([]),
  imageBudgetStatus: z.enum(["under_target", "on_target", "over_target"]).default("on_target"),
});

export type ProductionPlan = z.infer<typeof productionPlanSchema>;

export const chapterImageCountSchema = z.object({
  estimatedImages: z.number().int().min(0).default(0),
  targetImages: z.number().int().min(0).default(0),
  minimumImages: z.number().int().min(0).default(55),
  generatedImages: z.number().int().min(0).default(0),
  acceptedImages: z.number().int().min(0).default(0),
  rejectedImages: z.number().int().min(0).default(0),
  missingImages: z.number().int().min(0).default(55),
});

export type ChapterImageCount = z.infer<typeof chapterImageCountSchema>;

export const chapterReadinessIssueSchema = z.object({
  id: z.string(),
  step: chapterStudioStepSchema,
  field: z.string().optional().nullable(),
  message: z.string(),
  ctaLabel: z.string().optional().nullable(),
  action: z.enum(["open_step", "focus_field", "generate_outline", "open_generation", "open_review"]).default("open_step"),
});

export type ChapterReadinessIssue = z.infer<typeof chapterReadinessIssueSchema>;

export const chapterReadinessReportSchema = z.object({
  status: z.enum(["blocked", "warning", "ready"]).default("blocked"),
  preparationScore: z.number().int().min(0).max(100).default(0),
  blockingIssues: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  blockerItems: z.array(chapterReadinessIssueSchema).default([]),
  warningItems: z.array(chapterReadinessIssueSchema).default([]),
  completedSteps: z.array(chapterStudioStepSchema).default([]),
  imageCounts: chapterImageCountSchema.default({}),
});

export type ChapterReadinessReport = z.infer<typeof chapterReadinessReportSchema>;

export const qaAxisScoreSchema = z.object({
  characterFidelity: z.number().min(0).max(1),
  narrativeRelevance: z.number().min(0).max(1),
  compositionReadability: z.number().min(0).max(1),
  environmentConsistency: z.number().min(0).max(1),
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

export const chapterEntityKindSchema = z.enum([
  "named_story_npc",
  "recurring_supporting",
  "functional_unnamed",
  "background_extra",
  "crowd_group",
]);

export type ChapterEntityKind = z.infer<typeof chapterEntityKindSchema>;

export const chapterEntityEntrySchema = z.object({
  name: z.string(),
  kind: chapterEntityKindSchema,
  introductionReason: z.string().optional().nullable(),
  allowedRecurrence: z.enum(["single_chapter", "recurring", "story_locked"]).default("single_chapter"),
  promotionStatus: z.enum(["temporary", "pending_review", "promoted"]).default("temporary"),
  dramaticFunction: z.string().optional().nullable(),
});

export type ChapterEntityEntry = z.infer<typeof chapterEntityEntrySchema>;

export const crowdGroupSchema = z.object({
  label: z.string(),
  size: z.enum(["small", "medium", "large"]).default("small"),
});

export const chapterEntityRegistrySchema = z.object({
  namedEntities: z.array(chapterEntityEntrySchema).default([]),
  temporaryEntities: z.array(chapterEntityEntrySchema).default([]),
  backgroundExtras: z.array(chapterEntityEntrySchema).default([]),
  crowdGroups: z.array(crowdGroupSchema).default([]),
});

export type ChapterEntityRegistry = z.infer<typeof chapterEntityRegistrySchema>;

export const autofillMetaSchema = z.object({
  source: z.literal("ai_autofill"),
  generatedAt: z.string(),
  mode: z.enum(["brief", "cast_canon", "plan", "all_missing", "repair_readiness"]),
  confidence: z.number().min(0).max(1).default(0.5),
  assumptions: z.array(z.string()).default([]),
  appliedFields: z.array(z.string()).default([]),
  unresolvedQuestions: z.array(z.string()).default([]),
});

export type AutofillMeta = z.infer<typeof autofillMetaSchema>;

export const estimateContextSchema = z.object({
  targetChapterId: z.string().optional().nullable(),
  targetChapterNumber: z.number().int().positive().optional().nullable(),
  contextDigest: z.string().optional().nullable(),
  creativityControlsUsed: z.record(z.string(), z.unknown()).optional().nullable(),
  estimateSource: z.enum(["new_chapter", "existing_chapter"]).default("new_chapter"),
  estimatedAt: z.string(),
});

export type EstimateContext = z.infer<typeof estimateContextSchema>;

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
});

export type ChapterStudioData = z.infer<typeof chapterStudioDataSchema>;

export const chapterStudioSnapshotSchema = z.object({
  status: chapterStudioStatusSchema.default("DRAFT"),
  currentStep: chapterStudioStepSchema.default("intent"),
  data: chapterStudioDataSchema.default({ characterCanons: [], locationCanons: [] }),
  history: z.array(z.object({
    from: chapterStudioStatusSchema,
    to: chapterStudioStatusSchema,
    at: z.string(),
    reason: z.string().optional().nullable(),
  })).default([]),
  autosaveVersion: z.number().int().min(0).default(1),
  updatedAt: z.string().optional().nullable(),
});

export type ChapterStudioSnapshot = z.infer<typeof chapterStudioSnapshotSchema>;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function sum(numbers: number[]) {
  return numbers.reduce((acc, value) => acc + value, 0);
}

export function buildProductionPlanFromOutline(
  outline: ProductionOutline,
  input?: {
    minimumImages?: number;
    maxPanelsPerPage?: number;
    lockedCharacters?: string[];
  },
): ProductionPlan {
  const minimumImages = Math.max(1, input?.minimumImages ?? 55);
  const maxPanelsPerPage = Math.max(3, input?.maxPanelsPerPage ?? 5);
  const panels = outline.beats.map((beat) => Math.max(1, beat.estimatedPanels));
  const estimatedImages = sum(panels);
  const pages: ProductionPlanPage[] = [];
  let pageNumber = 1;
  let currentPanels = 0;
  let currentBeatIds: string[] = [];
  let currentCriticalCount = 0;

  for (const beat of outline.beats) {
    const beatPanels = Math.max(1, beat.estimatedPanels);
    if (currentPanels > 0 && currentPanels + beatPanels > maxPanelsPerPage) {
      pages.push({
        pageNumber,
        beatIds: currentBeatIds,
        panelCount: currentPanels,
        imageTarget: currentPanels,
        criticalPanelCount: currentCriticalCount,
      });
      pageNumber += 1;
      currentPanels = 0;
      currentBeatIds = [];
      currentCriticalCount = 0;
    }

    currentPanels += beatPanels;
    currentBeatIds.push(beat.beatId);
    if (beat.criticality === "high" || beat.criticality === "critical") {
      currentCriticalCount += 1;
    }
  }

  if (currentPanels > 0) {
    pages.push({
      pageNumber,
      beatIds: currentBeatIds,
      panelCount: currentPanels,
      imageTarget: currentPanels,
      criticalPanelCount: currentCriticalCount,
    });
  }

  const criticalPanels = outline.beats
    .filter((beat) => beat.criticality === "high" || beat.criticality === "critical")
    .map((beat) => beat.beatId);

  const compressionRisks = outline.beats
    .filter((beat) => beat.estimatedPanels <= 2 && beat.indispensabilityScore >= 75)
    .map((beat) => `${beat.beatId}: beat dense avec peu de panels estimés`);

  return enforceMinimumChapterImages(
    {
      pageCount: pages.length,
      pages,
      panelsPerPage: pages.map((page) => page.panelCount),
      estimatedImages,
      targetImages: estimatedImages,
      minimumImages,
      criticalPanels,
      lockedCharacters: input?.lockedCharacters ?? [],
      compressionRisks,
      enrichmentAdjustments: [],
      imageBudgetStatus: estimatedImages < minimumImages ? "under_target" : "on_target",
    },
    outline,
  );
}

export function enforceMinimumChapterImages(plan: ProductionPlan, outline?: ProductionOutline): ProductionPlan {
  if (plan.targetImages >= plan.minimumImages) {
    return productionPlanSchema.parse({
      ...plan,
      imageBudgetStatus: plan.targetImages > plan.minimumImages ? "over_target" : "on_target",
    });
  }

  const missing = plan.minimumImages - plan.targetImages;
  const adjustments: ProductionPlanAdjustment[] = [];
  const candidateBeats = outline?.beats
    ?.slice()
    .sort((a, b) => {
      const scoreA = a.indispensabilityScore + (a.criticality === "critical" ? 15 : a.criticality === "high" ? 8 : 0) - a.redundancyRisk;
      const scoreB = b.indispensabilityScore + (b.criticality === "critical" ? 15 : b.criticality === "high" ? 8 : 0) - b.redundancyRisk;
      return scoreB - scoreA;
    }) ?? [];

  for (let index = 0; index < missing; index += 1) {
    const beat = candidateBeats[index % Math.max(candidateBeats.length, 1)];
    adjustments.push({
      type:
        index % 5 === 0
          ? "establishing_shot"
          : index % 5 === 1
            ? "reaction_shot"
            : index % 5 === 2
              ? "transition_shot"
              : index % 5 === 3
                ? "beat_split"
                : "emotional_extension",
      beatId: beat?.beatId ?? null,
      reason: beat
        ? `Enrichissement narratif du beat ${beat.beatId} pour atteindre le minimum de ${plan.minimumImages} images`
        : `Enrichissement global pour atteindre le minimum de ${plan.minimumImages} images`,
      addedImages: 1,
    });
  }

  return productionPlanSchema.parse({
    ...plan,
    targetImages: plan.targetImages + missing,
    enrichmentAdjustments: [...plan.enrichmentAdjustments, ...adjustments],
    imageBudgetStatus: "on_target",
  });
}

export function normalizeChapterImageCounts(input?: Partial<ChapterImageCount> | null): ChapterImageCount {
  const normalized = chapterImageCountSchema.parse({
    estimatedImages: input?.estimatedImages ?? 0,
    targetImages: input?.targetImages ?? input?.estimatedImages ?? 0,
    minimumImages: input?.minimumImages ?? 55,
    generatedImages: input?.generatedImages ?? 0,
    acceptedImages: input?.acceptedImages ?? 0,
    rejectedImages: input?.rejectedImages ?? 0,
    missingImages: 0,
  });

  return {
    ...normalized,
    missingImages: Math.max(0, normalized.minimumImages - normalized.acceptedImages),
  };
}

export function buildChapterReadinessReport(snapshot: ChapterStudioSnapshot): ChapterReadinessReport {
  const completedSteps: ChapterStudioStep[] = [];
  const blockerItems: ChapterReadinessIssue[] = [];
  const warningItems: ChapterReadinessIssue[] = [];

  const addBlocker = (issue: ChapterReadinessIssue) => {
    blockerItems.push(issue);
  };

  const addWarning = (issue: ChapterReadinessIssue) => {
    warningItems.push(issue);
  };

  if (snapshot.data.intent?.shortPitch && snapshot.data.intent?.mainConflict) completedSteps.push("intent");
  else addBlocker({
    id: "missing_intent",
    step: "intent",
    field: "studio-short-pitch",
    message: "L’intention du chapitre est incomplète.",
    ctaLabel: "Compléter l’intention",
    action: "focus_field",
  });

  if (snapshot.data.narrativeContract) completedSteps.push("narrative_contract");
  else addBlocker({
    id: "missing_narrative_contract",
    step: "narrative_contract",
    field: "studio-emotional-goal",
    message: "Le contrat narratif est manquant.",
    ctaLabel: "Renseigner le contrat narratif",
    action: "focus_field",
  });

  if (snapshot.data.characterSelection?.heroCharacterId) completedSteps.push("characters");
  else addBlocker({
    id: "missing_hero_character",
    step: "characters",
    field: "studio-hero-character",
    message: "Le héros principal du chapitre doit être sélectionné.",
    ctaLabel: "Choisir le héros",
    action: "focus_field",
  });

  if (snapshot.data.chapterCanon?.currentLocation) completedSteps.push("canon");
  else addBlocker({
    id: "missing_chapter_location",
    step: "canon",
    field: "studio-location",
    message: "Le canon actif du chapitre doit préciser le décor principal.",
    ctaLabel: "Préciser le décor",
    action: "focus_field",
  });

  if (snapshot.data.editorialOutline?.beats.length) completedSteps.push("editorial_outline");
  else addBlocker({
    id: "missing_editorial_outline",
    step: "editorial_outline",
    field: null,
    message: "L’outline éditorial n’est pas prêt.",
    ctaLabel: "Générer outline & plan",
    action: "generate_outline",
  });

  if ((snapshot.data.productionOutline?.beats.length ?? 0) >= 10) completedSteps.push("production_outline");
  else addBlocker({
    id: "production_outline_too_short",
    step: "production_outline",
    field: null,
    message: "L’outline de production doit contenir au moins 10 beats.",
    ctaLabel: "Régénérer l’outline de production",
    action: "generate_outline",
  });

  if (snapshot.data.productionPlan) completedSteps.push("production_plan");
  else addBlocker({
    id: "missing_production_plan",
    step: "production_plan",
    field: null,
    message: "Le plan de production n’a pas encore été calculé.",
    ctaLabel: "Calculer le plan",
    action: "generate_outline",
  });

  const imageCounts = normalizeChapterImageCounts({
    estimatedImages: snapshot.data.productionPlan?.estimatedImages ?? 0,
    targetImages: snapshot.data.productionPlan?.targetImages ?? 0,
    minimumImages: snapshot.data.productionPlan?.minimumImages ?? 55,
    acceptedImages: snapshot.data.readinessReport?.imageCounts.acceptedImages ?? 0,
    generatedImages: snapshot.data.readinessReport?.imageCounts.generatedImages ?? 0,
    rejectedImages: snapshot.data.readinessReport?.imageCounts.rejectedImages ?? 0,
  });

  if (imageCounts.targetImages < imageCounts.minimumImages) {
    addBlocker({
      id: "production_plan_under_minimum_images",
      step: "production_plan",
      field: null,
      message: `Le plan vise ${imageCounts.targetImages} images, sous le minimum requis (${imageCounts.minimumImages}).`,
      ctaLabel: "Corriger le plan de production",
      action: snapshot.data.productionPlan ? "open_step" : "generate_outline",
    });
  }

  if ((snapshot.data.chapterCanon?.continuityNotes.length ?? 0) === 0) {
    addWarning({
      id: "missing_continuity_notes",
      step: "canon",
      field: "studio-continuity-notes",
      message: "Aucune note de continuité n’a été fournie pour le chapitre.",
      ctaLabel: "Ajouter une note de continuité",
      action: "focus_field",
    });
  }

  if ((snapshot.data.characterCanons ?? []).length === 0) {
    addWarning({
      id: "missing_character_canons",
      step: "characters",
      field: "studio-hero-character",
      message: "Aucun canon personnage détaillé n’est encore rattaché au chapitre.",
      ctaLabel: "Vérifier le casting",
      action: "focus_field",
    });
  }

  const preparationScore = clamp(
    100
      - blockerItems.length * 14
      - warningItems.length * 4
      + completedSteps.length * 6,
    0,
    100,
  );

  return {
    status: blockerItems.length > 0 ? "blocked" : warningItems.length > 0 ? "warning" : "ready",
    preparationScore,
    blockingIssues: blockerItems.map((issue) => issue.message),
    warnings: warningItems.map((issue) => issue.message),
    blockerItems,
    warningItems,
    completedSteps,
    imageCounts,
  };
}

export function resolveChapterStudioStatus(snapshot: ChapterStudioSnapshot): ChapterStudioStatus {
  const readinessReport = snapshot.data.readinessReport ?? buildChapterReadinessReport(snapshot);
  const qaReport = snapshot.data.qaReport;

  if ((snapshot.data.readinessReport?.imageCounts.generatedImages ?? 0) > 0 && readinessReport.imageCounts.acceptedImages < readinessReport.imageCounts.minimumImages) {
    return "GENERATION_PARTIAL";
  }

  if (qaReport && readinessReport.imageCounts.acceptedImages >= readinessReport.imageCounts.minimumImages) {
    return qaReport.rejectedPanelCount > 0 ? "NEEDS_FIXES" : "COMPLETED";
  }

  if (readinessReport.imageCounts.generatedImages > 0) return "QA_REVIEW";
  if (snapshot.status === "GENERATING") return "GENERATING";
  if (readinessReport.status === "ready") return "READY_FOR_GENERATION";
  if (snapshot.data.productionPlan) return "PRODUCTION_PLAN_READY";
  if ((snapshot.data.productionOutline?.beats.length ?? 0) > 0) return "OUTLINE_PRODUCTION_READY";
  if ((snapshot.data.editorialOutline?.beats.length ?? 0) > 0) return "OUTLINE_EDITORIAL_READY";
  if (snapshot.data.chapterCanon) return "CANON_READY";
  if (snapshot.data.narrativeContract) return "NARRATIVE_CONTRACT_READY";
  return "DRAFT";
}

export function canTransitionChapterStudioStatus(
  from: ChapterStudioStatus,
  to: ChapterStudioStatus,
): boolean {
  const transitions: Record<ChapterStudioStatus, ChapterStudioStatus[]> = {
    DRAFT: ["NARRATIVE_CONTRACT_READY"],
    NARRATIVE_CONTRACT_READY: ["CANON_READY"],
    CANON_READY: ["OUTLINE_EDITORIAL_READY"],
    OUTLINE_EDITORIAL_READY: ["OUTLINE_PRODUCTION_READY"],
    OUTLINE_PRODUCTION_READY: ["PRODUCTION_PLAN_READY"],
    PRODUCTION_PLAN_READY: ["READY_FOR_GENERATION"],
    READY_FOR_GENERATION: ["GENERATING"],
    GENERATING: ["GENERATION_PARTIAL", "QA_REVIEW"],
    GENERATION_PARTIAL: ["GENERATING", "QA_REVIEW", "NEEDS_FIXES"],
    QA_REVIEW: ["NEEDS_FIXES", "COMPLETED"],
    NEEDS_FIXES: ["GENERATING", "QA_REVIEW", "COMPLETED"],
    COMPLETED: ["PUBLISHED"],
    PUBLISHED: [],
  };

  return transitions[from].includes(to);
}

export function createEmptyChapterStudioSnapshot(): ChapterStudioSnapshot {
  return chapterStudioSnapshotSchema.parse({
    data: {
      characterCanons: [],
      locationCanons: [],
    },
  });
}

export function updateChapterStudioSnapshot(
  snapshot: ChapterStudioSnapshot | null | undefined,
  patch: Partial<ChapterStudioData>,
  input?: {
    currentStep?: ChapterStudioStep;
    transitionReason?: string;
  },
): ChapterStudioSnapshot {
  const base = snapshot ? chapterStudioSnapshotSchema.parse(snapshot) : createEmptyChapterStudioSnapshot();
  const merged = chapterStudioSnapshotSchema.parse({
    ...base,
    currentStep: input?.currentStep ?? base.currentStep,
    data: {
      ...base.data,
      ...patch,
      characterCanons: patch.characterCanons ?? base.data.characterCanons,
      locationCanons: patch.locationCanons ?? base.data.locationCanons,
    },
    updatedAt: new Date().toISOString(),
    autosaveVersion: base.autosaveVersion + 1,
  });

  const readinessReport = buildChapterReadinessReport(merged);
  const nextStatus = resolveChapterStudioStatus({
    ...merged,
    data: {
      ...merged.data,
      readinessReport,
    },
  });

  return {
    ...merged,
    status: nextStatus,
    data: {
      ...merged.data,
      readinessReport,
    },
    history:
      merged.status !== nextStatus && canTransitionChapterStudioStatus(merged.status, nextStatus)
        ? [
            ...merged.history,
            {
              from: merged.status,
              to: nextStatus,
              at: new Date().toISOString(),
              reason: input?.transitionReason ?? null,
            },
          ]
        : merged.history,
  };
}

export function buildLegacyApprovedOutlineFromStudio(
  snapshot: ChapterStudioSnapshot,
): ApprovedChapterOutline | null {
  const productionOutline = snapshot.data.productionOutline;
  if (!productionOutline) return null;

  return {
    summary: snapshot.data.editorialOutline?.summary ?? productionOutline.chapterGoal,
    cliffhanger: productionOutline.cliffhanger,
    beats: productionOutline.beats.map((beat, index) => ({
      id: beat.beatId,
      summary: beat.summary,
      characters: beat.involvedCharacters,
      location: beat.environmentContext[0] ?? snapshot.data.chapterCanon?.currentLocation ?? "Lieu à préciser",
      pageRole: beat.narrativeFunction,
      turn: beat.dramaticChange,
      emotionalDelta: clamp(Math.round((beat.indispensabilityScore - beat.redundancyRisk) / 25), -3, 3),
      structuredBeat: {
        source: snapshot.data.productionOutline?.source === "legacy_adapted" ? "heuristic_fallback" : "generator_structured",
        confidence: clamp((beat.indispensabilityScore - beat.redundancyRisk + 50) / 100, 0.2, 0.98),
        arcPromises: [],
        worldConsequences: [],
        setupPayoffHooks: [],
      },
    })),
    approvedAt: new Date().toISOString(),
    approvalVersion: `studio_${snapshot.autosaveVersion}`,
    source: "user_approved",
  };
}

export function buildStudioSnapshotFromLegacy(input: {
  approvedOutline?: ApprovedChapterOutline | null;
  chapterNumber?: number | null;
  chapterTitle?: string | null;
  chapterSummary?: string | null;
  cliffhanger?: string | null;
  userIntent?: string | null;
}): ChapterStudioSnapshot {
  if (!input.approvedOutline) {
    return createEmptyChapterStudioSnapshot();
  }

  const editorialOutline: EditorialOutline = {
    summary: input.approvedOutline.summary,
    validationNotes: [],
    beats: input.approvedOutline.beats.slice(0, 5).map((beat, index) => ({
      beatId: beat.id,
      label: `Bloc ${index + 1}`,
      summary: beat.summary,
      narrativePurpose: beat.pageRole,
      dramaticShift: beat.turn,
      involvedCharacters: beat.characters,
    })),
  };

  const productionOutline: ProductionOutline = {
    source: "legacy_adapted",
    chapterGoal: input.chapterSummary ?? input.approvedOutline.summary,
    cliffhanger: input.cliffhanger ?? input.approvedOutline.cliffhanger,
    beats: input.approvedOutline.beats.map((beat) => ({
      beatId: beat.id,
      summary: beat.summary,
      narrativeFunction: beat.pageRole,
      whyThisBeatExists: beat.summary,
      dramaticChange: beat.turn,
      involvedCharacters: beat.characters,
      activeCanonConstraints: [],
      environmentContext: [beat.location],
      visualPriority: "high",
      estimatedPanels: 4,
      criticality: "medium",
      continuityDependencies: [],
      indispensabilityScore: 70,
      redundancyRisk: 20,
      infoGained: null,
      emotionProduced: null,
    })),
  };

  return updateChapterStudioSnapshot(
    createEmptyChapterStudioSnapshot(),
    {
      intent: {
        chapterNumber: input.chapterNumber ?? null,
        workingTitle: input.chapterTitle ?? null,
        shortPitch: input.userIntent ?? input.chapterSummary ?? null,
        mainConflict: input.chapterSummary ?? null,
      },
      editorialOutline,
      productionOutline,
      productionPlan: buildProductionPlanFromOutline(productionOutline),
    },
    {
      currentStep: "production_plan",
      transitionReason: "legacy_outline_adapted",
    },
  );
}
