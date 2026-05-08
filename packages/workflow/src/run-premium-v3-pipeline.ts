import {
  buildOutlineTextForSanitizer,
  buildVisualCoverageGapClassificationContext,
  classifyVisualCoverageGaps,
  enrichPremiumBlueprintsSceneDialogue,
  extractRequiredVisualCoverage,
  extractRequiredVisualCoverageFromProductionPlan,
  sanitizeVisualContractBeforeCoverage,
  extractChapterVisualContract,
  mergeRequiredVisualCoverageWithContract,
  validateVisualCoverage,
  type StoryArc,
} from "@manga-ai-studio/ai";
import {
  PREMIUM_PANEL_RANGE,
  PRODUCTION_RULES,
  canonicalPlanToPanelBlueprints,
  ensureCanonicalProductionPlan,
  mergeRawBlueprintsWithCanonicalRhythm,
  resolveProductionOutlineForPremiumPipeline,
  hydrateBlueprintsWithCharacterDna,
  hydrateBlueprintsWithEnvironmentDna,
  hydrateBlueprintsWithNpcDna,
  hydrateBlueprintsWithPropDna,
  characterVisualDnaForRenderFromPremiumRow,
  buildChapterCastContract,
  assertValidChapterCastContract,
  formatCastContractLog,
  orderedEditorHeroCharacterIds,
  buildChapterStoryContract,
  assertValidChapterStoryContract,
  formatStoryContractLog,
  buildChapterGenerationContractFromPremiumPlan,
  assertValidChapterGenerationContract,
  type CanonicalChapterProductionPlan,
  type CharacterCanon,
  type PanelBlueprintPremium,
  type ChapterCastContract,
  type ChapterStoryContract,
  type VisualWorldContract,
  parseVisualWorldContract,
  legacyDialogueLinesFromStoryboardPanelLike,
  type StoryboardPanelLikeForTextContract,
} from "@manga-ai-studio/core";
import { createDefaultPanelImageGenerator } from "./passes/default-panel-image-generator";
import { loadChapterVisualMemory } from "./passes/load-chapter-visual-memory";
import { runPageQaPass } from "./passes/page-qa-pass";
import { runRenderPass } from "./passes/render-pass";
import { runStoryPass } from "./passes/story-pass";
import { buildStoryboardPlanFromApprovedProductionPlan } from "./build-storyboard-plan-from-approved-production-plan";
import { buildStoryboardPlanFromCanonicalPlan } from "./build-storyboard-plan-from-canonical-plan";
import { buildStoryArcFromProductionPlan } from "./build-story-arc-from-production-plan";
import { buildStoryboardPlanFromPremiumBlueprints } from "./passes/storyboard-from-premium-plan";
import { runStoryboardPass } from "./passes/storyboard-pass";
import { buildStyleBibleFromUserProject } from "./chapter-style-bible-resolver";
import { isPipelineV3RenderFalEnabled } from "./pipeline-feature-flags";
import { loadLocationsForV3StoryPass, type PremiumV3PipelineLocation, premiumV3PipelineLocationsToStoryArchitectLocations, v3PipelineLocationsToKnownLocations, v3PipelineLocationToResolverUserLocation } from "./load-locations-for-v3-story-pass";
import {
  loadChapterVisualContractUi,
  saveChapterVisualContractSnapshot,
} from "./persistence/chapter-visual-contract-persistence";
import { saveStoryboardPlan } from "./persistence/storyboard-persistence";
import { computeEntityCoverageTelemetry, formatEntityCoverageTypesLine } from "./passes/entity-coverage-telemetry";
import {
  ensureDialogueBeatsHaveAnchors,
  ensureDialogueAndSfxForPremiumBlueprints,
  runDialogueQaOnBlueprints,
} from "./passes/dialogue-beat-rebalance";
import { applyPanelNarrativeVariationToBlueprints } from "./passes/panel-narrative-variation-planner";
import { buildVisualEntitiesFromPremiumV3Input } from "./passes/visual-entity-registry";
import {
  isPremiumMangaCutawayBlueprint,
  rebalancePremiumBlueprintsForManga,
} from "./passes/premium-manga-rebalance";
import { runMangaStructureQaOnBlueprints } from "./passes/manga-structure-qa";
import { runPreRenderPremiumQaOrThrow } from "./passes/pre-render-premium-qa";
import {
  runEnvironmentAnchorPass,
  extractPrimaryEnvironmentAnchorId,
} from "./passes/environment-anchor-pass";
import { runRenderModeNormalizer } from "./passes/render-mode-normalizer";
import { runCharacterIdentityFallback } from "./passes/character-identity-fallback";
import { runNarrativeContractQa } from "./passes/validate-beat-narrative-contract";
import { repairStoryboardVisualCoverage } from "./passes/repair-storyboard-visual-coverage";
import {
  assertPremiumVisualQaConfig,
  getPremiumVisualQaConfigStatus,
  isPremiumVisualQaStrictlyRequired,
} from "./passes/assert-premium-visual-qa-config";
import { runBeatCoverageQaPass, formatBeatCoverageQaLog } from "./passes/beat-coverage-qa-pass";
import { runEmotionalArcQaPass, formatEmotionalArcQaLog } from "./passes/emotional-arc-qa-pass";
import { runInteractionQaPass, formatInteractionQaLog } from "./passes/interaction-qa-pass";
import { runPropsQaPass, formatPropsQaLog } from "./passes/props-qa-pass";
import {
  runVisualWorldDiscoveryPass,
  formatVisualWorldDiscoveryLog,
  type VisualWorldDiscoveryPassResult,
} from "./passes/visual-world-discovery-pass";
import {
  runCanonResolverPass,
  formatCanonResolverLog,
} from "./passes/canon-resolver-pass";
import {
  mergeNpcGroupsFromBlueprintsAndStoryTextRegex,
  type LegacyNpcGroupForCast,
} from "./passes/merge-npc-groups-legacy-regex";
import { runStoryContractCompletenessQa, formatStoryContractCompletenessLog } from "./passes/story-contract-completeness-qa";
import {
  assertPremiumAiEnginesReady,
  assertDialogueResultNotFallback,
  assertStoryArchitectResultNotFallback,
  assertMangaEditorResultNotFallback,
} from "./passes/assert-premium-ai-engines-ready";
import {
  assertPremiumOnlyV3Config,
  dedupePipelineWarnings as dedupeWarningsHelper,
  extractNpcGroupsFromBlueprints,
  hasApprovedPlanDrivenInput as hasApprovedPlanDrivenInputHelper,
  mergeDiscoveryContractNpcGroupsIntoMap,
  npcGroupsFromVisualWorldForCast,
  resolveLocationsForStoryPass,
  resolveProjectFormat,
} from "./passes/_pipeline-v3-helpers/pipeline-input-helpers";

export type { PremiumV3PipelineLocation } from "./load-locations-for-v3-story-pass";

export interface PremiumV3PipelineCharacter {
  id: string;
  name: string;
  roleType?: string | null;
  hairColor?: string | null;
  eyeColor?: string | null;
  hairStyle?: string | null;
  skinTone?: string | null;
  outfitSignature?: string | null;
  accessories?: string[] | null;
  bodyType?: string | null;
  ageApparent?: string | null;
  distinctiveMarks?: string[] | null;
  canonSignatureText?: string | null;
  forbiddenVisualDrift?: string[] | null;
  canonLocked?: boolean | null;
  faceRefUrl?: string | null;
  silhouetteRefUrl?: string | null;
  loraUrl?: string | null;
  loraTriggerWord?: string | null;
  loraScale?: number | null;
  /** JSON configurateur — hydratation `visualCanonExcerpt` sur blueprints. */
  stableVisualDNA?: Record<string, unknown> | null;
  characterFingerprint?: unknown;
  visualProfile?: unknown;
  wardrobeProfile?: unknown;
  bodyState?: unknown;
  continuityProfile?: unknown;
  visualRefs?: unknown;
  visualLocks?: unknown;
  canonPack?: unknown;
  loraAttachments?: unknown;
}

export interface RunPremiumV3PipelineInput {
  chapterId: string;
  projectId: string;
  chapterNumber: number;
  chapterTitle: string | null;
  chapterSummary: string | null;
  chapterUserIntent: string | null;
  project: Record<string, unknown> | null;
  stylePacks: Array<Record<string, unknown>>;
  rawCharacters: PremiumV3PipelineCharacter[];
  /** Outline approuvé (traçabilité / futurs garde-fous) — le storyboard vient du productionPlan. */
  approvedOutline?: Record<string, unknown> | null;
  /** Plan premium persisté : source de vérité en mode approved_plan_driven. */
  productionPlan?: Record<string, unknown> | null;
  heroCharacterId?: string | null;
  /** Héros 2 (studio) — intégré au cast contract et priorisé pour le storyboard duo. */
  secondaryHeroCharacterId?: string | null;
  focusCharacterIds: string[];
  activeNpcIds?: string[];
  activeCreatureIds?: string[];
  locationIds?: string[];
  /** Lieux résolus (fiche projet). Sinon on résout `locationIds` en base avant le story-pass. */
  locations?: PremiumV3PipelineLocation[];
  pipelineV3Enabled: boolean;
  premiumV3OnlyEnabled: boolean;
  productionPlanPages?: Array<{ pageNumber: number; panelCount: number; beatIds?: string[] | null }>;
  panelBlueprints?: PanelBlueprintPremium[];
  /** Studio / snapshot — enrichit `characterVisualDna` comme estimate & launch. */
  characterCanonsById?: Record<string, CharacterCanon> | null;
  chapterLocationName?: string | null;
  /** Répliques du chapitre précédent (normalisées) — alimente le dialoguiste scène si activé. */
  priorChapterDialogueSnippets?: string[] | null;
  /** Studio : forcer le dialoguiste scène pour ce run (cumulable avec OPENAI_SCENE_DIALOGUE_ENRICH). */
  sceneDialogueEnrich?: boolean;
  /** Intention compilée persistée (studio) — hash `userIntent` / traçabilité premium. */
  chapterIntentContract?: Record<string, unknown> | null;
  /** VisualWorld persisté au studio — prioritaire pour `visualWorldHash` si présent. */
  persistedVisualWorldContract?: Record<string, unknown> | null;
  /** DialogueContract validé studio — prioritaire sur l’empreinte dérivée des blueprints. */
  chapterDialogueContract?: Record<string, unknown> | null;
  /** Sprint 2 — beat IDs that have at least one required DialogueAct. */
  requiredDialogueActBeatIds?: string[];
}

