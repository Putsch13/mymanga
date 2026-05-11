/**
 * chapter-studio — façade publique des schémas Zod studio.
 *
 * Le module a été splitté (audit-v9) pour rester sous 500 lignes/fichier.
 * Tous les imports historiques restent valides via ce fichier.
 *
 * Couches :
 *   - `chapter-studio-premium-schemas` : narrative facts, props, presence,
 *                                        focus budget, panel blueprint premium
 *   - `chapter-studio-canon-schemas`   : enums (status, step, tier, lock),
 *                                        project / outfit / character / location canon
 *   - `chapter-studio-outline-schemas` : intent, narrative contract, character
 *                                        selection, canon input, editorial /
 *                                        production outline & plan
 *   - `chapter-studio-readiness-schemas` : image counts, readiness, qa,
 *                                          creative controls
 *   - `chapter-studio-world-schemas`   : entity registry + world contracts
 *                                        (NPC, créatures, props, véhicules, factions)
 *   - `chapter-studio-snapshot-schemas` : autofill, estimate context, look,
 *                                         pipeline prefs, wizard, studioData,
 *                                         snapshot top-level
 */

export {
  narrativeFactSchema,
  requiredPropSchema,
  presenceObligationSchema,
  chapterObjectStateSchema,
  chapterFocusBudgetSchema,
  panelBlueprintPremiumSchema,
} from "./chapter-studio-premium-schemas";

export {
  chapterStudioStepSchema,
  chapterStudioStatusSchema,
  canonLockStrengthSchema,
  characterImportanceTierSchema,
  projectCanonSchema,
  outfitCanonSchema,
  characterCanonSchema,
  locationCanonSchema,
} from "./chapter-studio-canon-schemas";
export type {
  ChapterStudioStep,
  ChapterStudioStatus,
  CanonLockStrength,
  CharacterImportanceTier,
  ProjectCanon,
  OutfitCanon,
  CharacterCanon,
  LocationCanon,
  ChapterLocationContract,
} from "./chapter-studio-canon-schemas";

export {
  chapterIntentSchema,
  chapterNarrativeContractSchema,
  chapterCharacterSelectionSchema,
  chapterCanonInputSchema,
  editorialOutlineBeatSchema,
  editorialOutlineSchema,
  productionBeatSchema,
  productionOutlineSchema,
  productionPlanPageSchema,
  productionPlanAdjustmentSchema,
  productionPlanSchema,
} from "./chapter-studio-outline-schemas";
export type {
  ChapterIntent,
  ChapterNarrativeContract,
  ChapterCharacterSelection,
  ChapterCanonInput,
  EditorialOutline,
  ProductionBeat,
  ProductionOutline,
  ProductionPlanPage,
  ProductionPlanAdjustment,
  ProductionPlan,
} from "./chapter-studio-outline-schemas";

export {
  chapterImageCountSchema,
  chapterReadinessIssueSchema,
  chapterContractStatusSchema,
  chapterLaunchBlockedReasonSchema,
  chapterReadinessReportSchema,
  qaAxisScoreSchema,
  qaPanelResultSchema,
  chapterQAReportSchema,
  chapterCreativeControlsSchema,
} from "./chapter-studio-readiness-schemas";
export type {
  ChapterImageCount,
  ChapterReadinessIssue,
  ChapterContractStatus,
  ChapterLaunchBlockedReason,
  ChapterReadinessReport,
  ChapterQAReport,
  ChapterCreativeControls,
} from "./chapter-studio-readiness-schemas";

export {
  chapterEntityKindSchema,
  chapterEntityEntrySchema,
  crowdGroupSchema,
  chapterEntityRegistrySchema,
  chapterWorldNpcContractSchema,
  chapterWorldCreatureContractSchema,
  chapterWorldPropContractSchema,
  chapterWorldVehicleContractSchema,
  chapterWorldFactionContractSchema,
  chapterEntitiesSchema,
} from "./chapter-studio-world-schemas";
export type {
  ChapterEntityKind,
  ChapterEntityEntry,
  ChapterEntityRegistry,
  ChapterWorldNpcContract,
  ChapterWorldCreatureContract,
  ChapterWorldPropContract,
  ChapterWorldVehicleContract,
  ChapterWorldFactionContract,
  ChapterEntities,
} from "./chapter-studio-world-schemas";

export {
  autofillMetaSchema,
  estimateCanonicalProductionPlanSchema,
  estimateContextSchema,
  chapterLookProfileModeSchema,
  chapterLookProfileSchema,
  chapterPipelinePreferencesSchema,
  chapterWizardStateSchema,
  chapterStudioDataSchema,
  chapterStudioSnapshotSchema,
} from "./chapter-studio-snapshot-schemas";
export type {
  AutofillMeta,
  EstimateCanonicalProductionPlan,
  EstimateContext,
  ChapterLookProfileMode,
  ChapterLookProfileStudio,
  ChapterPipelinePreferences,
  ChapterWizardState,
  ChapterStudioData,
  ChapterStudioSnapshot,
} from "./chapter-studio-snapshot-schemas";
