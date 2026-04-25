import { z } from "zod";
import { PREMIUM_PANEL_RANGE } from "../premium-panel-range";
import type { ApprovedChapterOutline } from "./approved-outline";
import type {
  NarrativeFact,
  RequiredProp,
  PresenceObligation,
} from "./narrative-facts";

// ─── Schémas Zod légers pour les types premium ────────────────────────────────
// Ces schémas permettent la validation runtime sans duplication des interfaces.

const narrativeFactSchema = z.object({
  id: z.string(),
  beatId: z.string(),
  type: z.string(),
  actorIds: z.array(z.string()).default([]),
  targetIds: z.array(z.string()).default([]),
  propCandidates: z.array(z.string()).default([]),
  locationSignals: z.array(z.string()).default([]),
  requiredVisibility: z.string().default("may_show"),
  evidenceStrength: z.number().default(0.5),
  source: z.string().default("inference"),
  notes: z.array(z.string()).optional(),
});

const requiredPropSchema = z.object({
  id: z.string(),
  canonicalName: z.string(),
  aliases: z.array(z.string()).default([]),
  category: z.string().default("other"),
  narrativeRole: z.string().default("worldbuilding"),
  requiredForBeatIds: z.array(z.string()).default([]),
  visibilityMode: z.string().default("in_hand"),
  mustBeVisible: z.boolean().default(false),
  confidence: z.number().default(0.5),
  source: z.string().default("story_inference"),
});

const presenceObligationSchema = z.object({
  id: z.string(),
  beatId: z.string(),
  entityType: z.string().default("hero"),
  entityIdOrLabel: z.string(),
  requirement: z.string().default("should_show"),
  reason: z.string(),
});

const chapterObjectStateSchema = z.object({
  objectId: z.string(),
  canonicalName: z.string().optional().default(""),
  label: z.string().optional(),
  ownerCharacterId: z.string().optional().nullable(),
  sceneId: z.string().optional().nullable(),
  state: z.string().default("carried"),
  beatId: z.string().optional().default(""),
  visibility: z.string().optional(),
});

const chapterFocusBudgetSchema = z.object({
  totalPanels: z.number().int().min(0).default(0),
  heroCenterRatio: z.number().min(0).max(1).default(1),
  heroFocusPanels: z.number().int().min(0).default(0),
  enemyFocusPanels: z.number().int().min(0).default(0),
  environmentPanels: z.number().int().min(0).default(0),
  propInsertPanels: z.number().int().min(0).default(0),
  reactionPanels: z.number().int().min(0).default(0),
  speakerPanels: z.number().int().min(0).default(0),
  groupPanels: z.number().int().min(0).default(0),
  cutawayPanels: z.number().int().min(0).default(0),
  cutawayCount: z.number().int().min(0).default(0),
  cutawayRatio: z.number().min(0).max(1).default(0),
  npcPanels: z.number().int().min(0).default(0),
  focusDistribution: z.record(z.string(), z.number()).default({}),
  shotDistribution: z.record(z.string(), z.number()).default({}),
  violations: z.array(z.object({
    type: z.string(),
    message: z.string(),
    severity: z.enum(["warning", "blocking"]),
  })).default([]),
});