export interface RunPremiumV3PipelineResult {
  v3RenderSucceeded: boolean;
  /** Résumé découverte monde (IA vs regex) — audit / `Job.output`. */
  visualWorldDiscovery?: Pick<
    VisualWorldDiscoveryPassResult,
    "discoverySource" | "visualWorldComposeMeta"
  > | null;
  /**
   * Avertissements non bloquants (dialogue scène, pré-rendu QA, render…)
   * — surfacés dans le studio via `Job.output.pipelineUserWarnings`.
   */
  pipelineUserWarnings?: string[];
}

/**
 * Vrai dès qu'un `productionPlan` non vide avec ≥ 1 panelBlueprint est
 * fourni — déclenche le mode "approved plan driven" (skip de tout le
 * re-build de plan). Réexporté ici pour préserver l'API publique du
 * module ; l'implémentation vit dans `passes/_pipeline-v3-helpers/`.
 */
export function hasApprovedPlanDrivenInput(input: RunPremiumV3PipelineInput): boolean {
  return hasApprovedPlanDrivenInputHelper(input);
}

export async function runPremiumV3Pipeline(
  input: RunPremiumV3PipelineInput,
): Promise<RunPremiumV3PipelineResult> {
  assertPremiumOnlyV3Config(input);

  if (input.premiumV3OnlyEnabled) {
    const chapterHasDialogue = input.panelBlueprints?.some(
      (bp) => bp.dialogueCarrier === "speaker_visible" || /dialogue|parl/i.test(bp.purpose ?? "")
    ) ?? false;
    assertPremiumAiEnginesReady({
      chapterHasDialogue,
      chapterNumber: input.chapterNumber,
    });
  }

  let visualQaProductionConfigSkipped = false;
  if (input.premiumV3OnlyEnabled && process.env.NODE_ENV === "production") {
    const visualCfg = getPremiumVisualQaConfigStatus();
    if (!visualCfg.ok) {
      if (isPremiumVisualQaStrictlyRequired()) {
        assertPremiumVisualQaConfig();
      } else {
        visualQaProductionConfigSkipped = true;
        console.warn(
          `[pipeline:v3] premium_visual_qa_config_skipped chapterId=${input.chapterId} ` +
            `PREMIUM_VISUAL_QA_REQUIRED=false missing=${visualCfg.missing.join(",")} — rendu avec needs_review`,
        );
      }
    }
  }

  let v3RenderSucceeded = false;
  let visualWorldDiscoveryAudit: Pick<
    VisualWorldDiscoveryPassResult,
    "discoverySource" | "visualWorldComposeMeta"
  > | null = null;
  if (!input.pipelineV3Enabled) {
    return { v3RenderSucceeded, visualWorldDiscovery: null };
  }

  const pipelineStartMs = Date.now();
  const timings: Record<string, number> = {};
  const pipelineUserWarnings: string[] = [];

  const dedupePipelineWarnings = (): string[] | undefined =>
    dedupeWarningsHelper(pipelineUserWarnings);

  try {
    if (visualQaProductionConfigSkipped) {
      pipelineUserWarnings.push(
        "QA visuelle production incomplète : rendu possible en « needs_review » (clés serveur manquantes ou PREMIUM_VISUAL_QA_REQUIRED=false).",
      );
    }

    const approvedPlanDriven = hasApprovedPlanDrivenInput(input);
    const projectFormat = resolveProjectFormat(input.project, input.projectId);
    const resolvedProductionOutline = resolveProductionOutlineForPremiumPipeline({
      approvedOutlineRaw: input.approvedOutline ?? null,
      productionPlanRaw: input.productionPlan ?? null,
      chapterSummary: input.chapterSummary,
      cliffhangerOverride: null,
    });

    const resolvedBeatIds =
      resolvedProductionOutline?.beats?.map((b: { beatId?: string }) => b.beatId).filter(Boolean) as string[] ?? [];
    const resolvedLocations = await (async () => {
      const locs = input.locations ?? [];
      if (locs.length > 0) return locs;
      if (input.locationIds?.length) {
        return loadLocationsForV3StoryPass({
          projectId: input.projectId,
          locationIds: input.locationIds,
        });
      }
      return [];
    })();

    const styleBibleJson = JSON.stringify(
      buildStyleBibleFromUserProject({ project: input.project, stylePacks: input.stylePacks }),
    ).slice(0, 4000);

    const discoveryInput = {
      chapterId: input.chapterId,
      beats: resolvedProductionOutline?.beats?.map((b: { beatId?: string; summary?: string; whyThisBeatExists?: string }) => ({
        beatId: b.beatId ?? "",
        summary: b.summary,
        whyThisBeatExists: b.whyThisBeatExists,
      })) ?? [],
      chapterSummary: input.chapterSummary,
      userIntent: input.chapterUserIntent,
      knownCharacters: input.rawCharacters.map((c) => ({
        id: c.id,
        name: c.name,
        roleType: c.roleType,
        description: c.canonSignatureText,
      })),
      knownLocations: v3PipelineLocationsToKnownLocations(resolvedLocations),
      premiumV3OnlyEnabled: Boolean(input.premiumV3OnlyEnabled),
      projectGenre: typeof input.project?.primaryGenre === "string" ? input.project.primaryGenre : null,
      projectTone: typeof input.project?.tone === "string" ? input.project.tone : null,
      styleBibleJson,
      composerBeats: resolvedProductionOutline?.beats?.map(
        (b: {
          beatId: string;
          summary: string;
          whyThisBeatExists: string;
          dramaticChange: string;
          involvedCharacters?: string[];
        }) => ({
          beatId: b.beatId,
          summary: b.summary,
          whyThisBeatExists: b.whyThisBeatExists,
          dramaticChange: b.dramaticChange,
          involvedCharacterIds: b.involvedCharacters ?? [],
        }),
      ),
    };
    const visualDiscoveryResult = await runVisualWorldDiscoveryPass(discoveryInput);
    visualWorldDiscoveryAudit = {
      discoverySource: visualDiscoveryResult.discoverySource,
      visualWorldComposeMeta: visualDiscoveryResult.visualWorldComposeMeta,
    };
    console.info(formatVisualWorldDiscoveryLog(visualDiscoveryResult));
    if (visualDiscoveryResult.visualWorldComposeMeta?.path === "regex_after_compose_error") {
      console.warn(
        `[pipeline:v3:visual-world-compose_fallback] chapterId=${input.chapterId} ` +
          `summary=${visualDiscoveryResult.visualWorldComposeMeta.composeErrorSummary ?? "unknown"}`,
      );
    }

    let persistedVisualWorld: VisualWorldContract | null = null;
    if (input.persistedVisualWorldContract && typeof input.persistedVisualWorldContract === "object") {
      try {
        persistedVisualWorld = parseVisualWorldContract(input.persistedVisualWorldContract);
      } catch (e) {
        console.warn(
          `[pipeline:v3:visual-world] snapshot studio invalide, fallback découverte — ${String(e)}`,
        );
      }
    }
    const discoveredVisualWorld = visualDiscoveryResult.visualWorldContract;
    /** Studio persisté prime sur la découverte (P0.11). */
    const effectiveVisualWorld = persistedVisualWorld ?? discoveredVisualWorld;

    const npcGroupsFromBlueprints = extractNpcGroupsFromBlueprints(input.panelBlueprints);
    // Premium NPC groups must come from VisualWorldContract or canonicalized blueprints.
    // Do not reintroduce regex NPC discovery in this file — legacy merge lives in
    // `merge-npc-groups-legacy-regex.ts` (non-premium path only).
    if (npcGroupsFromBlueprints.length > 0) {
      console.info(
        `[pipeline:v3:npc-groups] extracted ${npcGroupsFromBlueprints.length} groups from blueprints: ` +
          npcGroupsFromBlueprints.map((g) => g.label).join(", "),
      );
    }

    const premium = Boolean(input.premiumV3OnlyEnabled);
    const vw = effectiveVisualWorld;
    const useVisualWorldNpcPrimary =
      premium
      && vw !== null
      && (visualDiscoveryResult.discoverySource === "ai_composed" || persistedVisualWorld !== null);

    let mergedNpcGroups: LegacyNpcGroupForCast[];
    let mergedNpcGroupsMap: Map<string, LegacyNpcGroupForCast>;

    if (useVisualWorldNpcPrimary) {
      mergedNpcGroupsMap = new Map(
        npcGroupsFromVisualWorldForCast(vw).map((g) => [g.label.toLowerCase(), g] as const),
      );
      for (const g of npcGroupsFromBlueprints) {
        if (!mergedNpcGroupsMap.has(g.label.toLowerCase())) {
          mergedNpcGroupsMap.set(g.label.toLowerCase(), g);
        }
      }
      mergedNpcGroups = Array.from(mergedNpcGroupsMap.values());
      console.info(
        `[pipeline:v3:npc-contract] source=visual_world+blueprints groups=${mergedNpcGroups.length} ` +
          `labels=${mergedNpcGroups.map((g) => g.label).join(",")}`,
      );
    } else if (premium) {
      mergedNpcGroups = [...npcGroupsFromBlueprints];
      mergedNpcGroupsMap = new Map(mergedNpcGroups.map((g) => [g.label.toLowerCase(), g] as const));
      if (mergedNpcGroups.length > 0) {
        console.info(
          `[pipeline:v3:npc-contract] source=blueprints_only_premium_no_regex groups=${mergedNpcGroups.length} ` +
            `labels=${mergedNpcGroups.map((g) => g.label).join(",")}`,
        );
      }
    } else {
      const beatTexts = input.panelBlueprints?.map((bp) => bp.purpose ?? bp.sceneContextLabel) ?? [];
      const { merged, map } = mergeNpcGroupsFromBlueprintsAndStoryTextRegex({
        npcGroupsFromBlueprints,
        chapterSummary: input.chapterSummary,
        chapterUserIntent: input.chapterUserIntent,
        beatTexts,
      });
      mergedNpcGroups = merged;
      mergedNpcGroupsMap = map;
      if (mergedNpcGroups.length > 0) {
        console.info(
          `[pipeline:v3:npc-contract] source=blueprints+text_regex groups=${mergedNpcGroups.length} ` +
            `labels=${mergedNpcGroups.map((g) => g.label).join(",")}`,
        );
      }
    }

    const npcMapSizeBeforeDiscovery = mergedNpcGroupsMap.size;
    mergeDiscoveryContractNpcGroupsIntoMap(mergedNpcGroupsMap, visualDiscoveryResult.contract);
    mergedNpcGroups = Array.from(mergedNpcGroupsMap.values());
    if (mergedNpcGroupsMap.size > npcMapSizeBeforeDiscovery) {
      console.info(
        `[pipeline:v3:npc-discovery] discovery_contract_added=${mergedNpcGroupsMap.size - npcMapSizeBeforeDiscovery} ` +
          `total=${mergedNpcGroups.length}`,
      );
    }

    const castContract: ChapterCastContract = buildChapterCastContract({
      chapterId: input.chapterId,
      heroCharacterId: input.heroCharacterId ?? null,
      secondaryHeroCharacterId: input.secondaryHeroCharacterId ?? null,
      focusCharacterIds: input.focusCharacterIds,
      characters: input.rawCharacters.map((c) => ({
        id: c.id,
        name: c.name,
        roleType: c.roleType ?? null,
      })),
      npcGroups: mergedNpcGroups,
    });
    assertValidChapterCastContract(castContract);
    console.info(formatCastContractLog(castContract));

    const enrichedNpcGroups = mergedNpcGroups;

    // P1.5 — Canon Resolver : résolution canonique des entités détectées.
    const canonResolverResult = runCanonResolverPass({
      discoveryContract: visualDiscoveryResult.contract,
      userCharacters: input.rawCharacters.map((c) => ({
        id: c.id,
        name: c.name,
        roleType: c.roleType,
        description: c.canonSignatureText,
      })),
      userLocations: resolvedLocations.map((loc) => v3PipelineLocationToResolverUserLocation(loc)),
      strictMode: input.premiumV3OnlyEnabled,
    });
    console.info(formatCanonResolverLog(canonResolverResult));

    // Enrichir les lieux avec ceux détectés automatiquement
    const enrichedLocations = [...resolvedLocations];
    for (const tempLoc of canonResolverResult.contract.temporaryLocations) {
      const exists = enrichedLocations.some(
        (l) => l.id === tempLoc.id || l.name?.toLowerCase() === tempLoc.label.toLowerCase(),
      );
      if (!exists) {
        enrichedLocations.push({
          id: tempLoc.id,
          name: tempLoc.label,
          visualDNA: { description: tempLoc.visualDescription },
        } as PremiumV3PipelineLocation);
      }
    }

    const storyContract: ChapterStoryContract = buildChapterStoryContract({
      chapterId: input.chapterId,
      chapterNumber: input.chapterNumber,
      chapterTitle: input.chapterTitle,
      chapterSummary: input.chapterSummary,
      chapterUserIntent: input.chapterUserIntent,
      heroCharacterId: castContract.heroCharacterId,
      characters: input.rawCharacters.map((c) => ({
        id: c.id,
        name: c.name,
        roleType: c.roleType ?? null,
      })),
      locations: enrichedLocations.map((loc) => ({
        id: loc.id,
        name: loc.name ?? loc.id,
        visualDescription:
          typeof loc.visualDNA?.description === "string" ? loc.visualDNA.description : "",
      })),
      npcGroups: enrichedNpcGroups,
      beatIds: resolvedBeatIds,
      tone: "neutral",
    });
    assertValidChapterStoryContract(storyContract);
    console.info(formatStoryContractLog(storyContract));

    // P6.17 — StoryContractCompletenessQA : vérifier la complétude du contrat.
    const storyContractQaResult = runStoryContractCompletenessQa({
      storyContract,
      castContract,
      beatIds: resolvedBeatIds,
      strictMode: input.premiumV3OnlyEnabled,
    });
    console.info(formatStoryContractCompletenessLog(storyContractQaResult));
    if (!storyContractQaResult.ok && input.premiumV3OnlyEnabled) {
      throw new Error(
        `story_contract_incomplete: ${storyContractQaResult.issues.map((i) => i.code).join(", ")}`,
      );
    }
    let storyArc: StoryArc | null = null;

    let storyboardPassResult: Awaited<ReturnType<typeof runStoryboardPass>>;

    let productionPlanForStoryboard: Record<string, unknown> | null = approvedPlanDriven
      ? ({ ...(input.productionPlan as Record<string, unknown>) } as Record<string, unknown>)
      : null;
    let panelBlueprintsForPremiumPath: PanelBlueprintPremium[] | null =
      Array.isArray(input.panelBlueprints) && input.panelBlueprints.length > 0
        ? input.panelBlueprints.map((b) => structuredClone(b))
        : null;

    let canonicalRuntimePlan: CanonicalChapterProductionPlan | null = null;
    if (resolvedProductionOutline) {
      try {
        canonicalRuntimePlan = ensureCanonicalProductionPlan({
          projectId: input.projectId,
          chapterId: input.chapterId,
          chapterNumber: input.chapterNumber,
          chapterTitle: input.chapterTitle ?? `Chapitre ${input.chapterNumber}`,
          format: projectFormat,
          rawOutline: resolvedProductionOutline,
          strictQa: input.premiumV3OnlyEnabled,
        });

        const richFromPlan =
          approvedPlanDriven
          && productionPlanForStoryboard
          && Array.isArray(productionPlanForStoryboard.panelBlueprints)
          && (productionPlanForStoryboard.panelBlueprints as unknown[]).length > 0
            ? (productionPlanForStoryboard.panelBlueprints as PanelBlueprintPremium[]).map((b) =>
                structuredClone(b)
              )
            : null;

        const richFromJob =
          !richFromPlan?.length && panelBlueprintsForPremiumPath?.length
            ? panelBlueprintsForPremiumPath.map((b) => structuredClone(b))
            : null;

        const richSource = richFromPlan ?? richFromJob;

        if (richSource?.length) {
          const mergedBlueprints = mergeRawBlueprintsWithCanonicalRhythm(
            richSource,
            canonicalRuntimePlan,
          );
          const characterRows = input.rawCharacters.map((c) => ({
            id: c.id,
            name: c.name,
            hairColor: c.hairColor ?? null,
            eyeColor: c.eyeColor ?? null,
            appearance: c.canonSignatureText?.trim() || null,
            outfitDefault: c.outfitSignature?.trim() || null,
            stableVisualDNA: c.stableVisualDNA ?? null,
            characterFingerprint: c.characterFingerprint,
            visualProfile: c.visualProfile,
            wardrobeProfile: c.wardrobeProfile,
            bodyState: c.bodyState,
            continuityProfile: c.continuityProfile,
            visualRefs: c.visualRefs,
            visualLocks: c.visualLocks,
            canonPack: c.canonPack,
            loraAttachments: c.loraAttachments,
          }));
          const dnaHydrated = hydrateBlueprintsWithCharacterDna({
            blueprints: mergedBlueprints,
            characters: characterRows,
            characterCanonsById: input.characterCanonsById ?? null,
            ...(input.secondaryHeroCharacterId
              ? { coProtagonistCharacterIds: [input.secondaryHeroCharacterId] as const }
              : {}),
          });
          const vwStrict = Boolean(input.premiumV3OnlyEnabled);
          const envHydrated =
            vw
              ? hydrateBlueprintsWithEnvironmentDna({
                  blueprints: dnaHydrated,
                  visualWorld: vw,
                  strict: vwStrict,
                })
              : dnaHydrated;
          const npcPropHydrated =
            vw
              ? hydrateBlueprintsWithNpcDna({
                  blueprints: hydrateBlueprintsWithPropDna({
                    blueprints: envHydrated,
                    visualWorld: vw,
                    strict: vwStrict,
                  }),
                  visualWorld: vw,
                  strict: vwStrict,
                })
              : envHydrated;
          panelBlueprintsForPremiumPath = npcPropHydrated;
          if (productionPlanForStoryboard) {
            productionPlanForStoryboard.panelBlueprints = npcPropHydrated;
          }
          console.info(
            `[pipeline:v3:canonical-runtime] panels=${npcPropHydrated.length} source=merged_rich_blueprints qa_valid=${canonicalRuntimePlan.qa.valid}`,
          );
        } else {
          if (input.premiumV3OnlyEnabled) {
            throw new Error(
              "E_PREMIUM_RICH_BLUEPRINTS_REQUIRED: en premium-only, les blueprints narratifs enrichis sont obligatoires. " +
                "Le plan canonique ne fournit que le rythme — il ne doit pas seul dériver le contenu des cases. " +
                "Publiez / persistez des panelBlueprints (plan approuvé ou job) fusionnables avec le canonique.",
            );
          }
          const derivedBlueprints = canonicalPlanToPanelBlueprints(canonicalRuntimePlan);
          panelBlueprintsForPremiumPath = derivedBlueprints;
          if (productionPlanForStoryboard) {
            productionPlanForStoryboard.panelBlueprints = derivedBlueprints;
          }
          console.info(
            `[pipeline:v3:canonical-runtime] panels=${derivedBlueprints.length} source=canonical_projection_only qa_valid=${canonicalRuntimePlan.qa.valid}`,
          );
        }
      } catch (err) {
        if (input.premiumV3OnlyEnabled) throw err;
        console.warn(
          `[pipeline:v3:canonical-runtime] fallback_persisted_blueprints reason=${(err as Error).message}`,
        );
      }
    } else {
      console.warn(
        `[pipeline:v3:canonical-runtime] no_production_outline — using job/snapshot panelBlueprints (bridge) chapterId=${input.chapterId}`,
      );
    }

    if (projectFormat === "manga") {
      const mangaRebalanceStart = Date.now();
      let workingBlueprints: PanelBlueprintPremium[] | null = null;
      if (approvedPlanDriven && productionPlanForStoryboard) {
        const raw = productionPlanForStoryboard.panelBlueprints;
        if (Array.isArray(raw) && raw.length > 0) {
          workingBlueprints = raw.map((b) => structuredClone(b)) as PanelBlueprintPremium[];
        }
      } else if (panelBlueprintsForPremiumPath?.length) {
        workingBlueprints = panelBlueprintsForPremiumPath.map((b) => structuredClone(b));
      }

      if (workingBlueprints && workingBlueprints.length > 0) {
        const total = workingBlueprints.length;
        const beforeCut = workingBlueprints.filter(isPremiumMangaCutawayBlueprint).length;
        const beforeRatio = total > 0 ? beforeCut / total : 0;
        const mangaMaxCutawayRatio = PRODUCTION_RULES.cutaway.maxRatio;
        const mangaMinActorDrivenRatio = PRODUCTION_RULES.actorDriven.minRatio;

        const visualEntities = buildVisualEntitiesFromPremiumV3Input({
          projectId: input.projectId,
          rawCharacters: input.rawCharacters,
          focusCharacterIds: castContract.activeCharacterIds,
          heroCharacterId: castContract.heroCharacterId,
          activeCreatureIds: input.activeCreatureIds,
        });

        const rebal = rebalancePremiumBlueprintsForManga({
          blueprints: workingBlueprints,
          visualEntities,
          projectFormat: "manga",
          maxCutawayRatio: mangaMaxCutawayRatio,
          minActorDrivenRatio: mangaMinActorDrivenRatio,
          fallbackHeroId: castContract.heroCharacterId,
          projectId: input.projectId,
        });

        const afterCut = rebal.blueprints.filter(isPremiumMangaCutawayBlueprint).length;
        const afterActor = rebal.afterActorDrivenCount;
        const afterRatio = total > 0 ? afterCut / total : 0;
        const actorRatio = total > 0 ? afterActor / total : 0;

        console.info(
          `[pipeline:v3:manga-rebalance] before cutaways=${beforeCut}/${total} ratio=${(beforeRatio * 100).toFixed(1)}%`,
        );
        console.info(
          `[pipeline:v3:manga-rebalance] converted=${rebal.convertedCount} keptHardCritical=${rebal.keptHardCriticalCount} keptSoftCritical=${rebal.keptSoftCriticalCount} structureIterations=${rebal.structureIterations}`,
        );
        if (rebal.autoCreatedOpponents > 0 || rebal.skippedSuspenseBeats.length > 0) {
          console.info(
            `[pipeline:v3:opponent-auto-canon] autoCreated=${rebal.autoCreatedOpponents} skippedSuspenseBeats=${rebal.skippedSuspenseBeats.length > 0 ? rebal.skippedSuspenseBeats.join(",") : "none"}`,
          );
        }
        console.info(
          `[pipeline:v3:manga-rebalance] after cutaways=${afterCut}/${total} ratio=${(afterRatio * 100).toFixed(1)}%`,
        );
        console.info(
          `[pipeline:v3:manga-rebalance] actorDriven=${afterActor}/${total} ratio=${(actorRatio * 100).toFixed(1)}%`,
        );

        const entityCov = computeEntityCoverageTelemetry(rebal.blueprints, visualEntities);
        console.info(
          `[pipeline:v3:entity-coverage] required=${entityCov.required} covered=${entityCov.covered} missing=${entityCov.missing.length} opponentPanels=${entityCov.opponentPanels} groupEntityPanels=${entityCov.groupEntityPanels} namedNpcPanels=${entityCov.namedNpcPanels} ambientEntityPanels=${entityCov.ambientEntityPanels}`,
        );
        const typesLine = formatEntityCoverageTypesLine(entityCov.byUserDefinedKind);
        if (typesLine.length > 0) {
          console.info(`[pipeline:v3:entity-coverage:types] ${typesLine}`);
        }

        const characterNameById = Object.fromEntries(
          input.rawCharacters.map((c) => [c.id, c.name] as const),
        );
        const sfxEnrichment = ensureDialogueAndSfxForPremiumBlueprints({
          blueprints: rebal.blueprints,
          chapterUserIntent: input.chapterUserIntent,
          productionOutline: resolvedProductionOutline ?? undefined,
          chapterSummary: input.chapterSummary,
          characterNameById,
          projectGenre: typeof input.project?.primaryGenre === "string" ? input.project.primaryGenre : null,
          projectTone: typeof input.project?.tone === "string" ? input.project.tone : null,
          contentRating: typeof input.project?.contentRating === "string" ? input.project.contentRating : null,
        });
        if (
          sfxEnrichment.combatSfxAdded > 0
          || sfxEnrichment.dialogueEnriched > 0
          || sfxEnrichment.narrativeContextAdded > 0
        ) {
          console.info(
            `[pipeline:v3:dialogue-sfx-enrichment] combatSfxAdded=${sfxEnrichment.combatSfxAdded} dialogueEnriched=${sfxEnrichment.dialogueEnriched} narrativeContextAdded=${sfxEnrichment.narrativeContextAdded}`,
          );
        }

        const narrativeVar = applyPanelNarrativeVariationToBlueprints(rebal.blueprints);
        if (narrativeVar.panelsAdjusted > 0) {
          console.info(`[pipeline:v3:narrative-variation] panelsAdjusted=${narrativeVar.panelsAdjusted}`);
        }

        // P2.11 — Le dialoguiste IA s'active automatiquement en mode premium,
        // ou explicitement via input.sceneDialogueEnrich.
        const enableDialoguist = input.sceneDialogueEnrich === true || input.premiumV3OnlyEnabled;
        const npcGroupsForDialogue = (effectiveVisualWorld?.npcGroups ?? []).map((g) => ({
          id: g.id,
          label: g.label,
        }));
        const sceneDialogue = await enrichPremiumBlueprintsSceneDialogue({
          blueprints: rebal.blueprints,
          productionOutline: resolvedProductionOutline ?? null,
          chapterSummary: input.chapterSummary,
          chapterUserIntent: input.chapterUserIntent,
          characterNameById,
          projectGenre: typeof input.project?.primaryGenre === "string" ? input.project.primaryGenre : null,
          projectTone: typeof input.project?.tone === "string" ? input.project.tone : null,
          contentRating: typeof input.project?.contentRating === "string" ? input.project.contentRating : null,
          avoidDialogueSnippets: input.priorChapterDialogueSnippets ?? undefined,
          forceSceneDialogueEnrich: enableDialoguist,
          rejectUnresolvedSpeakers: input.premiumV3OnlyEnabled && enableDialoguist,
          requiredDialogueActBeatIds: input.requiredDialogueActBeatIds ?? [],
          heroCharacterId: castContract.heroCharacterId ?? input.heroCharacterId ?? null,
          secondaryHeroCharacterId: input.secondaryHeroCharacterId ?? null,
          npcGroups: npcGroupsForDialogue,
        });
        if (sceneDialogue.linesWritten > 0 || sceneDialogue.warnings.length > 0) {
          console.info(
            `[pipeline:v3:scene-dialogue] beatsTouched=${sceneDialogue.beatsTouched} linesWritten=${sceneDialogue.linesWritten} warnings=${sceneDialogue.warnings.join(";") || "none"}`,
          );
        }
        if (input.premiumV3OnlyEnabled && enableDialoguist && sceneDialogue.blockingErrors.length > 0) {
          throw new Error(`premium_scene_dialogue_speaker_blocked:${sceneDialogue.blockingErrors.join("|")}`);
        }
        for (const w of sceneDialogue.warnings) {
          if (typeof w === "string" && w.trim().length > 0) {
            pipelineUserWarnings.push(`Dialogue de scène — ${w.trim()}`);
          }
        }

        if (input.premiumV3OnlyEnabled && enableDialoguist) {
          const dialogueSkipWarnings = sceneDialogue.warnings.filter(
            (w) => w.includes("scene_dialogue_skipped_no_openai") || w.includes("scene_dialogue_skipped_not_enabled")
          );
          if (dialogueSkipWarnings.length > 0) {
            throw new Error(`premium_dialogue_required_but_skipped:${dialogueSkipWarnings.join(",")}`);
          }
        }

        ensureDialogueBeatsHaveAnchors({
          blueprints: rebal.blueprints,
          visualEntities,
          fallbackHeroId: castContract.heroCharacterId,
        });
        const dialogueQa = runDialogueQaOnBlueprints(rebal.blueprints);
        console.info(
          `[pipeline:v3:dialogue-qa] ok=${dialogueQa.ok} dialogueBeats=${dialogueQa.dialogueBeats} speakerPanels=${dialogueQa.speakerPanels} reactionPanels=${dialogueQa.reactionPanels} anchored=${dialogueQa.anchored} floating=${dialogueQa.floating}`,
        );

        timings.manga_rebalance_ms = Date.now() - mangaRebalanceStart;

        if (approvedPlanDriven && productionPlanForStoryboard) {
          productionPlanForStoryboard.panelBlueprints = rebal.blueprints;
        }
        if (panelBlueprintsForPremiumPath?.length) {
          panelBlueprintsForPremiumPath = rebal.blueprints;
        }

        const mangaQa = runMangaStructureQaOnBlueprints({
          blueprints: rebal.blueprints,
          maxCutawayRatio: mangaMaxCutawayRatio,
          minActorDrivenRatio: mangaMinActorDrivenRatio,
          visualEntities,
        });
        console.info(
          `[pipeline:v3:rhythm] maxConsecutiveCutaways=${mangaQa.maxConsecutiveCutaways}`,
        );
        console.info(
          `[pipeline:v3:manga-structure-qa] ok=${mangaQa.ok} cutawayRatio=${(mangaQa.cutawayRatio * 100).toFixed(1)}% ` +
            `actorDrivenRatio=${(mangaQa.actorDrivenRatio * 100).toFixed(1)}% maxConsecutiveCutaways=${mangaQa.maxConsecutiveCutaways}`,
        );
        if (!mangaQa.ok) {
          console.error(`[pipeline:v3:manga-structure-qa] failed reason=${mangaQa.summary}`);
          if (input.premiumV3OnlyEnabled) {
            throw new Error(`premium_v3_only_manga_structure_failed: ${mangaQa.summary}`);
          }
        }

        if (resolvedProductionOutline) {
          const narrativeQa = runNarrativeContractQa({
            blueprints: rebal.blueprints,
            outline: resolvedProductionOutline,
            chapterUserIntent: input.chapterUserIntent,
            chapterSummary: input.chapterSummary,
            chapterLocationName: input.chapterLocationName,
          });

          const requiredChars = narrativeQa.contracts.flatMap((c) => c.requiredCharacters);
          const requiredEntities = narrativeQa.contracts.flatMap((c) => c.requiredEntities);
          const locations = narrativeQa.contracts.map((c) => c.location).filter(Boolean);

          console.info(
            `[pipeline:v3:narrative-contract] beats=${narrativeQa.contracts.length} ` +
              `requiredCharacters=${[...new Set(requiredChars)].join(",")} ` +
              `requiredEntities=${[...new Set(requiredEntities)].join(",")} ` +
              `locations=${[...new Set(locations)].join(",")}`,
          );

          if (!narrativeQa.ok) {
            const first = narrativeQa.violations[0];
            const detail =
              first != null ? `${first.type}:${String(first.expected ?? "")}` : "unknown";
            if (input.premiumV3OnlyEnabled) {
              throw new Error(
                `premium_narrative_contract_qa_failed: violations=${narrativeQa.violations.length} first=${detail}`,
              );
            }
            console.warn(
              `[pipeline:v3:narrative-contract] violations=${narrativeQa.violations.length} first=${detail}`,
            );
          }
        }
      }
    }

    if (approvedPlanDriven) {
      const storyboardBuildStart = Date.now();

      const productionPlanForArc = productionPlanForStoryboard ?? input.productionPlan;
      const storyArcFromPlan = buildStoryArcFromProductionPlan({
        productionPlan: productionPlanForArc as { panelBlueprints?: PanelBlueprintPremium[]; [key: string]: unknown },
        approvedOutline: resolvedProductionOutline,
        chapterId: input.chapterId,
        chapterNumber: input.chapterNumber,
        chapterTitle: input.chapterTitle,
        chapterSummary: input.chapterSummary,
        chapterUserIntent: input.chapterUserIntent,
        chapterGoal: resolvedProductionOutline?.chapterGoal,
        cliffhanger: resolvedProductionOutline?.cliffhanger,
      });

      console.info(
        `[pipeline:v3:story-arc-from-plan] beats=${storyArcFromPlan.beats.length} chapterGoal=${storyArcFromPlan.chapterGoal?.slice(0, 50)}...`,
      );

      // Premium-only : le storyboard déterministe vient du plan approuvé enrichi (blueprints),
      // jamais de la projection canonique seule — le canon sert au merge rythme, pas au texte final des cases.
      const deterministicPlan = input.premiumV3OnlyEnabled
        ? buildStoryboardPlanFromApprovedProductionPlan({
            chapterId: input.chapterId,
            projectId: input.projectId,
            chapterNumber: input.chapterNumber,
            productionPlan: (productionPlanForStoryboard ?? input.productionPlan) as Record<string, unknown>,
            projectFormat,
            chapterLocationName: input.chapterLocationName,
            productionPlanPages: input.productionPlanPages,
          })
        : canonicalRuntimePlan
          ? buildStoryboardPlanFromCanonicalPlan({
              chapterId: input.chapterId,
              projectId: input.projectId,
              chapterNumber: input.chapterNumber,
              projectFormat,
              canonicalPlan: canonicalRuntimePlan,
              productionPlanShell: (productionPlanForStoryboard ?? input.productionPlan) as Record<
                string,
                unknown
              >,
              chapterLocationName: input.chapterLocationName,
              productionPlanPages: input.productionPlanPages,
            })
          : buildStoryboardPlanFromApprovedProductionPlan({
              chapterId: input.chapterId,
              projectId: input.projectId,
              chapterNumber: input.chapterNumber,
              productionPlan: (productionPlanForStoryboard ?? input.productionPlan) as Record<string, unknown>,
              projectFormat,
              chapterLocationName: input.chapterLocationName,
              productionPlanPages: input.productionPlanPages,
            });
      storyboardPassResult = {
        storyboardPlan: deterministicPlan,
        warnings: ["storyboard_plan.source=approved_production_plan_deterministic"],
        blockers: [],
      };
      console.info(
        `[pipeline:v3:storyboard] source=deterministic_approved_plan panels=${deterministicPlan.pages.flatMap((p) => p.panels).length}`,
      );

      timings.storyboard_build_ms = Date.now() - storyboardBuildStart;
    } else {
      const storyStart = Date.now();
      const locationsForStory = await resolveLocationsForStoryPass(input);
      const storyPassResult = await runStoryPass({
        chapterId: input.chapterId,
        chapterNumber: input.chapterNumber,
        title: input.chapterTitle,
        userIntent: input.chapterUserIntent,
        summary: input.chapterSummary,
        mainCharacters: input.rawCharacters.map((c) => ({
          id: c.id,
          name: c.name,
          roleType: c.roleType ?? null,
        })),
        locations: premiumV3PipelineLocationsToStoryArchitectLocations(locationsForStory),
        ...(input.premiumV3OnlyEnabled ? { premiumOnlyOverride: true as const } : {}),
      });
      timings.story_pass_ms = Date.now() - storyStart;
      storyArc = storyPassResult.storyArc;
      if (storyPassResult.warnings.length > 0) {
        console.warn(
          `[pipeline:v3:story] warnings=${storyPassResult.warnings.join(" | ")}`,
        );
        if (input.premiumV3OnlyEnabled) {
          assertStoryArchitectResultNotFallback(storyPassResult.warnings);
        }
      }

      const storyboardStart = Date.now();
      storyboardPassResult =
        panelBlueprintsForPremiumPath && panelBlueprintsForPremiumPath.length > 0
          ? {
              storyboardPlan: buildStoryboardPlanFromPremiumBlueprints({
                chapterId: input.chapterId,
                projectFormat,
                panelBlueprints: panelBlueprintsForPremiumPath,
                pages: input.productionPlanPages,
                chapterLocationName: input.chapterLocationName ?? null,
                locations: locationsForStory.map((l) => ({
                  id: l.id,
                  name: l.name,
                  visualDNA: l.visualDNA,
                })),
              }),
              warnings: ["storyboard_plan.source=premium_production_plan"],
              blockers: [],
            }
          : await runStoryboardPass({
              storyArc: storyPassResult.storyArc,
              heroCharacterIds: orderedEditorHeroCharacterIds(castContract),
              projectFormat,
              targetPanelCount: PREMIUM_PANEL_RANGE.target,
            });
      timings.storyboard_pass_ms = Date.now() - storyboardStart;
    }
    await saveStoryboardPlan(input.chapterId, storyboardPassResult.storyboardPlan);
    console.info(
      `[pipeline:v3:storyboard] persisted storyboardPlanV2 chapterId=${input.chapterId} pages=${storyboardPassResult.storyboardPlan.pages.length} panels=${storyboardPassResult.storyboardPlan.pages.reduce((sum, p) => sum + p.panels.length, 0)}`,
    );

    if (storyboardPassResult.blockers.length > 0) {
      console.error(
        `[pipeline:v3:storyboard] blockers=${storyboardPassResult.blockers.join(" | ")}`,
      );
      if (input.premiumV3OnlyEnabled) {
        throw new Error(
          `premium_v3_only_storyboard_blockers: ${storyboardPassResult.blockers.join(" | ")}`,
        );
      }
    }
    if (storyboardPassResult.warnings.length > 0) {
      console.warn(
        `[pipeline:v3:storyboard] warnings=${storyboardPassResult.warnings.join(" | ")}`,
      );
      if (input.premiumV3OnlyEnabled) {
        const realWarnings = storyboardPassResult.warnings.filter(
          (w) => !w.includes("storyboard_plan.source=premium_production_plan")
        );
        if (realWarnings.length > 0) {
          assertMangaEditorResultNotFallback(realWarnings);
        }
      }
    }

    const pageQa = await runPageQaPass(storyboardPassResult.storyboardPlan);
    timings.page_qa_ms = Date.now() - pipelineStartMs;
    console.log(
      `[pipeline:v3:page-qa] ok=${pageQa.okCount} fail=${pageQa.failCount}`,
    );

    // P0.4 — Fail hard si des pages échouent au QA
    if (pageQa.failCount > 0) {
      const issues = pageQa.results
        .filter((r) => !r.ok)
        .slice(0, 5)
        .map((r) => `page=${r.pageNumber}:${r.issues.join(",")}`)
        .join(" | ");

      console.error(
        `[pipeline:v3:page-qa] page_qa_failed chapterId=${input.chapterId} failCount=${pageQa.failCount} issues=${issues}`,
      );

      if (input.premiumV3OnlyEnabled) {
        throw new Error(`premium_v3_only_page_qa_failed: ${pageQa.failCount} pages failed [${issues}]`);
      }
    }

    // ─── QA passes additionnelles (P3.14, P3.15, P3.16) ────────────────────────
    const storyboardPanels = storyboardPassResult.storyboardPlan.pages.flatMap((p) => p.panels) ?? [];
    const beatIdsFromPlan = resolvedProductionOutline?.beats?.map((b: { beatId?: string }) => b.beatId).filter(Boolean) as string[] ?? [];

    // P3.14 — Beat Coverage QA
    const beatCoverageQa = runBeatCoverageQaPass({
      expectedBeatIds: beatIdsFromPlan,
      panels: storyboardPanels.map((p: { panelId: string; sourceBeatId?: string; beatId?: string }) => ({
        panelId: p.panelId,
        sourceBeatId: p.sourceBeatId,
        beatId: p.beatId,
      })),
      strictMode: input.premiumV3OnlyEnabled ?? false,
    });
    console.log(`[pipeline:v3:beat-coverage-qa] ${formatBeatCoverageQaLog(beatCoverageQa)}`);
    if (!beatCoverageQa.ok && input.premiumV3OnlyEnabled) {
      console.error(`[pipeline:v3:beat-coverage-qa] BLOCKED — uncovered beats detected`);
      throw new Error(
        `premium_beat_coverage_qa_failed: uncovered=${beatCoverageQa.stats.uncoveredBeats} expected=${beatCoverageQa.stats.expectedBeats}`,
      );
    }

    // P3.15 — Emotional Arc QA (si arc émotionnel disponible)
    const emotionalArcSteps = storyArc?.beats?.map((b, idx: number) => ({
      stepId: b.beatId,
      label: b.emotionalTurn ?? `Step ${idx + 1}`,
      intensity: 50 + (b.dangerLevel === "critical" ? 30 : b.dangerLevel === "high" ? 20 : b.dangerLevel === "medium" ? 10 : 0),
      beatIds: [b.beatId],
    })) ?? [];

    if (emotionalArcSteps.length > 0) {
      const emotionalArcQa = runEmotionalArcQaPass({
        expectedArc: emotionalArcSteps,
        panels: storyboardPanels.map((p: { panelId: string; beatId?: string; emotionLine?: string; emotionalTone?: string }) => ({
          panelId: p.panelId,
          beatId: p.beatId,
          emotionLine: p.emotionLine,
          emotionalTone: p.emotionalTone,
        })),
        strictMode: Boolean(input.premiumV3OnlyEnabled),
      });
      console.log(`[pipeline:v3:emotional-arc-qa] ${formatEmotionalArcQaLog(emotionalArcQa)}`);
      if (!emotionalArcQa.ok && input.premiumV3OnlyEnabled) {
        throw new Error(
          `premium_emotional_arc_qa_failed: errors=${emotionalArcQa.errorCount} warnings=${emotionalArcQa.warningCount}`,
        );
      }
    }

    // P3.16 — Interaction QA
    const interactionQa = runInteractionQaPass({
      panels: storyboardPanels.map((raw) => {
        const pText = raw as unknown as StoryboardPanelLikeForTextContract;
        const dialogueLines = legacyDialogueLinesFromStoryboardPanelLike({
          panelId: pText.panelId,
          textContract: pText.textContract,
          dialogue: Array.isArray(pText.dialogue) && pText.dialogue.length > 0 ? pText.dialogue : null,
          dialogues: null,
          narration: pText.narration ?? null,
          sfx: pText.sfx ?? null,
          panelTextBundle: pText.panelTextBundle as never ?? null,
        });
        const p = raw as unknown as Record<string, unknown>;
        const renderMode = typeof p.renderMode === "string" ? p.renderMode : null;
        const actionLine = typeof p.actionLine === "string" ? p.actionLine : null;
        const shotType = typeof p.shotType === "string" ? p.shotType : null;
        const vis =
          Array.isArray(p.visibleCharacterIds)
            ? (p.visibleCharacterIds as string[])
            : Array.isArray(p.characters)
              ? (p.characters as string[])
              : undefined;
        return {
          panelId: pText.panelId,
          renderMode,
          visibleCharacterIds: vis,
          dialogueLines,
          actionLine,
          shotType,
        };
      }),
      strictMode: Boolean(input.premiumV3OnlyEnabled),
    });
    console.log(`[pipeline:v3:interaction-qa] ${formatInteractionQaLog(interactionQa)}`);
    if (!interactionQa.ok && input.premiumV3OnlyEnabled) {
      throw new Error(
        `premium_interaction_qa_failed: errors=${interactionQa.errorCount} warnings=${interactionQa.warningCount}`,
      );
    }

    // P1.9 — Coverage brut puis contrat visuel nettoyé (outline + canon, pas de pollution seule)
    const rawCoverage = storyArc
      ? extractRequiredVisualCoverage(storyArc)
      : approvedPlanDriven && input.productionPlan?.panelBlueprints
        ? extractRequiredVisualCoverageFromProductionPlan(
            input.productionPlan.panelBlueprints as Array<{
              panelId: string;
              beatId: string;
              requiredCharacterIds?: string[];
              mustShowCharacterIds?: string[];
              requiredProps?: Array<{ canonicalName: string }>;
              mustShowEnemy?: boolean;
              requiredEnemyIds?: string[];
              requiredLocationSignals?: string[];
              subjectFocus?: string;
              cutawayType?: string;
              purpose?: string;
            }>,
          )
        : [];

    const knownLocsForSanitize =
      Array.isArray(input.locations) && input.locations.length > 0
        ? input.locations
        : await resolveLocationsForStoryPass(input);

    const outlineText = buildOutlineTextForSanitizer({
      approvedOutline: input.approvedOutline ?? undefined,
      productionOutline: resolvedProductionOutline ?? undefined,
      chapterSummary: input.chapterSummary,
      chapterUserIntent: input.chapterUserIntent,
    });

    const storyBibleSummary =
      input.project?.storyBible && typeof input.project.storyBible === "object"
        ? (() => {
            const s = (input.project.storyBible as Record<string, unknown>).summary;
            return typeof s === "string" ? s.slice(0, 4000) : null;
          })()
        : null;

    const chapterVisualContractResult = await extractChapterVisualContract({
      chapterId: input.chapterId,
      chapterTitle: input.chapterTitle,
      chapterSummary: input.chapterSummary,
      chapterUserIntent: input.chapterUserIntent,
      productionOutline: resolvedProductionOutline,
      knownCharacters: input.rawCharacters,
      knownLocations: knownLocsForSanitize,
      projectGenre: typeof input.project?.primaryGenre === "string" ? input.project.primaryGenre : null,
      projectTone: typeof input.project?.tone === "string" ? input.project.tone : null,
      storyBibleSummary,
    });
    if (chapterVisualContractResult.warnings.length > 0) {
      console.warn(
        `[pipeline:v3:chapter-visual-contract] ${chapterVisualContractResult.warnings.join(" | ")}`,
      );
    }
    console.log(
      `[pipeline:v3:chapter-visual-contract] openai=${chapterVisualContractResult.usedOpenAI} ` +
        `requiredSlices=${chapterVisualContractResult.requiredFromContract.length} ` +
        `props=${chapterVisualContractResult.contract.props.length} ` +
        `species=${chapterVisualContractResult.contract.species.length} ` +
        `robots=${chapterVisualContractResult.contract.robots.length} ` +
        `hybrids=${chapterVisualContractResult.contract.hybrids.length} ` +
        `creatures=${chapterVisualContractResult.contract.creatures.length} ` +
        `needsClarification=${Boolean(chapterVisualContractResult.contract.needsClarification)}`,
    );

    try {
      await saveChapterVisualContractSnapshot(input.chapterId, {
        usedOpenAI: chapterVisualContractResult.usedOpenAI,
        warnings: chapterVisualContractResult.warnings,
        contract: chapterVisualContractResult.contract,
        requiredFromContractCount: chapterVisualContractResult.requiredFromContract.length,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[pipeline:v3:chapter-visual-contract] persist_failed chapterId=${input.chapterId} ${msg}`);
    }

    const visualContractUi = await loadChapterVisualContractUi(input.chapterId);
    const parasitePolicyUi = visualContractUi.parasitePolicy ?? "auto_strip";
    if (input.premiumV3OnlyEnabled && parasitePolicyUi === "keep_all") {
      throw new Error(
        "premium_visual_contract_keep_all_forbidden: en PIPELINE_V3_PREMIUM_ONLY, parasitePolicy=keep_all est interdit (auto_strip obligatoire).",
      );
    }
    const parasitePolicy = input.premiumV3OnlyEnabled ? "auto_strip" : parasitePolicyUi;
    const contractHasRequiredSlices = chapterVisualContractResult.requiredFromContract.length > 0;

    const contractSanitized = contractHasRequiredSlices
      ? sanitizeVisualContractBeforeCoverage({
          requiredCoverage: chapterVisualContractResult.requiredFromContract,
          outlineText,
          canonicalPlan: canonicalRuntimePlan,
          knownCharacters: input.rawCharacters,
          knownLocations: knownLocsForSanitize,
          projectGenre: typeof input.project?.primaryGenre === "string" ? input.project.primaryGenre : null,
          projectTone: typeof input.project?.tone === "string" ? input.project.tone : null,
          parasitePolicy,
        })
      : { requiredConfirmed: [], optional: [], suspicious: [], rejected: [] };

    const blueprintSanitized = sanitizeVisualContractBeforeCoverage({
      requiredCoverage: rawCoverage,
      outlineText,
      canonicalPlan: canonicalRuntimePlan,
      knownCharacters: input.rawCharacters,
      knownLocations: knownLocsForSanitize,
      projectGenre: typeof input.project?.primaryGenre === "string" ? input.project.primaryGenre : null,
      projectTone: typeof input.project?.tone === "string" ? input.project.tone : null,
      parasitePolicy,
    });

    let requiredCoverage;
    if (contractHasRequiredSlices) {
      if (parasitePolicy === "keep_all" && !input.premiumV3OnlyEnabled) {
        const blueprintMerged = [
          ...blueprintSanitized.requiredConfirmed,
          ...blueprintSanitized.suspicious,
        ];
        requiredCoverage = mergeRequiredVisualCoverageWithContract(
          contractSanitized.requiredConfirmed,
          blueprintMerged,
        );
      } else {
        requiredCoverage = contractSanitized.requiredConfirmed;
      }
    } else {
      requiredCoverage = blueprintSanitized.requiredConfirmed;
    }

    console.log(
      "[pipeline:v3:visual-contract] contract_confirmed=%d blueprint_confirmed=%d optional=%d suspicious=%d rejected=%d parasitePolicy=%s contract_only=%s",
      contractSanitized.requiredConfirmed.length,
      blueprintSanitized.requiredConfirmed.length,
      blueprintSanitized.optional.length,
      blueprintSanitized.suspicious.length,
      blueprintSanitized.rejected.length,
      parasitePolicy,
      String(contractHasRequiredSlices && parasitePolicy !== "keep_all"),
    );

    let coverageReport = validateVisualCoverage(
      requiredCoverage,
      storyboardPassResult.storyboardPlan,
    );
    let visualCoverageStatus: "ok" | "soft_gaps" = "ok";

    const coverageSource = contractHasRequiredSlices
      ? parasitePolicy === "keep_all"
        ? "chapter_visual_contract+blueprint_merged"
        : "chapter_visual_contract_only"
      : storyArc
        ? "storyArc"
        : approvedPlanDriven
          ? "productionPlan"
          : "none";
    console.log(
      `[pipeline:v3:visual-coverage] required=${requiredCoverage.length} fulfilled=${coverageReport.fulfilled.length} gaps=${coverageReport.gaps.length} source=${coverageSource} (raw_blueprint_slices=${rawCoverage.length})`,
    );

    const gapClassificationContext = buildVisualCoverageGapClassificationContext({
      outlineText,
      canonicalPlan: canonicalRuntimePlan,
      rawCharacters: input.rawCharacters,
      focusCharacterIds: castContract.activeCharacterIds,
      heroCharacterId: castContract.heroCharacterId,
      contractMainLocationName: chapterVisualContractResult.contract.mainLocation?.name ?? null,
    });
    const firstClass = classifyVisualCoverageGaps(coverageReport.gaps, gapClassificationContext);

    if (firstClass.repairableGaps.length > 0) {
      storyboardPassResult = {
        ...storyboardPassResult,
        storyboardPlan: repairStoryboardVisualCoverage({
          storyboardPlan: storyboardPassResult.storyboardPlan,
          gaps: firstClass.repairableGaps,
          productionPlan: input.productionPlan,
          canonicalPlan: canonicalRuntimePlan,
        }),
      };
      await saveStoryboardPlan(input.chapterId, storyboardPassResult.storyboardPlan);
      coverageReport = validateVisualCoverage(
        requiredCoverage,
        storyboardPassResult.storyboardPlan,
      );
      console.log(
        `[pipeline:v3:visual-coverage] after_repair gaps=${coverageReport.gaps.length} repairable_applied=${firstClass.repairableGaps.length}`,
      );
    }

    const remaining = classifyVisualCoverageGaps(coverageReport.gaps, gapClassificationContext);

    if (remaining.rejectedGaps.length > 0) {
      console.warn("[pipeline:v3:visual-coverage] rejected gaps (ignored)", {
        gaps: remaining.rejectedGaps.map(
          (g) => `${g.coverage.entityType}:${g.coverage.entity}@${g.coverage.sourceBeatId}`,
        ),
      });
    }

    if (remaining.fatalGaps.length > 0) {
      const gapSummary = remaining.fatalGaps
        .slice(0, 8)
        .map((g) => `${g.coverage.entityType}:${g.coverage.entity}@${g.coverage.sourceBeatId}`)
        .join(" | ");
      console.error(
        `[pipeline:v3:visual-coverage] fatal_gaps=${remaining.fatalGaps.length} ${gapSummary}`,
      );
      if (input.premiumV3OnlyEnabled) {
        throw new Error(
          `premium_v3_only_visual_coverage_fatal_gaps: ${remaining.fatalGaps.length} critical entities uncovered [${gapSummary}]`,
        );
      }
    }

    if (remaining.repairableGaps.length > 0 || remaining.softGaps.length > 0) {
      console.warn("[pipeline:v3:visual-coverage] soft gaps after repair", {
        gaps: [...remaining.repairableGaps, ...remaining.softGaps].map(
          (g) => `${g.coverage.entityType}:${g.coverage.entity}@${g.coverage.sourceBeatId}`,
        ),
      });
      visualCoverageStatus = "soft_gaps";
    }

    if (visualCoverageStatus !== "ok") {
      console.info(`[pipeline:v3:visual-coverage] status=${visualCoverageStatus}`);
    }
    // P1.10 — Valider le cutaway ratio (max 35% sauf chapitre expérimental)
    const allPanels = storyboardPassResult.storyboardPlan.pages.flatMap((p) => p.panels);
    const cutawayPanels = allPanels.filter(
      (panel) =>
        panel.cutawayType !== "none" ||
        panel.subjectFocus === "environment" ||
        panel.subjectFocus === "prop" ||
        panel.renderMode === "establishing_environment" ||
        panel.renderMode === "insert_object" ||
        panel.renderMode === "surveillance_reveal",
    );
    const cutawayRatio = allPanels.length > 0 ? cutawayPanels.length / allPanels.length : 0;
    const maxCutawayRatio = PRODUCTION_RULES.cutaway.maxRatio;

    console.log(
      `[pipeline:v3:cutaway-ratio] count=${cutawayPanels.length}/${allPanels.length} ratio=${(cutawayRatio * 100).toFixed(1)}% max=${(maxCutawayRatio * 100).toFixed(0)}%`,
    );

    if (cutawayRatio > maxCutawayRatio && input.premiumV3OnlyEnabled) {
      console.error(
        `[pipeline:v3:cutaway-ratio] exceeded chapterId=${input.chapterId} ratio=${(cutawayRatio * 100).toFixed(1)}%`,
      );
      throw new Error(
        `premium_v3_only_cutaway_ratio_exceeded: ${(cutawayRatio * 100).toFixed(1)}% > ${(maxCutawayRatio * 100).toFixed(0)}% — trop de cutaways, pas assez de personnages/action`,
      );
    }

    try {
      const memoryStart = Date.now();
      // P0.2 + P0.6 — Passer heroCharacterId et temporaryLocations à la visual memory
      const visualMemoryResult = await loadChapterVisualMemory({
        chapterId: input.chapterId,
        projectId: input.projectId,
        heroCharacterId: castContract.heroCharacterId,
        mainCharacterIds: castContract.activeCharacterIds,
        temporaryLocations: canonResolverResult.contract.temporaryLocations.map((loc) => ({
          id: loc.id,
          label: loc.label,
          visualDescription: loc.visualDescription,
          confidence: loc.matchConfidence,
          source: "canon_resolver",
        })),
      });
      timings.visual_memory_ms = Date.now() - memoryStart;
      if (visualMemoryResult.warnings.length > 0) {
        console.warn(
          `[pipeline:v3:visual-memory] warnings=${visualMemoryResult.warnings.slice(0, 5).join(" | ")}`,
        );
      }
      console.log(
        `[pipeline:v3:visual-memory] chars=${visualMemoryResult.stats.charactersLoaded} missing_face=${visualMemoryResult.stats.charactersMissingFaceRef} env=${visualMemoryResult.stats.environmentsLoaded} style=${visualMemoryResult.stats.styleRefsLoaded}`,
      );

      // P0.5 — Appliquer les fallbacks pour les identités personnages manquantes
      // Downgrade les closeups si pas de face ref (plutôt que bloquer)
      const allPanelsBeforeFallback = storyboardPassResult.storyboardPlan.pages.flatMap((p) => p.panels);
      const identityFallbackResult = runCharacterIdentityFallback({
        memory: visualMemoryResult.memory,
        panels: allPanelsBeforeFallback,
        generateIdentitySeeds: false, // Pour l'instant, on downgrade plutôt que générer
      });
      if (identityFallbackResult.warnings.length > 0) {
        console.warn(
          `[pipeline:v3:identity-fallback] warnings=${identityFallbackResult.warnings.slice(0, 3).join(" | ")}`,
        );
      }

      // P0.1 — Vérifier que la visual memory contient au moins un environnement
      // En mode premium, c'est BLOQUANT - on refuse de continuer vers le render
      if (visualMemoryResult.stats.environmentsLoaded === 0) {
        console.warn(
          `[pipeline:v3:visual-memory] env_missing — aucun environnement chargé, le render risque d'être générique`,
        );
        if (input.premiumV3OnlyEnabled) {
          throw new Error(
            "E_VISUAL_MEMORY_ENV_REQUIRED: env>=1 required in premium mode. " +
              "Assurez-vous qu'au moins un lieu est défini dans le projet ou détecté automatiquement.",
          );
        }
      }

      const mainCharacterNames = input.rawCharacters
        .filter((c) => castContract.activeCharacterIds.includes(c.id))
        .map((c) => c.name);

      // P0.3 — Injecter environmentAnchorId dans tous les panels
      const primaryEnvAnchorId = extractPrimaryEnvironmentAnchorId(
        enrichedLocations,
        canonResolverResult.contract.temporaryLocations,
      );
      const allStoryboardPanels = storyboardPassResult.storyboardPlan.pages.flatMap((p) => p.panels);
      const envAnchorResult = runEnvironmentAnchorPass({
        panels: allStoryboardPanels,
        primaryEnvironmentAnchorId: primaryEnvAnchorId,
      });
      if (envAnchorResult.missing > 0 && input.premiumV3OnlyEnabled) {
        throw new Error(
          `E_ENVIRONMENT_ANCHOR_MISSING: ${envAnchorResult.missing} panels without environment anchor`,
        );
      }

      // P0.4 — Corriger les contradictions renderMode (character_focus + wide establishing)
      runRenderModeNormalizer({
        panels: allStoryboardPanels,
      });

      if (panelBlueprintsForPremiumPath?.length) {
        const outlineBeatsForContract = (() => {
          const beats = resolvedProductionOutline?.beats;
          if (Array.isArray(beats) && beats.length > 0) {
            return beats
              .map(
                (b: {
                  beatId?: string;
                  summary?: string;
                  characters?: string[];
                  emotionalDelta?: number;
                }) => ({
                  id: typeof b.beatId === "string" ? b.beatId : "",
                  summary: typeof b.summary === "string" ? b.summary : "",
                  characters: Array.isArray(b.characters) ? b.characters : undefined,
                  emotionalDelta: typeof b.emotionalDelta === "number" ? b.emotionalDelta : undefined,
                }),
              )
              .filter((b) => b.id.length > 0);
          }
          const byId = new Map<string, { id: string; summary: string }>();
          for (const bp of panelBlueprintsForPremiumPath) {
            const bid = typeof bp.beatId === "string" ? bp.beatId : "";
            if (!bid || byId.has(bid)) continue;
            byId.set(bid, { id: bid, summary: `Beat ${bid}` });
          }
          return [...byId.values()];
        })();

        const chapterGenerationContract = buildChapterGenerationContractFromPremiumPlan({
          projectId: input.projectId,
          chapterId: input.chapterId,
          chapterNumber: input.chapterNumber,
          outlineBeats: outlineBeatsForContract,
          panelBlueprints: panelBlueprintsForPremiumPath,
          visualWorld: vw,
          heroCharacterId: castContract.heroCharacterId,
          focusCharacterIds: castContract.activeCharacterIds.filter(Boolean),
          characters: input.rawCharacters.map((c) => ({
            id: c.id,
            name: c.name,
            roleType: c.roleType ?? null,
            hairColor: c.hairColor ?? null,
            eyeColor: c.eyeColor ?? null,
            hairStyle: c.hairStyle ?? null,
            skinTone: c.skinTone ?? null,
            outfitSignature: c.outfitSignature ?? null,
            accessories: c.accessories ?? null,
            bodyType: c.bodyType ?? null,
            ageApparent: c.ageApparent ?? null,
            distinctiveMarks: c.distinctiveMarks ?? null,
            canonSignatureText: c.canonSignatureText ?? null,
            forbiddenVisualDrift: c.forbiddenVisualDrift ?? null,
            canonLocked: c.canonLocked ?? undefined,
            faceRefUrl: c.faceRefUrl ?? null,
            silhouetteRefUrl: c.silhouetteRefUrl ?? null,
            loraUrl: c.loraUrl ?? null,
            loraTriggerWord: c.loraTriggerWord ?? null,
            loraScale: c.loraScale ?? null,
          })),
          locations: enrichedLocations.map((loc) => ({
            id: loc.id,
            name: loc.name ?? loc.id,
            visualDescription:
              typeof loc.visualDNA?.description === "string" ? loc.visualDNA.description : null,
          })),
          sourceHashMaterial: {
            chapterUserIntent: input.chapterUserIntent ?? null,
            chapterIntentContractJson: input.chapterIntentContract
              ? JSON.stringify(input.chapterIntentContract)
              : null,
            persistedVisualWorldJson: input.persistedVisualWorldContract
              ? JSON.stringify(input.persistedVisualWorldContract)
              : null,
            dialogueContractJson: input.chapterDialogueContract
              ? JSON.stringify(input.chapterDialogueContract)
              : null,
            visualWorldObject: vw ?? undefined,
            castContract,
          },
        });

        if (input.premiumV3OnlyEnabled) {
          assertValidChapterGenerationContract(chapterGenerationContract, {
            premiumOnly: true,
            skipHeroVisualRef: false,
            enforceEntitySources: true,
          });
        }
      }

      const preRenderQaResult = runPreRenderPremiumQaOrThrow({
        storyboardPlan: storyboardPassResult.storyboardPlan,
        chapterSummary: input.chapterSummary,
        chapterUserIntent: input.chapterUserIntent,
        chapterLocationName: input.chapterLocationName,
        mainCharacterNames,
      });
      // P00.1 — défensif : la pass peut être mockée (tests) et retourner undefined sans throw.
      const preRenderIssues = Array.isArray(preRenderQaResult?.issues) ? preRenderQaResult.issues : [];
      for (const issue of preRenderIssues) {
        if (typeof issue === "string" && issue.trim().length > 0) {
          pipelineUserWarnings.push(`Pré-rendu storyboard — ${issue.trim()}`);
        }
      }
      await saveStoryboardPlan(input.chapterId, storyboardPassResult.storyboardPlan);

      const renderFalEnabled = isPipelineV3RenderFalEnabled();
      console.log(
        `[pipeline:v3:render] fal_real_enabled=${renderFalEnabled} (flag PIPELINE_V3_RENDER_FAL)`,
      );
      const renderStart = Date.now();
      const renderPassResult = await runRenderPass({
        chapterId: input.chapterId,
        projectId: input.projectId,
        storyboardPlan: storyboardPassResult.storyboardPlan,
        visualQaProductionConfigIncomplete: visualQaProductionConfigSkipped,
        canonicalProductionPlan: canonicalRuntimePlan,
        styleBible: buildStyleBibleFromUserProject({
          project: input.project,
          stylePacks: input.stylePacks,
        }),
        visualMemory: visualMemoryResult.memory,
        characters: input.rawCharacters.map((c) => ({
          id: c.id,
          name: c.name,
          roleType: c.roleType ?? null,
          hairColor: c.hairColor ?? null,
          eyeColor: c.eyeColor ?? null,
          canonSignatureText: c.canonSignatureText ?? null,
          hairStyle: c.hairStyle ?? null,
          skinTone: c.skinTone ?? null,
          outfitSignature: c.outfitSignature ?? null,
          forbiddenVisualDrift: c.forbiddenVisualDrift ?? [],
          loraUrl: c.loraUrl ?? null,
          loraTriggerWord: c.loraTriggerWord ?? null,
          loraScale: c.loraScale ?? null,
          stableVisualDNA: c.stableVisualDNA ?? null,
          characterVisualDna: characterVisualDnaForRenderFromPremiumRow(c),
        })),
        mainCharacterIds: castContract.activeCharacterIds,
        premiumOutOfContractPromptCheck: input.premiumV3OnlyEnabled,
        generatePanelImage: renderFalEnabled
          ? createDefaultPanelImageGenerator({
              forbidMock:
                process.env.NODE_ENV === "production" || Boolean(input.premiumV3OnlyEnabled),
            })
          : undefined,
        persistToDb: renderFalEnabled,
      });
      timings.render_pass_ms = Date.now() - renderStart;
      console.log(
        `[pipeline:v3:render] total=${renderPassResult.summary.totalPanels} specs=${renderPassResult.specs.length} failed=${renderPassResult.summary.failedCount} visual_qa_failed=${renderPassResult.summary.visualQaFailedCount} manual_review=${renderPassResult.summary.manualReviewRequiredCount} quality=${renderPassResult.summary.v3RenderQualityStatus} panel_qa_ok=${renderPassResult.panelQa.okCount}/${renderPassResult.panelQa.okCount + renderPassResult.panelQa.failCount}`,
      );
      if (renderPassResult.summary.warnings.length > 0) {
        console.warn(
          `[pipeline:v3:render] warnings=${renderPassResult.summary.warnings.slice(0, 5).join(" | ")}`,
        );
        for (const w of renderPassResult.summary.warnings.slice(0, 20)) {
          if (typeof w === "string" && w.trim().length > 0) {
            pipelineUserWarnings.push(`Rendu / QA image — ${w.trim()}`);
          }
        }
      }

      // P1.7 — Props QA pass : détection des props fantômes dans les render specs
      const propsQa = runPropsQaPass({
        specs: renderPassResult.specs,
        storyContract,
        strictMode: Boolean(input.premiumV3OnlyEnabled),
      });
      console.log(`[pipeline:v3:props-qa] ${formatPropsQaLog(propsQa)}`);
      if (!propsQa.ok) {
        console.warn(
          `[pipeline:v3:props-qa] phantom_props_detected errorCount=${propsQa.errorCount} warningCount=${propsQa.warningCount}`,
        );
        if (input.premiumV3OnlyEnabled) {
          throw new Error(
            `premium_props_qa_failed: errors=${propsQa.errorCount} warnings=${propsQa.warningCount}`,
          );
        }
      }

      const renderedCount = renderPassResult.summary.renderedCount;
      const skippedCount = renderPassResult.summary.skippedCount;
      const visualQaFailedCount = renderPassResult.summary.visualQaFailedCount;
      const manualReviewRequiredCount = renderPassResult.summary.manualReviewRequiredCount;
      const deferredReviewFromConfig =
        renderPassResult.summary.visualQaProductionConfigIncomplete === true
        && process.env.PREMIUM_VISUAL_QA_REQUIRED === "false";
      const qualityAcceptable =
        renderPassResult.summary.v3RenderQualityStatus === "passed" || deferredReviewFromConfig;

      // Une image visual_qa_failed ou manual_review reste persistée en DB et
      // affichable dans le reader. On ne marque le pipeline FAILED que si une
      // image n'a pas été persistée du tout (failedCount > 0 ou trous dans le
      // total). Les images en review tomberont dans un workflow QA séparé.
      const persistedImagesCount = renderedCount + visualQaFailedCount + manualReviewRequiredCount;
      const allImagesPersisted = persistedImagesCount === renderPassResult.summary.totalPanels;

      v3RenderSucceeded =
        renderPassResult.summary.failedCount === 0 &&
        qualityAcceptable &&
        renderPassResult.specs.length === renderPassResult.summary.totalPanels &&
        renderPassResult.summary.totalPanels > 0 &&
        allImagesPersisted &&
        skippedCount === 0;
      if (!v3RenderSucceeded) {
        console.warn(
          `[pipeline:v3:render] v3_succeeded=false rendered=${renderedCount} skipped=${skippedCount} failed=${renderPassResult.summary.failedCount} visual_qa_failed=${visualQaFailedCount} manual_review=${manualReviewRequiredCount} quality=${renderPassResult.summary.v3RenderQualityStatus} specs=${renderPassResult.specs.length}/${renderPassResult.summary.totalPanels} — legacy image-gen will still run (unless PREMIUM_ONLY=true which would then fail-hard)`,
        );
        if (input.premiumV3OnlyEnabled) {
          throw new Error(
            `premium_v3_only_render_incomplete: rendered=${renderedCount} skipped=${skippedCount} failed=${renderPassResult.summary.failedCount} visual_qa_failed=${visualQaFailedCount} manual_review=${manualReviewRequiredCount} specs=${renderPassResult.specs.length}/${renderPassResult.summary.totalPanels}`,
          );
        }
      }
    } catch (renderErr) {
      const renderMsg = renderErr instanceof Error ? renderErr.message : String(renderErr);
      console.error(
        `[pipeline:v3:render] shadow_render_failed chapterId=${input.chapterId} error=${renderMsg}`,
      );
      if (input.premiumV3OnlyEnabled) {
        throw new Error(`premium_v3_only_render_failed: ${renderMsg}`);
      }
    }
  } catch (v3Err) {
    const v3Msg = v3Err instanceof Error ? v3Err.message : String(v3Err);
    console.error(
      `[pipeline:v3] shadow_mode_failed chapterId=${input.chapterId} error=${v3Msg}`,
    );
    if (input.premiumV3OnlyEnabled) {
      throw new Error(`premium_v3_only_failed: ${v3Msg}`);
    }
  }

  timings.total_ms = Date.now() - pipelineStartMs;
  const timingReport = Object.entries(timings)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
  console.info(
    `[pipeline:v3:report] chapterId=${input.chapterId} v3RenderSucceeded=${v3RenderSucceeded} ${timingReport}`,
  );

  return {
    v3RenderSucceeded,
    visualWorldDiscovery: visualWorldDiscoveryAudit,
    pipelineUserWarnings: dedupePipelineWarnings(),
  };
}
