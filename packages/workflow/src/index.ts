export * from "./inngest-client";
export * from "./functions";
export * from "./events";
export * from "./chapter-runtime-helpers";
// Pipeline v3 — feature flags + passes (Story Architect -> Manga Editor -> Panel Renderer)
export {
  isPipelineV3StoryboardEnabled,
  isPipelineV3RenderFalEnabled,
  isPipelineV3MangaEditorLlmEnabled,
  isLegacyPipelineEnabled,
  getPipelineFeatureFlags,
} from "./pipeline-feature-flags";
export { LegacyPipelineDisabledError } from "./run-legacy-compatible-chapter-pipeline";
export { runStoryPass } from "./passes/story-pass";
export type { RunStoryPassInput, RunStoryPassResult } from "./passes/story-pass";
export { runStoryboardPass } from "./passes/storyboard-pass";
export type {
  RunStoryboardPassInput,
  RunStoryboardPassResult,
} from "./passes/storyboard-pass";
export { runRenderPass } from "./passes/render-pass";
export {
  buildProviderPayloadPreview,
  dumpPanelDebugArtifacts,
} from "./debug/panel-debug-dump";
export type {
  DumpPanelDebugArtifactsInput,
  PanelDebugDumpPhase,
} from "./debug/panel-debug-dump";
export type { RunRenderPassInput, RunRenderPassResult } from "./passes/render-pass";
export { runPanelQaPass } from "./passes/panel-qa-pass";
export type {
  PanelQaPassInput,
  PanelQaPassOutput,
  PanelQaResult,
} from "./passes/panel-qa-pass";
export { runPageQaPass } from "./passes/page-qa-pass";
export type { PageQaPassOutput, PageQaResult } from "./passes/page-qa-pass";
export { loadChapterVisualMemory } from "./passes/load-chapter-visual-memory";
export type {
  LoadChapterVisualMemoryInput,
  LoadChapterVisualMemoryResult,
} from "./passes/load-chapter-visual-memory";
export { createDefaultPanelImageGenerator } from "./passes/default-panel-image-generator";
export type {
  DefaultPanelImageGeneratorArgs,
  DefaultPanelImageGeneratorResult,
} from "./passes/default-panel-image-generator";
export {
  saveStoryArc,
  loadStoryArc,
  extractStoryArcFromOutline,
} from "./persistence/story-persistence";
export {
  saveStoryboardPlan,
  loadStoryboardPlan,
  extractStoryboardPlanFromOutline,
  STORYBOARD_PLAN_OUTLINE_KEY,
} from "./persistence/storyboard-persistence";
export {
  saveRenderPassResult,
  loadRenderPassResult,
} from "./persistence/render-persistence";
export type { RenderPassResultSummary } from "./persistence/render-persistence";
export { runChapterOutlineFromJob, runOutlineForChapterId } from "./run-outline-for-chapter";
export { runFullChapterPipelineFromJob } from "./run-full-chapter-pipeline";
export { buildStyleBibleFromUserProject } from "./chapter-style-bible-resolver";
export { assertPremiumContractFromChapter } from "./passes/assert-premium-contract-guard";
export type { PremiumContractGuardResult } from "./passes/assert-premium-contract-guard";
export * from "./stable-image-refs";
// P2.1 — Contrat partagé de persistence image (workflow + web).
export {
  persistImageIfNeeded,
  type PersistedImageResult,
} from "./pipeline-image-persistence";
export {
  assertStableImageUrl,
  checkStableImageUrl,
  isDataUrl,
  isHttpImageUrl,
  isAlreadyStableStorageUrl,
  looksLikeBflDelivery,
} from "./pipeline-helpers";
export { normalizeLocationName, locationNamesEqual } from "./passes/narrative/location-matcher";
export { logPipeline, logPipelineInfo, logPipelineWarn, logPipelineError } from "./lib/pipeline-logger";
export {
  emitHeroBiasOnNonHeroPanel,
  emitNpcDriftDetected,
  emitDecorDriftDetected,
  emitPanelRetry,
  emitNpcAiFallback,
  emitImagePersistFailed,
  emitManualVisualRefNonCanonical,
  emitChapterStabilityScore,
  computeChapterStabilityScore,
  type BusinessMetricContext,
  type BusinessMetricEvent,
} from "./lib/business-metrics";
export type { PipelineLogLevel, PipelineLogOptions } from "./lib/pipeline-logger";
export {
  entityRegistrySchema,
  objectStateTimelineSchema,
  characterFingerprintSchema,
  parseEntityRegistry,
  parseObjectStateTimeline,
  parseCharacterFingerprint,
} from "./schemas/pipeline-contracts";
export type { EntityRegistry, ObjectStateEntry, CharacterFingerprint } from "./schemas/pipeline-contracts";
// P0.5 — Quality guard status for degraded mode handling
export {
  createQualityGuardStatus,
  recordVisionFailure,
  recordSimilarityFailure,
  recordVisionSuccess,
  recordSimilaritySuccess,
  isDegradedMode,
  getDegradedModeLabel,
  shouldSkipReroll,
} from "./quality-guard-status";
export type {
  QualityGuardMode,
  QualityGuardStatus,
  RerollPolicyAdjustment,
} from "./quality-guard-status";
// P1.1 — Generation intent planner
export {
  buildPanelGenerationIntent,
  planChapterGenerationIntents,
} from "./generation-intent-planner";
export type {
  PanelIntentType,
  DominantSubjectType,
  FramingCategory,
  ReferencePolicyIntent,
  PanelGenerationIntent,
  RequiredEntity,
  IntentRequiredProp,
  SuppressedEntity,
  RequiredReferenceSet,
  VisualHierarchyLayer,
  GenerationIntentPlannerInput,
  PanelPlanInput,
  CharacterCastInfo,
  LocationCanonInfo,
  NarrativeFactInput,
} from "./generation-intent-planner";
// P1.3 — Prompt recipe builder
export {
  buildPromptRecipe,
  validatePromptRecipe,
  getRecipeDebugInfo,
} from "./prompt-recipe-builder";
export type {
  PromptRecipe,
  PromptBlockInstruction,
  PromptBlockExclusion,
  PromptBlockOverride,
  PromptBlockType,
  ElementWeights,
} from "./prompt-recipe-builder";
// P2.1 — Shared spotlight mode
export {
  calculateSpotlightBalance,
  resolveSpotlightMode,
  selectCompositionType,
  resolveSubjectLockBehavior,
  buildSharedSpotlightConfig,
  isSharedSpotlightNeeded,
  getSharedSpotlightDebugInfo,
} from "./shared-spotlight";
export type {
  SharedSpotlightConfig,
  SpotlightMode,
  CompositionType,
  SubjectLockBehavior,
  SpotlightPromptModifiers,
  CharacterSpotlightInput,
  SharedSpotlightInput,
  NarrativeContext,
} from "./shared-spotlight";
// P2.2 — Subject balance score
export {
  calculateTargetBalanceScore,
  calculateTargetProminencePerSubject,
  calculateObservedBalanceScore,
  determineBalanceRecommendation,
  computeSubjectBalanceScore,
  isBalanceRerollNeeded,
  getBalanceScoreLabel,
  calculateChapterBalanceMetrics,
} from "./subject-balance-score";
export type {
  SubjectBalanceScore,
  BalanceRecommendation,
  BalanceScoreInput,
  BalanceThresholds,
} from "./subject-balance-score";
// P3.2 — Entity relegation
export {
  buildRelegationConfig,
  isHeroRelegated,
  getHeroRelegationTokens,
  getAllRelegationPromptTokens,
  getAllRelegationNegativeTokens,
} from "./entity-relegation";
export type {
  RelegationMode,
  RelegatedEntity,
  RelegationConfig,
  RelegationInput,
} from "./entity-relegation";
// P5.1 — Vision concurrency budget
export {
  createVisionConcurrencyBudget,
  adjustBudgetForQualityGuard,
  canMakeVisionCall,
  recordVisionCallStart,
  recordVisionCallEnd,
  recordVisionCallSkipped,
  getVisionConcurrencyRecommendation,
  getVisionBudgetDebugInfo,
} from "./vision-concurrency-budget";
export type {
  VisionConcurrencyBudget,
  VisionBudgetConfig,
  VisionCallDecision,
  VisionBlockReason,
  ConcurrencyRecommendation,
} from "./vision-concurrency-budget";
// P5.2 — Reroll decision
export {
  makeRerollDecision,
  getRerollDecisionDebugInfo,
  shouldPreserveReferences,
  canUseVisionForReroll,
} from "./reroll-decision";
export type {
  RerollType,
  RerollDecisionResult,
  RerollBlockReason,
  RerollAdjustments,
  RerollDecisionInput,
} from "./reroll-decision";
// P7.1 — Panel hierarchy logger
export {
  buildPanelHierarchyLog,
  formatPanelHierarchyLog,
  logPanelHierarchy,
  aggregateChapterHierarchyLogs,
  formatChapterHierarchySummary,
} from "./panel-hierarchy-logger";
export type {
  PanelHierarchyLog,
  IntentSummary,
  HierarchySummary,
  DecisionsSummary,
  ChapterHierarchySummary,
} from "./panel-hierarchy-logger";
// P7.2 — Drift metrics
export {
  calculateDriftMetrics,
  formatDriftMetrics,
  isDriftAcceptable,
  getDriftAlerts,
} from "./drift-metrics";
export type {
  DriftMetrics,
  CharacterDriftMetrics,
  EnvironmentDriftMetrics,
  HeroContaminationMetrics,
  PanelDriftInput,
} from "./drift-metrics";
// P0.1/P0.4 — Effective prompt source + promptDebug snapshot
export {
  resolveEffectivePanelPromptSource,
  buildPromptDebugSnapshot,
} from "./effective-prompt-source";
export type {
  EffectivePromptSource,
  PromptSourceKind,
  PromptDebugSnapshot,
  ResolveEffectivePromptSourceInput,
  BuildPromptDebugSnapshotInput,
} from "./effective-prompt-source";
// Phase 1 — Prompt action linter + narrative truth pass
export {
  lintPromptAgainstActionContract,
} from "./prompt-action-linter";
export type {
  LintPromptInput,
  LintPromptResult,
} from "./prompt-action-linter";
export {
  runNarrativeTruthPass,
} from "./passes/narrative-truth-pass";
export type {
  NarrativeTruthInput,
  NarrativeTruthResult,
} from "./passes/narrative-truth-pass";
// P1.1 — Runtime guard against residual French tokens in provider prompts
export {
  evaluatePromptLanguage,
  enforcePromptLanguageGuard,
  ResidualFrenchPromptError,
} from "./prompt-language-guard";
export type {
  PromptLanguageGuardOutcome,
  PromptLanguageGuardResult,
  EvaluatePromptLanguageInput,
} from "./prompt-language-guard";
// Chapter visual compiler — 70–75 images per chapter
export {
  buildChapterImagePlan,
  resolveImageIntent,
  resolveDominantSubjectForIntent,
  validateChapterImagePlan,
} from "./chapter-image-plan-builder";
export type {
  ChapterImagePlanItem,
  ChapterImagePlanBuilderInput,
  ChapterImagePlanValidationResult,
  ChapterBeatPlanInput,
  ChapterPanelPlanInput,
} from "./chapter-image-plan-builder";