const panelBlueprintPremiumSchema = z.object({
  panelId: z.string(),
  beatId: z.string(),
  panelIndex: z.number().int().min(0).optional(),
  pageNumber: z.number().int().optional().nullable(),
  panelNumber: z.number().int().min(1).default(1),
  purpose: z.string(),
  shotType: z.string(),
  cameraAngle: z.string(),
  subjectFocus: z.string(),
  secondaryFocus: z.string().optional().nullable(),
  requiredCharacters: z.array(z.string()).optional(),
  requiredCharacterIds: z.array(z.string()).optional(),
  mustShowCharacterIds: z.array(z.string()).optional(),
  mayShowCharacterIds: z.array(z.string()).optional(),
  mustShowEnemy: z.boolean().default(false),
  requiredNpcCount: z.number().int().min(0).default(0),
  requiredProps: z.array(requiredPropSchema).default([]),
  optionalProps: z.array(requiredPropSchema).optional(),
  presenceObligations: z.array(presenceObligationSchema).optional(),
  requiredLocationSignals: z.array(z.string()).default([]),
  speakerAnchorCharacterId: z.string().optional().nullable(),
  speakerAnchorCharacterName: z.string().optional().nullable(),
  dialogueCarrier: z.enum(["speaker_visible", "offscreen_allowed", "narration"]).optional().nullable(),
  dialogueLinesAnchored: z.number().int().min(0).optional(),
  cutawayType: z.string().default("none"),
  heroCenterAllowed: z.boolean().default(true),
  criticality: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  // P4.1 : panel contractualement critique (arme, décor d'établissement, reveal, foule).
  contractualCritical: z.boolean().optional(),
  notes: z.array(z.string()).optional(),
});

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
  // Optionnel : score de complétude du CharacterCanonPack (0..1).
  // Utilisé par buildChapterReadinessReport pour émettre un warning si un
  // personnage MAIN/CORE part en génération sans canonPack solide, ce qui
  // provoque des dérives visuelles chapitre après chapitre.
  canonPackCompleteness: z.number().min(0).max(1).optional().nullable(),
  hasCanonPack: z.boolean().optional(),
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
  // Premium narrative intelligence fields — tous optionnels pour compatibilité ascendante
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
  // Premium intelligence fields — tous optionnels pour compatibilité ascendante
  panelBlueprints: z.array(panelBlueprintPremiumSchema).optional(),
  focusDistribution: z.record(z.string(), z.number()).optional(),
  shotDistribution: z.record(z.string(), z.number()).optional(),
  propCoverage: z.object({ covered: z.array(z.string()), missing: z.array(z.string()) }).optional(),
  enemyCoverage: z.object({ panelCount: z.number(), beatsCovered: z.array(z.string()) }).optional(),
  npcCoverage: z.object({ panelCount: z.number(), avgNpcCount: z.number() }).optional(),
  dialogueAnchorCoverage: z.object({ anchored: z.number().default(0), floating: z.number().default(0) }).optional(),
  cutawayCoverage: z.object({ count: z.number().default(0), ratio: z.number().default(0) }).optional(),
  heroCenterRatio: z.number().min(0).max(1).optional(),
  premiumReadinessScore: z.number().min(0).max(1).optional(),
  focusBudget: chapterFocusBudgetSchema.optional(),
  objectStateTimeline: z.array(chapterObjectStateSchema).optional(),
});

export type ProductionPlan = z.infer<typeof productionPlanSchema>;

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
  action: z.enum(["open_step", "focus_field", "generate_outline", "open_generation", "open_review"]).default("open_step"),
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
  // Diagnostic structuré du contrat de production — exposé pour éviter aux
  // composants UI de recalculer la logique `panelBlueprints vs minimumImages`.
  // Optionnel pour compatibilité ascendante avec snapshots persistés avant P0.
  panelBlueprintCount: z.number().int().min(0).optional(),
  contractStatus: chapterContractStatusSchema.optional(),
  // P1.1 — booléen dérivé `contractStatus === "ok"`, exposé pour éviter aux
  // composants UI de refaire la comparaison. Source de vérité unique pour les
  // badges "contrat complet" / "contrat incomplet" dans la plan-step et la
  // pipeline page.
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
  // Premium contractual QA scores
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
  /** Profil look visuel autoritaire du chapitre — source de vérité style */
  chapterLookProfile: chapterLookProfileSchema.optional(),
  /** Préférences pipeline (flags optionnels persistés avec le snapshot studio). */
  pipelinePreferences: chapterPipelinePreferencesSchema.optional(),
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

// Helpers (builders, readiness, status, snapshot, legacy bridge)
// extraits dans ./chapter-studio-helpers.ts et ré-exportés via ./index.ts
