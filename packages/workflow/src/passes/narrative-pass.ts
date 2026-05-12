/* eslint-disable @typescript-eslint/no-explicit-any -- TODO(Sprint 4 / TASK-4.1): supprimer en découpant ce fichier (1890 LOC) en modules typés. */
/**
 * LEGACY PIPELINE — planification narrative + images (Prisma, scene blueprint, world legacy).
 * La génération premium v3 doit utiliser `run-premium-v3-pipeline`, pas ce module.
 *
 * LEGACY FALLBACK ONLY.
 * Premium generation must use:
 * - VisualWorldContract for world entities
 * - PanelTextContract for dialogue
 * - CharacterCanon / characterVisualDna for characters
 *
 * Si ce fichier est importé dans le chemin premium v3, c’est un bug
 * (garde : `isPremiumStrictMode()` ou `isPipelineV3PremiumOnlyEnabled()` au démarrage).
 */
import {
  generateChapterBundle,
  composeMangaPanelPrompt,
  composeVisualWorldContract,
  toComposeVisualWorldKnownLocation,
  composeEnvironment,
  runChapterContinuityPass,
  runChapterNarrativeCoherencePass,
  parseIntentEntities,
  inferEntityProfile,
  resolveAdultEngine,
  buildCharacterPromptBundle,
  getPremiumImageSize,
  directCombatPanel,
  inferGenreMode,
  getGenreDirectorConfig,
  type StoryboardPanel,
  type ProjectContextForChapter,
} from "@manga-ai-studio/ai";
import {
  getCharacterTierPolicy,
  resolveCharacterImportanceTier,
  resolveChapterLookProfile,
  enforceShotDiversity,
  isHeroRole,
  type StableImageReference,
  type ChapterLookProfile,
  buildApprovedChapterOutlineReplayFromOutlineBeats,
  type VisualWorldContract,
  resolvePanelTextContractFromStoryboardPanelLike,
  type PanelBlueprintPremium,
  isPremiumStrictMode,
} from "@manga-ai-studio/core";
import {
  buildPanelIntentCard,
  type PanelIntentCard,
  buildBodyStatePromptConstraints,
  loadOrCreateBodyState,
} from "@manga-ai-studio/ai";
import { prisma, type Prisma } from "@manga-ai-studio/db";
import {
  buildProjectContext,
  ensureSceneExtras,
  loadProjectRecurringNpcs,
  replaceRagDocument,
} from "@manga-ai-studio/memory";
import { buildSceneBlueprint } from "@manga-ai-studio/world/legacy/scene-blueprint";
import type { SceneBlueprint } from "@manga-ai-studio/world";
import { buildPanelContract } from "../build-panel-contract";
import {
  buildPanelCharacterPlan,
  buildSceneKeyframeDraft,
  inferRequiredSceneExtrasWithVisualWorld,
} from "../pipeline-scene-builder";
import { buildPanelCast } from "../build-panel-cast";
import { buildStableImageReference } from "../stable-image-refs";
import { buildCanonAndLoraIndex } from "./narrative/canon-and-lora-index";
import { buildSceneAnchorsByIndex } from "./narrative/scene-anchor-builder";
import { normalizeLocationName } from "./narrative/location-matcher";
import { LEGACY_STD_NEGATIVE } from "./narrative/panel-prompt-constants";
import { generateDynamicPanelBlueprints } from "./narrative/dynamic-blueprint-generator";
import { generateChapterShotPlan } from "./narrative/shot-plan-generator";
import { buildRomanceDirectionByScene } from "./narrative/romance-director-setup";
import { runSceneContinuityEngine } from "./narrative/scene-continuity-engine";
import { runNpcPromotion } from "./narrative/npc-promotion-runner";
import type {
  LegacyPendingImageWrite,
  LegacyPlannedImage,
} from "./narrative/planned-image-types";
import { persistPlannedImages } from "./narrative/persist-planned-images";
import { logPipelineInfo, logPipelineWarn, logPipelineError } from "../lib/pipeline-logger";
import { applyShotPlanToContract } from "./narrative/apply-shot-plan-to-contract";
import { isPipelineV3PremiumOnlyEnabled } from "../pipeline-feature-flags";
import {
  buildChapterContextDocument,
  buildNpcMemoryContext,
} from "./narrative/chapter-context-document";
import { loadPreviousCanonStateAndKernel } from "./narrative/canon-state-loader";
import { resolveStudioBundle } from "./narrative/studio-bundle-resolver";
import { legacyScenePanelUnifiedDialogue } from "./narrative/legacy-scene-panel-dialogue";
import {
  extractSceneFactions,
  inferSceneWeather,
  inferSceneTimeOfDay,
  uniq,
  asRecord,
} from "../pipeline-helpers";
import {
  syncVisualsAfterNarrativePass,
  enforceBundleIntegrity,
} from "../pipeline-bundle-integrity";
import { setJobProgress, mergeJobOutput } from "../pipeline-job";
import {
  resolveEffectivePanelBlueprints,
  findPanelBlueprint,
  mergeRequiredPropNamesFromPanelBlueprints,
  type PipelineJobInput,
} from "../pipeline-quality";
import type { PipelineContext } from "../pipeline-types";

/**
 * Alias legacy du négatif standard, extrait vers
 * `./narrative/panel-prompt-constants` pour pouvoir le partager avec
 * les modules image-planning sans dupliquer la source.
 */
const STD_NEGATIVE = LEGACY_STD_NEGATIVE;
const PANEL_DRAFT_SIZE = getPremiumImageSize("PANEL_DRAFT");

/**
 * Alias local du type extrait. On garde le nom historique `PlannedImage`
 * pour limiter la churn dans le gros `runNarrativePass` ci-dessous ;
 * le type réel vit dans `./narrative/planned-image-types.ts`.
 */
type PlannedImage = LegacyPlannedImage;

export type NarrativePassResult = {
  // G03: typed outputs — input types remain any[] pending Prisma import refactor (tech debt)
  context: unknown;
  revisedBundle: unknown;
  continuity: { notes: string[]; usedOpenAI?: boolean };
  narrative: { notes: string[]; usedOpenAI?: boolean };
  continuityKernel: unknown;
  studioSnapshot: unknown;
  productionSource: { source: string; fallbackUsed: boolean; legacyBridgeUsed: boolean };
  adultEngine: unknown;
  finalPanelBlueprints: unknown[];
  plannedImages: PlannedImage[];
  chapterGenreMode: string;
  chapterGenreConfig: unknown;
  chapterLookProfile: unknown;
  sceneAnchorByIndex: Map<number, unknown>;
  romanceDirectionByScene: Map<number, unknown>;
  canonRefByName: Map<string, unknown>;
  // P1-5 : ref portrait dédiée par character (pour closeups)
  faceCloseupRefByName: Map<string, unknown>;
  loraByCharId: Map<string, unknown>;
  loraByCharName: Map<string, unknown>;
  validatedSceneSnapshots: unknown[];
  kernelValidationWarnings: string[];
  effectiveCreativeControls: unknown;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- G03: full strict typing requires Prisma types import, tracked as tech debt
export async function runNarrativePass(
  ctx: PipelineContext,
  input: {
    chapter: any;
    project: any;
    job: any;
    stylePacks: any[];
    loraAttachments: any[];
    rawCharacters: any[];
    npcProfiles: any[];
    propInventory: any[];
    npcProfileByCharacterId: Map<string, any>;
    intensityLayer: string;
    effectiveCreativeControls: any;
    enrichedIntent: string;
    selectedPlotLabel: "safe" | "bold" | "shock" | undefined;
    focusCharacterIds: string[];
    jobInput: Record<string, any>;
  },
): Promise<NarrativePassResult> {
  const { jobId, chapterId, projectId, chapterNumber } = ctx;
  const chapter = input.chapter;
  const project = input.project;
  const job = input.job;
  const stylePacks = input.stylePacks;
  const loraAttachments = input.loraAttachments;
  const rawCharacters = input.rawCharacters;
  const npcProfiles = input.npcProfiles;
  const propInventory = input.propInventory;
  const npcProfileByCharacterId = input.npcProfileByCharacterId;
  const intensityLayer = input.intensityLayer;
  const effectiveCreativeControls = input.effectiveCreativeControls;
  const enrichedIntent = input.enrichedIntent;
  const selectedPlotLabel = input.selectedPlotLabel;
  const focusCharacterIds = input.focusCharacterIds;
  const jobInput = input.jobInput;

  if (isPremiumStrictMode() || isPipelineV3PremiumOnlyEnabled()) {
    throw new Error(
      "premium_v3_only_violation: narrative-pass is forbidden when premium-only / strict premium env is active. " +
        "Use the v3 premium pipeline for image generation.",
    );
  }

  // P0.13 : collecte des character states malformés (plus de bool muet).
  const malformedCharacterStates: string[] = [];

  // P0.8 : un identifiant unique de commit narrative. Il est set UNIQUEMENT à
  // la fin de Tx D (une fois Tx A+B+C committées). Les lectures défensives des
  // chapitres peuvent filtrer sur `narrativeCommitId IS NULL` pour détecter un
  // état "stale" (crash en plein milieu du narrative-pass).
  const narrativeCommitId =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `nc_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  // ── Étape 1 : Contexte projet ──────────────────────────────────────────
    await setJobProgress(jobId, { key: "build_context", label: "Contexte projet" }, "running");
    const contextRaw = await buildProjectContext(prisma, projectId, enrichedIntent, { focusCharacterIds });
    if (!contextRaw) throw new Error("project_context_not_found");
    // buildProjectContext retourne un objet structurellement compatible avec ProjectContextForChapter.
    // Le cast est nécessaire car les types Prisma (Json, Decimal…) diffèrent des types pipeline.
    // À terme : exporter ProjectContextForChapter depuis packages/memory et aligner les deux.
    const intentEntities = parseIntentEntities(
      enrichedIntent,
      (contextRaw.characters ?? []).map((c) => c.name),
    );
    const intentEntityByName = new Map(intentEntities.map((entity) => [entity.name.toLowerCase(), entity]));
    const context = {
      ...contextRaw,
      intentEntities,
    } as ProjectContextForChapter;
    const adultEngine = resolveAdultEngine({
      primaryGenre: context.project.primaryGenre,
      subGenres: context.project.subGenres,
      visualStyle: context.project.visualStyle,
      userIntent: enrichedIntent,
    });

    // P1.6 : plafond 40 (contre 20 avant), priorité à des locations citées par les
    // scènes sera appliquée plus bas (topUpKnownLocationsForScenes) une fois
    // `revisedBundle` disponible. On charge donc un pool initial "best-effort"
    // et on complète ensuite par nom pour les lieux cités absents.
    let knownLocations = await prisma.location.findMany({
      where: { projectId },
      select: {
        id: true,
        name: true,
        description: true,
        visualBrief: true,
        establishedVisualBrief: true,
        canonImageUrl: true,
        canonLocked: true,
      },
      take: 40,
    }).catch(() => [] as Array<{
      id: string;
      name: string;
      description: string | null;
      visualBrief?: string | null;
      establishedVisualBrief?: string | null;
      canonImageUrl?: string | null;
      canonLocked?: boolean | null;
    }>);

    const recurringNpcs = await loadProjectRecurringNpcs(prisma, projectId);
    // BUG-23 : log clarifié. Ce compteur ne concerne QUE les PNJ secondaires promus
    // (via NpcVisualProfile.promotionStatus in ["promoted", "locked"]). Les personnages
    // principaux (Character) sont gérés séparément via context.characters et n'apparaissent
    // jamais ici — afficher "0 PNJ" ici n'implique donc PAS une perte des personnages principaux.
    console.log(
      `[pipeline:npc-memory] ${recurringNpcs.length} PNJ secondaires promus chargés ` +
      `(hors personnages principaux — cf. context.characters=${context.characters.length})`,
    );

    const npcMemoryContext = buildNpcMemoryContext(recurringNpcs);
    const contextDocument = buildChapterContextDocument({
      project: context.project,
      storyBible: context.storyBible ?? null,
      characters: context.characters,
      recentMemory: context.recentMemory,
      retrievedDocs: context.retrievedDocs,
      npcMemoryContext,
    });

    await replaceRagDocument(prisma, {
      projectId,
      entityType: "project_context",
      entityId: chapterId,
      title: `Contexte chapitre ${chapterNumber}`,
      content: contextDocument,
      metadata: { chapterId, focusCharacterIds, selectedPlotLabel },
    });
    // ── Charger le canon state précédent (pour continuité) ─────────────────
    // Extrait dans ./narrative/canon-state-loader.ts — inclut la validation T06
    // de cohérence kernel vs canon précédent.
    const canonBundle = await loadPreviousCanonStateAndKernel(prisma, {
      projectId,
      chapterNumber,
    });
    const previousCanonState = canonBundle.previousCanonState;
    const previousCharacterStates = canonBundle.previousCharacterStates;
    let continuityKernel = canonBundle.continuityKernel;

    await setJobProgress(jobId, { key: "build_context", label: "Contexte projet" }, "completed");

    // ── Étape 2 : Génération bundle (outline, script, storyboard) ──────────
    await setJobProgress(
      jobId,
      { key: "generate_bundle", label: "Direction, outline, script, storyboard" },
      "running",
    );
    const chapterOutlineRecord = asRecord(chapter.outline);
    // Résolution priorité premium outline / legacy studio bridge / parsed approved outline.
    // Extrait dans ./narrative/studio-bundle-resolver.ts.
    const studioBundleResolved = resolveStudioBundle(chapterOutlineRecord);
    const studioSnapshot = studioBundleResolved.studioSnapshot;
    const productionSource = studioBundleResolved.productionSource;
    const approvedOutlineForBundle = studioBundleResolved.approvedOutlineForBundle;

    const effectivePanelBlueprints = resolveEffectivePanelBlueprints({
      jobInput: jobInput as PipelineJobInput,
      studioSnapshot,
    });

    const objectStateTimeline = Array.isArray(studioSnapshot?.data?.productionPlan?.objectStateTimeline)
      ? (studioSnapshot!.data!.productionPlan!.objectStateTimeline as Array<{
          beatId: string;
          objectId: string;
          canonicalName: string;
          state: string;
          visibility: string;
        }>)
      : [];
    let bundle = await generateChapterBundle({
      chapterNumber,
      chapterTitle: chapter.title,
      userIntent: enrichedIntent || chapter.userIntent || `Continuer ${context.project.title}`,
      selectedPlotLabel,
      creativityControls: effectiveCreativeControls,
      context,
      approvedOutline: approvedOutlineForBundle,
      // Idem estimate : un seul bootstrap premium avec pool legacy avant composition VW.
      allowLegacyLocationInference: isPipelineV3PremiumOnlyEnabled() ? true : undefined,
    });

    let composedVisualWorldContract: VisualWorldContract | null = null;

    if (process.env.OPENAI_API_KEY && isPipelineV3PremiumOnlyEnabled() && chapterId) {
      try {
        const [charactersForWorld, locationsForWorld] = await Promise.all([
          prisma.character.findMany({
            where: { projectId },
            select: { id: true, name: true, roleType: true, appearance: true },
          }),
          prisma.location.findMany({
            where: { projectId },
            select: {
              id: true,
              name: true,
              type: true,
              description: true,
              visualBrief: true,
              establishedVisualBrief: true,
              canonImageUrl: true,
              canonLocked: true,
              metadata: true,
              visualRefs: true,
            },
          }),
        ]);
        const nameToId = new Map(
          charactersForWorld.map((c) => [c.name.trim().toLowerCase(), c.id] as const),
        );
        const beatRows = approvedOutlineForBundle
          ? approvedOutlineForBundle.beats
          : bundle.outline.beats.map((b) => ({
              id: b.id,
              summary: b.summary,
              characters: b.characters,
              location: b.location,
              pageRole: b.pageRole ?? "escalation",
              turn: b.turn ?? b.purpose,
              emotionalDelta: b.emotionalDelta ?? 0,
              structuredBeat: b.structuredBeat ?? null,
            }));
        const vw = await composeVisualWorldContract({
          chapterId,
          chapterSummary: bundle.outline.chapter_goal,
          chapterUserIntent: enrichedIntent || chapter.userIntent || null,
          projectGenre: context.project.primaryGenre ?? null,
          projectTone: context.project.tone ?? null,
          styleBibleJson: null,
          beats: beatRows.map((b) => ({
            beatId: b.id,
            summary: b.summary,
            whyThisBeatExists: b.pageRole ?? null,
            dramaticChange: b.turn ?? null,
            involvedCharacterIds: (b.characters ?? [])
              .map((name) => nameToId.get(String(name).trim().toLowerCase()))
              .filter((x): x is string => Boolean(x)),
          })),
          knownCharacters: charactersForWorld.map((c) => ({
            id: c.id,
            name: c.name,
            roleType: c.roleType ?? null,
            description: c.appearance ?? null,
          })),
          knownLocations: locationsForWorld.map((loc) => toComposeVisualWorldKnownLocation(loc)),
        });
        const approvedReplay = approvedOutlineForBundle
          ?? buildApprovedChapterOutlineReplayFromOutlineBeats({
            summary: bundle.outline.chapter_goal,
            cliffhanger: bundle.outline.cliffhanger,
            source: "estimate_preview",
            beats: bundle.outline.beats.map((beat) => ({
              id: beat.id,
              summary: beat.summary,
              characters: beat.characters,
              location: beat.location,
              pageRole: beat.pageRole ?? "escalation",
              turn: beat.turn ?? beat.purpose,
              emotionalDelta: beat.emotionalDelta ?? 0,
              structuredBeat: beat.structuredBeat ?? null,
            })),
          });
        bundle = await generateChapterBundle({
          chapterNumber,
          chapterTitle: chapter.title,
          userIntent: enrichedIntent || chapter.userIntent || `Continuer ${context.project.title}`,
          selectedPlotLabel,
          creativityControls: effectiveCreativeControls,
          context,
          approvedOutline: approvedReplay,
          visualWorldContract: vw,
          allowLegacyLocationInference: isPipelineV3PremiumOnlyEnabled() ? false : undefined,
        });
        composedVisualWorldContract = vw;
      } catch (e) {
        logPipelineWarn("visual_world_bundle_realign_failed", {
          chapterId,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    await setJobProgress(
      jobId,
      { key: "generate_bundle", label: "Direction, outline, script, storyboard" },
      "completed",
    );
    await setJobProgress(
      jobId,
      { key: "continuity_pass", label: "Continuité IA avant images" },
      "running",
    );
    const continuity = await runChapterContinuityPass({
      context,
      bundle,
      chapterGoal: bundle.creativeDirection.chapterGoal,
      selectedPlotLabel,
    });
    let revisedBundle = continuity.bundle;
    await setJobProgress(
      jobId,
      {
        key: "continuity_pass",
        label: continuity.usedOpenAI ? "Continuité IA appliquée" : "Continuité fallback appliquée",
        detail: continuity.notes.slice(0, 2).join(" · ") || undefined,
      },
      "completed",
    );

    await setJobProgress(jobId, { key: "story_coherence_pass", label: "Cohérence narrative & rythme" }, "running");
    const narrative = await runChapterNarrativeCoherencePass({
      context,
      bundle: revisedBundle,
      chapterGoal: revisedBundle.creativeDirection.chapterGoal,
      selectedPlotLabel,
      creativityControls: effectiveCreativeControls as Record<string, number>,
    });
    revisedBundle = narrative.bundle;
    const integrity = enforceBundleIntegrity(revisedBundle);
    revisedBundle = integrity.bundle;
    revisedBundle = syncVisualsAfterNarrativePass(revisedBundle);

    // P1.6 : top-up de `knownLocations` pour les lieux cités par les scènes
    // mais absents de notre pool initial (`take: 40`). Évite qu'un lieu
    // référencé soit matché à vide, sans l'explosion qu'aurait provoqué
    // un load "all locations".
    try {
      const citedLocationNames = new Set<string>();
      for (const scene of revisedBundle.script.scenes) {
        const norm = normalizeLocationName(scene?.location ?? null);
        if (norm.length > 0) citedLocationNames.add(norm);
      }
      const knownNormalized = new Set(knownLocations.map((l) => normalizeLocationName(l.name)));
      const missing = Array.from(citedLocationNames).filter((n) => !knownNormalized.has(n));
      if (missing.length > 0) {
        console.warn(
          `[pipeline] knownLocations top-up required for ${missing.length} cited locations (pool=${knownLocations.length})`,
        );
        // Fetch par OR de nomsPAR normalization n'est pas triviale en SQL,
        // on fait donc un fetch par OR de noms bruts pour chaque nom cité.
        const missingCanonicalNames = Array.from(
          new Set(
            revisedBundle.script.scenes
              .map((s) => s?.location)
              .filter((n): n is string => typeof n === "string" && n.length > 0)
              .filter((n) => missing.includes(normalizeLocationName(n))),
          ),
        );
        if (missingCanonicalNames.length > 0) {
          const extra = await prisma.location.findMany({
            where: { projectId, name: { in: missingCanonicalNames } },
            select: {
              id: true,
              name: true,
              description: true,
              visualBrief: true,
              establishedVisualBrief: true,
              canonImageUrl: true,
              canonLocked: true,
            },
          }).catch(() => [] as typeof knownLocations);
          if (extra.length > 0) {
            knownLocations = [...knownLocations, ...extra];
          }
        }
      }
    } catch (topUpErr) {
      console.warn(
        `[pipeline] knownLocations_top_up_failed (non-blocking): ${topUpErr instanceof Error ? topUpErr.message : topUpErr}`,
      );
    }

    await runNpcPromotion({
      projectId,
      revisedBundle,
      studioSnapshot,
      rawCharacters,
    });

    if (integrity.notes.length > 0) {
      console.warn(`[pipeline] bundle integrity fixes: ${integrity.notes.join(" | ")}`);
    }
    if (revisedBundle.generationDiagnostics.degradedModes.length > 0) {
      console.warn(
        `[pipeline] degraded_generation status=${revisedBundle.generationDiagnostics.operationalStatus} modes=${revisedBundle.generationDiagnostics.degradedModes.join(",")} outline=${revisedBundle.generationDiagnostics.outline.fallbackReason ?? "none"} dialogueScenes=${revisedBundle.generationDiagnostics.dialogue.fallbackSceneIds.join(",") || "none"}`,
      );
    }
    await mergeJobOutput(jobId, {
      operationalStatus: revisedBundle.generationDiagnostics.operationalStatus,
      degradedModes: revisedBundle.generationDiagnostics.degradedModes,
      generationDiagnostics: revisedBundle.generationDiagnostics,
    });
    await setJobProgress(
      jobId,
      {
        key: "story_coherence_pass",
        label: narrative.usedOpenAI ? "Narration peaufinée" : "Narration (fallback)",
        detail: [...narrative.notes.slice(0, 2), ...integrity.notes.slice(0, 1)].join(" · ") || undefined,
      },
      "completed",
    );

    // T04: early declarations for blueprint diagnostics (assigned in blueprint generation block below)
    let blueprintSource:
      | "studio_premium"
      | "dynamic_llm"
      | "dynamic_heuristic"
      | "dynamic_llm_expanded"
      | "dynamic_heuristic_expanded"
      | "MISSING" =
      effectivePanelBlueprints.length > 0 ? "studio_premium" : "MISSING";
    const orphanedBeatIds: string[] = [];
    // T07: early declaration for shot plan (assigned after blueprint generation)
    let chapterShotPlan: import("@manga-ai-studio/core").ChapterShotPlan | null = null;
    // NPC list built during shot-plan phase, re-used during panel-loop for character injection
    let importantNpcs: Array<{ characterId: string; name: string; role: "important_npc"; firstAppearanceSceneIndex: number }> = [];

    // ── Étape 3 : Persistance chapitre + scènes + images planifiées ────────
    await setJobProgress(
      jobId,
      { key: "persist_chapter", label: "Persistance chapitre" },
      "running",
    );

    const chapterOutline: Prisma.InputJsonValue = {
      ...asRecord(chapter.outline),
      ...revisedBundle.outline,
      operationalStatus: revisedBundle.generationDiagnostics.operationalStatus,
      degradedModes: revisedBundle.generationDiagnostics.degradedModes,
      generationDiagnostics: {
        ...revisedBundle.generationDiagnostics.outline,
        blueprintSource,
        orphanedBeatIds: orphanedBeatIds.length > 0 ? orphanedBeatIds : undefined,
      },
      shotPlan: chapterShotPlan ?? undefined,
    };
    const chapterScript: Prisma.InputJsonValue = {
      ...revisedBundle.script,
      operationalStatus: revisedBundle.generationDiagnostics.operationalStatus,
      degradedModes: revisedBundle.generationDiagnostics.degradedModes,
      generationDiagnostics: revisedBundle.generationDiagnostics.dialogue,
    };
    const chapterStoryboard: Prisma.InputJsonValue = revisedBundle.storyboard;

    // ── Genre director : inférer le mode une fois pour tout le chapitre ──────
    const chapterGenreMode = inferGenreMode(
      effectiveCreativeControls,
      selectedPlotLabel,
      project?.primaryGenre ?? null,
    );
    const chapterGenreConfig = getGenreDirectorConfig(chapterGenreMode);

    // ── ChapterLookProfile : résoudre depuis le snapshot studio ──────────────
    const studioLookProfileRaw = studioSnapshot?.data?.chapterLookProfile;
    const chapterLookProfile: ChapterLookProfile = resolveChapterLookProfile(
      studioLookProfileRaw?.mode ?? null,
    );
    const _debugPanelLegacy = process.env.MANGA_DEBUG_PANEL === "true";

    // ── SceneAnchor : construire une ancre ENRICHIE par scène ─────────────────
    // DIAG-D (Option 1 — anchor-by-scene). Construction extraite dans
    // ./narrative/scene-anchor-builder.ts. Zéro coût supplémentaire par panel.
    const sceneAnchorByIndex = buildSceneAnchorsByIndex({
      scenes: revisedBundle.script.scenes,
      project: {
        primaryGenre: context.project.primaryGenre,
        tone: context.project.tone ?? null,
        visualStyle: context.project.visualStyle ?? null,
      },
      knownLocations,
      rawCharacters,
      recurringNpcs,
    });

    // ── Romance director : pré-calculer la direction pour les scènes émotionnelles ──
    const romanceDirectionByScene = buildRomanceDirectionByScene(
      revisedBundle.script.scenes,
      chapterGenreMode,
    );

    console.log(
      `[pipeline] genre_director mode=${chapterGenreMode} rhythm=${chapterGenreConfig.beatRhythm} panelDensity=${chapterGenreConfig.panelDensity} romance_scenes=${romanceDirectionByScene.size}`,
    );

    let finalPanelBlueprints = effectivePanelBlueprints;
    /** Rempli par le chemin blueprints dynamiques : noms de props inférés (VW + faits) par `beat.id`. */
    let beatInferredPropNamesByBeatId = new Map<string, string[]>();

    if (finalPanelBlueprints.length === 0 && revisedBundle.outline.beats.length > 0) {
      const dynamic = await generateDynamicPanelBlueprints({
        chapterNumber,
        chapterId,
        projectId,
        beats: revisedBundle.outline.beats,
        rawCharacters,
        composedVisualWorldContract,
        project: {
          primaryGenre: context.project.primaryGenre ?? null,
          tone: context.project.tone ?? null,
        },
      });
      beatInferredPropNamesByBeatId = dynamic.beatInferredPropNamesByBeatId;
      orphanedBeatIds.push(...dynamic.orphanedBeatIds);
      if (dynamic.blueprints.length > 0) {
        finalPanelBlueprints = dynamic.blueprints;
        blueprintSource = dynamic.blueprintSource ?? blueprintSource;
      }
    }

    if (finalPanelBlueprints.length === 0 && revisedBundle.outline.beats.length > 0) {
      blueprintSource = "MISSING";
      const errMsg = `[pipeline] FATAL: 0 blueprints generated for ${revisedBundle.outline.beats.length} beats — pipeline cannot proceed without blueprints`;
      console.error(errMsg);
      throw new Error("missing_blueprints: no panel blueprints could be generated from any source");
    }

    // Shot diversity enforcement (legacy) + ShotPlan director
    if (finalPanelBlueprints.length > 0) {
      const { blueprints: diversifiedBlueprints, report: diversityReport } =
        enforceShotDiversity(finalPanelBlueprints);
      console.log(`[pipeline:shot-diversity] hero=${Math.round(diversityReport.heroCenterRatio * 100)}%` +
        ` env=${Math.round(diversityReport.environmentRatio * 100)}%` +
        ` npc=${Math.round(diversityReport.npcRatio * 100)}%` +
        ` corrections=${diversityReport.corrections.length}`);
      if (!diversityReport.valid) {
        console.warn("[pipeline:shot-diversity] violations:", diversityReport.violations.map((v: any) => v.type));
      }
      finalPanelBlueprints = diversifiedBlueprints;
    }

    if (finalPanelBlueprints.length > 0) {
      mergeRequiredPropNamesFromPanelBlueprints(finalPanelBlueprints, beatInferredPropNamesByBeatId);
    }

    // T07: Chapter ShotPlan — plan de coupe bout en bout
    {
      const shotPlanResult = await generateChapterShotPlan({
        jobId,
        chapterId,
        projectId,
        beats: revisedBundle.outline.beats as Array<{
          id: string;
          characters?: string[];
          location?: string;
          summary?: string;
          pageRole?: string;
          purpose?: string;
        }>,
        rawCharacters,
        chapterGenreMode,
        bundleDiagnostics: revisedBundle.generationDiagnostics as Record<string, unknown>,
      });
      chapterShotPlan = shotPlanResult.chapterShotPlan;
      importantNpcs = shotPlanResult.importantNpcs;
    }

    const plannedImages: PlannedImage[] = [];
    const sceneBlueprintsByScene = new Map<number, SceneBlueprint[]>();

    // C05: collect computed image data outside transactions for micro-tx writes.
    // Le type est désormais défini dans `./narrative/planned-image-types.ts`
    // pour pouvoir être consommé par `persistPlannedImages` sans duplication.
    type PendingImageWrite = LegacyPendingImageWrite;
    const pendingImageWrites: PendingImageWrite[] = [];

    // P0-5: Tx A — chapter metadata seule (<5s).
    // NB: status "ready_for_render" est volontairement DIFFÉRÉ jusqu'à ce que
    // Tx B (scenes+locations) ET Tx C (images) aient commit. Sinon un échec
    // partiel laisse un chapter flag "ready" sans scènes/images ↔ rendu à vide.
    await prisma.$transaction(async (tx) => {
      await tx.chapter.update({
        where: { id: chapterId },
        data: {
          title: revisedBundle.outline.chapter_title,
          outline: chapterOutline,
          script: chapterScript,
          storyboard: chapterStoryboard,
          summary: revisedBundle.memory.narrativeSummary,
          cliffhanger: revisedBundle.outline.cliffhanger,
          tokenEstimate: job.estimatedTokenCost ?? 80,
          tokenActual: job.actualTokenCost ?? job.estimatedTokenCost ?? 80,
        },
      });
    }, { timeout: 10_000 });

    // C05: Tx B — scenes + images, timeout élevé mais isolé du chapter.update.
    //
    // P0.9 : briefs de lieu "établis" pendant CE run de Tx B, suivis localement
    // via une Map (clé = nom normalisé NFD). Remplace l'ancienne mutation de
    // `locationRecord.establishedVisualBrief` sur l'array `knownLocations` qui
    // pouvait laisser un brief fantôme en mémoire si Tx B rollbackait.
    const establishedBriefsThisTx = new Map<string, string>();
    const sceneBlueprintBuildOpts = { disableOntologySelections: isPipelineV3PremiumOnlyEnabled() };
    await prisma.$transaction(
      async (tx) => {
        for (let index = 0; index < revisedBundle.script.scenes.length; index++) {
          const scene = revisedBundle.script.scenes[index];
          if (!scene) continue;

          const romanceDirection = romanceDirectionByScene.get(index);
          const sceneData = {
              title: scene.title,
              summary: scene.summary,
              script: scene as unknown as Prisma.InputJsonValue,
              dialogue: scene.dialogue as unknown as Prisma.InputJsonValue,
              metadata: {
                location: scene.location,
                characters: scene.characters,
                purpose: scene.purpose,
                continuityPayload: scene.continuityPayload,
                operationalStatus: revisedBundle.generationDiagnostics.operationalStatus,
                dialogueGeneration: scene.generationDiagnostics?.dialogue ?? {
                  degradedStatus: "FULLY_OPERATIONAL",
                  usedFallback: false,
                },
                genreDirectorMode: chapterGenreMode,
                genreBeatRhythm: chapterGenreConfig.beatRhythm,
                genrePanelDensity: chapterGenreConfig.panelDensity,
                romanceDirection: romanceDirection
                  ? {
                      detectedBeat: romanceDirection.detectedBeat,
                      suggestedBeat: romanceDirection.suggestedBeat.type,
                      tensionAfter: romanceDirection.tensionAfter,
                      panelSuggestions: romanceDirection.suggestedBeat.panelSuggestions.slice(0, 2),
                    }
                  : null,
              },
          };
          const createdScene = await tx.chapterScene.upsert({
            where: { chapterId_sceneNumber: { chapterId, sceneNumber: index + 1 } },
            create: { chapterId, sceneNumber: index + 1, ...sceneData },
            update: sceneData,
          });

          // H14 — en pipeline v3, le StoryboardPlan est la source de vérité
          // pour le layout de page. On n'utilise PLUS l'index de scène comme
          // proxy de page, et on ne dérive PLUS de `pageLayoutTemplate` depuis
          // `chapterShotPlan`. Le reader lit directement `storyboardPlanV2`.
          if (process.env.PIPELINE_V3_STORYBOARD === "true") {
            // skip scene→page layout derivation — storyboardPlanV2 is authoritative
          } else {
          // T09: derive page layout from ShotPlan (per page, not per beat)
          try {
            const shotPlanPage = chapterShotPlan?.pages.find((p) => p.pageNumber === index + 1);
            if (shotPlanPage) {
              await tx.chapterScene.update({
                where: { id: createdScene.id },
                data: {
                  pageLayoutTemplate: shotPlanPage.template,
                  dramaticWeight: shotPlanPage.respirationPanel != null ? 0.6 : 0.8,
                  isSplashPage: shotPlanPage.template === "splash",
                  isDoublePage: shotPlanPage.template === "double_spread",
                },
              });
            } else {
              const { resolvePageLayout } = await import("@manga-ai-studio/ai");
              const beatForLayout = revisedBundle.outline.beats[index];
              const totalBeats = revisedBundle.outline.beats.length;
              const beatHints = {
                pageRole: (beatForLayout?.pageRole ?? "escalation") as "establishing" | "escalation" | "confrontation" | "revelation" | "aftermath" | "cliffhanger" | "dialogue" | "action" | "transition",
                emotionalDelta: typeof (beatForLayout as { emotionalDelta?: number })?.emotionalDelta === "number"
                  ? ((beatForLayout as { emotionalDelta?: number }).emotionalDelta as number)
                  : (beatForLayout?.pageRole === "revelation" || beatForLayout?.pageRole === "cliffhanger" ? 2 : 0),
                cutawayType: null,
                subjectFocus: null,
                panelCount: finalPanelBlueprints.filter((bp) => {
                  const bpRec = bp as unknown as Record<string, unknown>;
                  const bpPage = typeof bpRec.pageNumber === "number" ? bpRec.pageNumber : null;
                  return bpPage === null || bpPage === index + 1;
                }).length || 4,
              };
              const layoutDecision = resolvePageLayout(beatHints, {
                isFirst: index === 0,
                isLast: index === totalBeats - 1,
                beatIndex: index,
                totalBeats,
              });
              await tx.chapterScene.update({
                where: { id: createdScene.id },
                data: {
                  pageLayoutTemplate: layoutDecision.template,
                  dramaticWeight: layoutDecision.dramaticWeight,
                  isSplashPage: layoutDecision.template === "splash",
                  isDoublePage: layoutDecision.isDoublePage,
                },
              });
            }
          } catch (layoutErr) {
            console.warn(`[pipeline] layout_decision_failed (non-blocking): ${layoutErr instanceof Error ? layoutErr.message : layoutErr}`);
          }
          } // end v3 guard (H14)

          if (scene.location) {
            try {
              // P1.5 : normalisation NFD + casse pour matcher les noms accentués.
              const sceneLocNorm = normalizeLocationName(scene.location);
              const locationRecord = knownLocations.find(
                (loc) => normalizeLocationName(loc.name) === sceneLocNorm,
              );
              if (locationRecord && !locationRecord.establishedVisualBrief && scene.summary) {
                const visualBrief = [
                  scene.location,
                  scene.summary.slice(0, 200),
                ].filter(Boolean).join(" — ");
                // P0.9 : on écrit en DB dans la Tx B, mais on NE mute PLUS
                // `locationRecord.establishedVisualBrief` en mémoire (pour
                // éviter une "location établie" fantôme si Tx B rollback).
                // Les panels suivants liront la valeur rafraîchie via
                // `refreshedKnownLocations` (post-Tx B).
                await tx.location.updateMany({
                  where: { projectId, name: locationRecord.name },
                  data: {
                    establishedVisualBrief: visualBrief,
                    firstSeenChapterId: chapterId,
                  },
                });
                // P0.9 : on trace la valeur établie dans CE Tx via la Map
                // locale plutôt qu'en mutant `locationRecord`. Si Tx B rollback,
                // la Map est garbage-collected et on redémarre proprement.
                establishedBriefsThisTx.set(sceneLocNorm, visualBrief);
              }
            } catch (decorErr) {
              console.warn(`[pipeline] decor_anchor_failed (non-blocking): ${decorErr instanceof Error ? decorErr.message : decorErr}`);
            }
          }

          const beatId = revisedBundle.outline.beats[index]?.id;
          const persistentSceneExtras = await ensureSceneExtras(tx, {
            sceneId: createdScene.id,
            locationName: scene.location,
            projectId,
            requiredExtras: inferRequiredSceneExtrasWithVisualWorld(
              composedVisualWorldContract,
              scene,
              beatId,
            ),
          });

          const storyboardPage = revisedBundle.storyboard.pages[index];
          if (!storyboardPage) continue;
          const stylePack = stylePacks[0];
          const sceneKeyframeDraft = buildSceneKeyframeDraft({
            sceneId: createdScene.id,
            scene: {
              summary: scene.summary,
              location: scene.location,
              characters: scene.characters,
              purpose: scene.purpose,
            },
            sceneBlueprint: buildSceneBlueprint({
              panelId: `${createdScene.id}:scene_keyframe`,
              pageNumber: index + 1,
              panelNumber: 0,
              seed: chapterNumber * 10_000 + (index + 1) * 100,
              narrative: {
                chapterTitle: revisedBundle.outline.chapter_title,
                chapterGoal: revisedBundle.outline.chapter_goal,
                sceneSummary: scene.summary,
                scenePurpose: scene.purpose,
                panelIntent: scene.summary,
                pageRole: "establishing",
                panelNarration: scene.summary,
              },
              cast: {
                namedCharacters: scene.characters,
                npcNames: persistentSceneExtras.map((extra) => extra.archetypeLabel),
                creatureNames: [],
              },
              scene: {
                location: scene.location,
                weather: inferSceneWeather(scene.summary),
                timeOfDay: inferSceneTimeOfDay(scene.summary),
                worldState: [],
                factions: extractSceneFactions(scene.summary),
              },
              style: {
                // BUG-21 : ne pas fallback sur "fantasy" (contamine le scoring des ontologies
                // pour un projet sans genre explicite). "generic" = famille neutre.
                universe: context.project.primaryGenre?.trim() || "generic",
                tone: context.project.tone ?? "dramatic",
                visualStyle: project?.visualStyle ?? "manga",
                renderFamily: stylePack?.renderFamily ?? undefined,
                cameraLanguage: stylePack?.cameraLanguage ?? undefined,
                backgroundDensity: stylePack?.backgroundDensity ?? undefined,
              },
              composition: {
                shotType: "wide",
                cameraAngle: "eye_level",
                focusCharacters: scene.characters.slice(0, 2),
                requiredCharacters: scene.characters,
                backgroundExtras: persistentSceneExtras.map((extra) => `${extra.archetypeLabel}:${extra.anchorSlot}`),
              },
              controls: effectiveCreativeControls,
              continuity: {
                anchors: persistentSceneExtras.map((extra) => `${extra.anchorSlot}:${extra.archetypeLabel}`),
                worldRules: [],
                styleRules: [],
                loreConstraints: [],
              },
              premiumContract: (() => {
                const bid = revisedBundle.outline.beats[index]?.id;
                const names = bid ? beatInferredPropNamesByBeatId.get(bid) : undefined;
                if (!names?.length) return undefined;
                return { requiredPropNames: names };
              })(),
            }, sceneBlueprintBuildOpts),
            stylePack: stylePack
              ? {
                  renderFamily: stylePack.renderFamily,
                  lineWeight: stylePack.lineWeight,
                  shadingMode: stylePack.shadingMode,
                  contrastProfile: stylePack.contrastProfile,
                  backgroundDensity: stylePack.backgroundDensity,
                  cameraLanguage: stylePack.cameraLanguage,
                }
              : null,
            persistentSceneExtras,
          });
          const sceneKeyframe = await tx.sceneKeyframe.create({
            data: {
              projectId,
              chapterId,
              sceneId: createdScene.id,
              version: 1,
              selected: true,
              imageUrl: null,
              involvedCharacterIds: scene.characters,
              environmentLock: sceneKeyframeDraft.environmentLock as Prisma.InputJsonValue,
              lightingLock: inferSceneTimeOfDay(scene.summary),
              timeOfDay: inferSceneTimeOfDay(scene.summary),
              compositionArchetype: sceneKeyframeDraft.compositionArchetype,
              emotionalTone: scene.purpose,
              combatMode: /fight|combat|battle|duel|impact/i.test(scene.purpose ?? scene.summary),
              metadata: {
                positivePrompt: sceneKeyframeDraft.positivePrompt,
                negativePrompt: sceneKeyframeDraft.negativePrompt,
                involvedCharacterNames: sceneKeyframeDraft.involvedCharacterNames,
              } as Prisma.InputJsonValue,
            },
          });

          for (const panel of storyboardPage.panels) {
              let composedPositive = panel.prompt;
              let composedNegative = panel.negativePrompt;
              let promptDebug: Record<string, unknown> | null = null;
              const panelCanonRefs = panel.characters
                .map((name: string) => rawCharacters.find((c) => c.name === name)?.canonicalImageUrl)
                .filter((url: any): url is string => Boolean(url));
              const panelPremiumBlueprint = finalPanelBlueprints.length > 0
                ? findPanelBlueprint(finalPanelBlueprints, index, panel.panelNumber)
                : undefined;

              const panelContractBase = await buildPanelContract({
                panelId: `${createdScene.id}:${panel.panelNumber}`,
                pageNumber: index + 1,
                panelNumber: panel.panelNumber,
                panel,
                sceneContext: {
                  location: scene.location,
                  atmosphere: scene.purpose,
                  presentCharacters: scene.characters,
                },
                previousPanelId: panel.panelNumber > 1 ? `${createdScene.id}:${panel.panelNumber - 1}` : undefined,
                visualAnchorIds: panelCanonRefs,
                panelBlueprint: panelPremiumBlueprint,
              });

              // C02 / P4.3: Appliquer le ShotPlan per-panel via helper typé.
              // Plus aucune mutation `(x as any).y = z` : on passe par
              // `applyShotPlanToContract` qui retourne un nouveau contract
              // avec la surface `PanelContractWithShotPlan` explicite.
              const shotPlanPage = chapterShotPlan?.pages.find((p) => p.pageNumber === index + 1);
              const shotPlanPanel = shotPlanPage?.panels.find((sp) => sp.panelNumber === panel.panelNumber);
              const panelContractWithShot = applyShotPlanToContract(panelContractBase, shotPlanPanel);
              if (shotPlanPanel) {
                panelContractBase.shotType = panelContractWithShot.shotType;
                (panelContractBase as unknown as Record<string, unknown>).cameraAngle = panelContractWithShot.cameraAngle;
                (panelContractBase as unknown as Record<string, unknown>).subjectFocus = panelContractWithShot.subjectFocus;
                (panelContractBase as unknown as Record<string, unknown>).cutawayType = panelContractWithShot.cutawayType;
                (panelContractBase as unknown as Record<string, unknown>).heroCenterAllowed = panelContractWithShot.heroCenterAllowed;

                // C02b: si le shot plan demande un focus NPC mais que ce NPC n'est pas dans
                // panel.characters (l'IA narrative ne l'a pas mis), on l'injecte depuis la
                // scène pour qu'il soit bien décrit dans le Subject Lock du prompt.
                if (
                  shotPlanPanel.subjectFocus === "important_npc"
                  && importantNpcs.length > 0
                ) {
                  for (const npc of importantNpcs) {
                    if (
                      scene.characters.includes(npc.name)
                      && !panel.characters.includes(npc.name)
                    ) {
                      panel.characters = [...panel.characters, npc.name];
                      break; // n'injecter qu'un seul NPC par panel
                    }
                  }
                }
              }

              const panelBackgroundExtras = [
                ...scene.characters.filter((name: string) => !panel.characters.includes(name)).slice(0, 2),
                ...persistentSceneExtras.map((extra) => `${extra.archetypeLabel}:${extra.anchorSlot}`),
              ].slice(0, 4);
              const sceneBlueprint = buildSceneBlueprint({
                panelId: `${createdScene.id}:${panel.panelNumber}`,
                pageNumber: index + 1,
                panelNumber: panel.panelNumber,
                seed: chapterNumber * 10_000 + (index + 1) * 100 + panel.panelNumber,
                narrative: {
                  chapterTitle: revisedBundle.outline.chapter_title,
                  chapterGoal: revisedBundle.outline.chapter_goal,
                  sceneSummary: scene.summary,
                  scenePurpose: scene.purpose,
                  panelIntent:
                    panel.narration
                    ?? panel.caption
                    ?? (panel as { turn?: string }).turn
                    ?? scene.summary.slice(0, 140),
                  panelNarration: panel.narration ?? null,
                  pageRole: revisedBundle.outline.beats[index]?.pageRole ?? null,
                },
                style: {
                  // BUG-21 : "generic" plutôt que "fantasy" pour éviter leak thématique.
                  universe: context.project.primaryGenre?.trim() || "generic",
                  tone: context.project.tone ?? "dramatique",
                  visualStyle: context.project.visualStyle ?? "manga",
                  renderFamily: stylePacks[0]?.renderFamily ?? null,
                  cameraLanguage: null,
                  backgroundDensity: "high",
                },
                scene: {
                  location: scene.location,
                  timeOfDay: inferSceneTimeOfDay(`${scene.summary} ${scene.location}`),
                  weather: inferSceneWeather(`${scene.summary} ${scene.location}`),
                  worldState: uniq([
                    ...continuityKernel.worldState.activeThreats,
                    ...continuityKernel.worldState.activeMysteries,
                    ...(context.recentContinuityEvents ?? [])
                      .map((event: any) => event.summary)
                      .filter((item: any): item is string => Boolean(item))
                      .slice(0, 4),
                  ]),
                  factions: uniq([
                    ...continuityKernel.worldState.factions,
                    ...extractSceneFactions(`${scene.summary} ${scene.location}`),
                  ]),
                },
                composition: {
                  shotType: panelContractBase.shotType,
                  cameraAngle: panelContractBase.cameraAngle,
                  focusCharacters: panelContractBase.focusCharacters,
                  requiredCharacters: panelContractBase.requiredCharacters,
                  backgroundExtras: [...panelContractBase.backgroundExtras, ...panelBackgroundExtras].slice(0, 6),
                },
                cast: {
                  namedCharacters: panel.characters,
                  npcNames: uniq([
                    ...panelBackgroundExtras,
                    ...persistentSceneExtras.map((extra) => extra.archetypeLabel),
                  ]),
                  creatureNames: [],
                },
                controls: {
                  noveltyLevel: effectiveCreativeControls.noveltyLevel,
                  worldStrictness: effectiveCreativeControls.worldStrictness,
                  visualExoticism: effectiveCreativeControls.visualExoticism,
                  npcVariety: effectiveCreativeControls.npcVariety,
                  environmentRichness: effectiveCreativeControls.environmentRichness,
                },
                continuity: {
                  anchors: [
                    scene.location,
                    scene.purpose,
                    ...(
                      continuityKernel.locationStates.find((location: any) => location.name.toLowerCase() === scene.location.toLowerCase())?.visualAnchors
                      ?? []
                    ).slice(0, 3),
                    ...(revisedBundle.outline.continuity_notes ?? []).slice(0, 3),
                  ],
                  worldRules: uniq([
                    ...continuityKernel.storyBible.worldRules,
                    ...continuityKernel.worldState.structuralProhibitions,
                  ]).slice(0, 6),
                  styleRules: stylePacks[0]
                    ? [
                        stylePacks[0].renderFamily,
                        stylePacks[0].lineWeight,
                        stylePacks[0].shadingMode,
                        stylePacks[0].contrastProfile,
                      ].filter(Boolean).map((item) => String(item))
                    : [],
                  loreConstraints: uniq([
                    typeof context.storyBible?.summary === "string" ? context.storyBible.summary.slice(0, 160) : null,
                    continuityKernel.arcRegistry.find((arc: any) => arc.status !== "closed")?.currentState ?? null,
                    ...continuityKernel.eventLog.slice(0, 3).map((event: any) => event.description),
                    ...previousCharacterStates
                      .filter((state) => {
                        const stableName = (state as any)?.identity?.stableName;
                        if (typeof stableName !== "string" || stableName.length === 0) {
                          // P0.13 : collecte des IDs/refs malformés (plus de bool muet).
                          const ref =
                            typeof (state as any)?.identity?.characterId === "string"
                              ? `id=${(state as any).identity.characterId}`
                              : typeof (state as any)?.identity?.displayName === "string"
                                ? `name=${(state as any).identity.displayName}`
                                : "<unknown>";
                          if (!malformedCharacterStates.includes(ref)) {
                            malformedCharacterStates.push(ref);
                            console.warn(
                              `[pipeline] malformed_character_state_missing_identity ${ref} jobId=${jobId} chapterId=${chapterId}`,
                            );
                          }
                          return false;
                        }
                        return panel.characters.includes(stableName);
                      })
                      .flatMap((state) => Array.isArray((state as any)?.continuityObligations) ? (state as any).continuityObligations : []),
                  ]),
                },
                premiumContract: panelPremiumBlueprint
                  ? {
                      subjectFocus: panelPremiumBlueprint.subjectFocus,
                      mustShowEnemy: panelPremiumBlueprint.mustShowEnemy,
                      requiredNpcCount: panelPremiumBlueprint.requiredNpcCount,
                      speakerAnchorCharacterId: panelPremiumBlueprint.speakerAnchorCharacterId,
                      dialogueCarrier: panelPremiumBlueprint.dialogueCarrier,
                      cutawayType: panelPremiumBlueprint.cutawayType,
                      heroCenterAllowed: panelPremiumBlueprint.heroCenterAllowed,
                      requiredPropNames: panelPremiumBlueprint.requiredProps.map((p: any) => p.canonicalName),
                      antiCollapseReason: panelPremiumBlueprint.cutawayType !== "none"
                        ? `cutaway type: ${panelPremiumBlueprint.cutawayType}`
                        : undefined,
                    }
                  : undefined,
              }, sceneBlueprintBuildOpts);
              // La Map utilise `sceneNumber` (1-based) comme clé pour
              // matcher la convention DB (`chapterScene.sceneNumber`) et
              // éviter les off-by-one côté consumers (cf. FIX-2).
              const sceneNumber = index + 1;
              const sceneBlueprints = sceneBlueprintsByScene.get(sceneNumber) ?? [];
              sceneBlueprints.push(sceneBlueprint);
              sceneBlueprintsByScene.set(sceneNumber, sceneBlueprints);
              const panelContract = {
                ...panelContractBase,
                backgroundExtras: [
                  ...panelContractBase.backgroundExtras,
                  ...panelBackgroundExtras,
                  ...sceneBlueprint.cast.npcPresence,
                  ...sceneBlueprint.cast.backgroundSubjects,
                ].filter(Boolean).slice(0, 5),
                mustShow: [
                  ...panelContractBase.mustShow,
                  ...sceneBlueprint.environment.mustShowLocationSignals,
                  ...sceneBlueprint.environment.props,
                ].filter(Boolean).slice(0, 8),
                mustNotShow: [
                  ...panelContractBase.mustNotShow,
                  ...sceneBlueprint.constraints.hard
                    .filter((rule: string) => rule.startsWith("Avoid:"))
                    .map((rule: string) => rule.replace(/^Avoid:\s*/, "")),
                ].filter(Boolean).slice(0, 8),
                npcPresence: uniq([
                  ...(panelContractBase.npcPresence ?? []),
                  ...persistentSceneExtras.map((extra) => extra.archetypeLabel),
                ]).slice(0, 5),
                persistentSceneAnchors: uniq([
                  ...(panelContractBase.persistentSceneAnchors ?? []),
                  ...persistentSceneExtras.map((extra) => `${extra.anchorSlot}:${extra.visualSignature.outfit ?? extra.archetypeLabel}`),
                ]).slice(0, 6),
              };
              const panelCharacterPlan = buildPanelCharacterPlan({
                panelId: `${createdScene.id}:${panel.panelNumber}`,
                panel,
                sceneCharacters: scene.characters,
                shotType: panelContract.shotType,
                purpose: panelContract.purpose,
                subjectFocus: (panelContract as Record<string, unknown>).subjectFocus as string | null ?? null,
                cutawayType: (panelContract as Record<string, unknown>).cutawayType as string | null ?? null,
              });

              const bpRec = panelPremiumBlueprint as Record<string, unknown> | undefined;
              const unifiedDialogueLines = legacyScenePanelUnifiedDialogue(panel as Record<string, any>, bpRec);
              const panelMetadataId = panelPremiumBlueprint?.panelId ?? `${createdScene.id}:${panel.panelNumber}`;
              const panelTextBundleRaw = (panel as Record<string, unknown>).panelTextBundle;
              const panelTextBundleForContract =
                panelTextBundleRaw && typeof panelTextBundleRaw === "object" && !Array.isArray(panelTextBundleRaw)
                  ? (panelTextBundleRaw as {
                      dialogues?: ReadonlyArray<{ speaker: string; text: string }> | null;
                      narration?: string | null;
                      sfx?: readonly string[] | null;
                    })
                  : null;
              const persistedTextContract = resolvePanelTextContractFromStoryboardPanelLike({
                panelId: panelMetadataId,
                textContract: (panel as Record<string, unknown>).textContract,
                dialogue: unifiedDialogueLines.length > 0 ? unifiedDialogueLines : null,
                narration: panel.narration ?? null,
                sfx: Array.isArray(panel.sfx) ? panel.sfx : null,
                panelTextBundle: panelTextBundleForContract,
              });
              // Utiliser le subjectFocus POST shot-plan (panelContract) pour être aligné avec le prompt composé
              const contractSubjectFocus = (panelContract as Record<string, unknown>).subjectFocus as string | null ?? null;
              const panelCast = buildPanelCast({
                panelCharacterNames: panel.characters ?? [],
                rawCharacters: rawCharacters as any[],
                subjectFocus: contractSubjectFocus,
                speakerName: (bpRec?.speakerAnchorCharacterId as string | undefined)
                  ? rawCharacters.find((rc: any) => rc.id === bpRec?.speakerAnchorCharacterId)?.name ?? null
                  : null,
                propCarrierNames: [],
                blueprintMustShowIds: Array.isArray(bpRec?.mustShowCharacterIds)
                  ? (bpRec.mustShowCharacterIds as string[])
                  : [],
                blueprintMayShowIds: Array.isArray(bpRec?.mayShowCharacterIds)
                  ? (bpRec.mayShowCharacterIds as string[])
                  : [],
              });

              const panelIntentCard: PanelIntentCard = buildPanelIntentCard({
                purpose: panelContract.purpose,
                mood: panel.mood,
                scenePurpose: scene.purpose,
                sfx: panel.sfx ? [panel.sfx] : null,
                dialogueCount: unifiedDialogueLines.length,
                cameraShot: panel.camera,
                cameraAngle: panelContract.cameraAngle,
                // BUG-25 : passer le pageRole du beat structuré (source fiable) pour
                // éviter "establishing/setup" partout via regex sur texte libre.
                pageRole: revisedBundle.outline.beats[index]?.pageRole ?? null,
              });
              const panelSceneAnchor = sceneAnchorByIndex.get(index) ?? null;

              const combatDirection =
                (panelContract.purpose === "action" || panelIntentCard.beatEventType === "combat_turning_point" || panelIntentCard.beatEventType === "impact")
                  ? directCombatPanel({
                      beatText: `${panel.caption ?? ""} ${panel.prompt ?? ""}`,
                      scenePurpose: scene.purpose,
                      currentShotType: panelContract.shotType,
                      characterCount: panel.characters.length,
                      combatReadabilityBonus: chapterGenreConfig.combatReadabilityBonus,
                    })
                  : null;

              try {
                const promptCharacters = rawCharacters
                  .filter((c) => panel.characters.includes(c.name))
                  .map((c) => {
                    const importanceTier = resolveCharacterImportanceTier({
                      roleType: typeof c.roleType === "string" ? c.roleType : null,
                      recurrencePolicy: typeof c.recurrencePolicy === "string" ? c.recurrencePolicy : null,
                    });
                    const tierPolicy = getCharacterTierPolicy(importanceTier);
                    const promptBundle = buildCharacterPromptBundle({
                      name: c.name,
                      roleType: c.roleType,
                      biography: c.biography,
                      objective: c.objective,
                      fear: c.fear,
                      appearance: c.appearance,
                      hairColor: c.hairColor,
                      eyeColor: c.eyeColor,
                      outfitDefault: c.outfitDefault,
                      visualProfile: c.visualProfile,
                      bodyState: c.bodyState,
                      wardrobeProfile: c.wardrobeProfile,
                      speechProfile: c.speechProfile,
                      continuityProfile: c.continuityProfile,
                      traits: c.traits,
                      flaws: c.flaws,
                    });
                    const fingerprint =
                      c.characterFingerprint && typeof c.characterFingerprint === "object"
                        ? c.characterFingerprint as Record<string, unknown>
                        : null;
                    const fingerprintVisualHints = [
                      typeof fingerprint?.identity === "object" && fingerprint.identity && "gender" in fingerprint.identity
                        ? `gender lock: ${String((fingerprint.identity as Record<string, unknown>).gender ?? "")}`
                        : null,
                      typeof fingerprint?.hair === "object" && fingerprint.hair
                        ? `hair lock: ${[
                            (fingerprint.hair as Record<string, unknown>).color,
                            (fingerprint.hair as Record<string, unknown>).style,
                            (fingerprint.hair as Record<string, unknown>).length,
                          ].filter(Boolean).join(" ")}`
                        : null,
                      typeof fingerprint?.face === "object" && fingerprint.face
                        ? `face lock: ${[
                            (fingerprint.face as Record<string, unknown>).eyeColor,
                            (fingerprint.face as Record<string, unknown>).eyeShape,
                            (fingerprint.face as Record<string, unknown>).faceShape,
                          ].filter(Boolean).join(", ")}`
                        : null,
                    ].filter(Boolean).join(", ");

                    const forbiddenDrift = [
                      ...(Array.isArray(c.forbiddenVisualDrift)
                        ? (c.forbiddenVisualDrift as string[]).filter((item) => typeof item === "string")
                        : []),
                      ...promptBundle.forbiddenDriftRules,
                      ...(fingerprint && Array.isArray(fingerprint.forbiddenDrift)
                        ? fingerprint.forbiddenDrift.filter((item): item is string => typeof item === "string")
                        : []),
                    ];
                    const npcProfile = npcProfileByCharacterId.get(c.id);
                    const npcProfileMetadata =
                      npcProfile?.metadata && typeof npcProfile.metadata === "object" && !Array.isArray(npcProfile.metadata)
                        ? (npcProfile.metadata as Record<string, unknown>)
                        : {};
                    const npcVisualMemory =
                      npcProfileMetadata.visualMemory && typeof npcProfileMetadata.visualMemory === "object" && !Array.isArray(npcProfileMetadata.visualMemory)
                        ? (npcProfileMetadata.visualMemory as Record<string, unknown>)
                        : {};
                    const recurringMemory =
                      importanceTier === "RECURRING_NPC" || npcProfile?.importanceLevel === "recurring"
                        ? [
                            npcProfile?.silhouetteSignature,
                            typeof npcVisualMemory.hairFamily === "string" ? npcVisualMemory.hairFamily : null,
                            typeof npcVisualMemory.ageBand === "string" ? `age ${npcVisualMemory.ageBand}` : null,
                            npcProfile?.accessoryMarker ? `marker ${npcProfile.accessoryMarker}` : null,
                            npcProfile?.outfitSignature ? `outfit ${npcProfile.outfitSignature}` : null,
                            npcProfile?.appearanceCount ? `seen ${npcProfile.appearanceCount} times` : null,
                            c.outfitDefault,
                          ]
                            .filter(Boolean)
                            .join(", ")
                        : null;

                    const hardTraits = Array.isArray(fingerprint?.hardTraits)
                      ? (fingerprint!.hardTraits as string[]).filter((t): t is string => typeof t === "string")
                      : null;
                    const softTraits = Array.isArray(fingerprint?.softTraits)
                      ? (fingerprint!.softTraits as string[]).filter((t): t is string => typeof t === "string")
                      : null;

                    return {
                      name: c.name,
                      entityKind: c.entityKind,
                      speciesLabel: c.speciesLabel,
                      gender: c.gender,
                      appearance: c.appearance,
                      hairColor: c.hairColor,
                      eyeColor: c.eyeColor,
                      outfitDefault: c.outfitDefault,
                      canonicalImageUrl: c.canonicalImageUrl ?? null,
                      forbiddenDrift,
                      importanceTier,
                      lockStrength: tierPolicy.minimumLock,
                      continuityBudget:
                        tierPolicy.qaExpectation === "strict"
                          ? ("strict" as const)
                          : tierPolicy.qaExpectation === "light"
                            ? ("light" as const)
                            : ("none" as const),
                      recurringMemory,
                      bodyDetails: (() => {
                        // P0.15 : imports statiques (plus de `require` masquant
                        // les erreurs de chargement du module physical-events).
                        const parts: string[] = [];
                        if (c.bodyDetails) parts.push(c.bodyDetails);
                        const bodyState = loadOrCreateBodyState(c.bodyState);
                        const constraints = buildBodyStatePromptConstraints(c.name, bodyState);
                        if (constraints) parts.push(constraints);
                        return parts.length > 0 ? parts.join("; ") : null;
                      })(),
                      wardrobeDetails: (() => {
                        const baseParts: string[] = [];
                        if (c.wardrobeDetails) baseParts.push(c.wardrobeDetails);
                        const charCrossChapProps = propInventory
                          .filter((p) => p.characterId === c.id)
                          .map((p) => p.visualDescription ?? p.propCanonicalName);
                        if (charCrossChapProps.length > 0) {
                          baseParts.push(`always carries: ${charCrossChapProps.join(", ")}`);
                        }
                        const propsForChar = (panelContract.requiredPropsTyped ?? [])
                          .filter((p: { mustBeVisible?: boolean; canonicalName: string }) => p.mustBeVisible !== false)
                          .map((p: { canonicalName: string }) => p.canonicalName);
                        if (propsForChar.length > 0) {
                          baseParts.push(`carrying/wearing: ${propsForChar.join(", ")}`);
                        }
                        return baseParts.length > 0 ? baseParts.join(", ") : null;
                      })(),
                      hardTraits,
                      softTraits,
                      fingerprint: fingerprint as never,
                      visualSignatureText:
                        c.canonSignatureText ??
                        [promptBundle.visualPrompt, promptBundle.continuityPrompt, promptBundle.canonConstraintLine, fingerprintVisualHints]
                          .filter(Boolean)
                          .join(", "),
                    };
                  });

                // P4 — INTERDICTION DE composeMangaPanelPrompt EN PREMIUM V3 ONLY.
                // Si on arrive ici alors que le flag premium-only est ON, c'est
                // que le court-circuit en amont n'a pas fonctionné : on fail
                // bruyamment au lieu de produire un prompt legacy polluant.
                if (isPipelineV3PremiumOnlyEnabled()) {
                  throw new Error(
                    "premium_v3_only_violation: composeMangaPanelPrompt called in premium-only mode. " +
                    "The v3 render pipeline must be the only image generator.",
                  );
                }
                const composed = composeMangaPanelPrompt({
                  stylePack: stylePack
                    ? {
                        name: stylePack.renderFamily,
                        description: `${stylePack.lineWeight} lines, ${stylePack.shadingMode} shading, ${stylePack.contrastProfile} contrast`,
                        visualStyle: project?.visualStyle ?? null,
                        anatomyBias: stylePack.anatomyBias,
                        backgroundDensity: stylePack.backgroundDensity,
                        cameraLanguage: stylePack.cameraLanguage,
                        negativeConstraints: Array.isArray(stylePack.negativeConstraints)
                          ? (stylePack.negativeConstraints as string[])
                          : [],
                      }
                    : { visualStyle: project?.visualStyle ?? null },
                  sceneBlueprint,
                  characters: promptCharacters,
              location: scene.location,
              action: [
                sceneBlueprint.promptBridge.actionLine,
                panel.narration ?? panel.caption ?? (panel as { turn?: string }).turn ?? scene.summary.slice(0, 120),
                panelContract.mustShow.length > 0 ? `must show: ${panelContract.mustShow.join(", ")}` : "",
                panelContract.backgroundExtras.length > 0 ? `background extras: ${panelContract.backgroundExtras.join(", ")}` : "",
                combatDirection ? `combat framing: ${combatDirection.framing}. ${combatDirection.impactCue}. ${combatDirection.environmentReaction}` : "",
                romanceDirectionByScene.get(index)?.visualPromptConstraints.slice(0, 2).join(". ") ?? "",
              ].filter(Boolean).join(". "),
              camera: combatDirection ? `${panel.camera}, ${combatDirection.framing}` : panel.camera,
              mood: panel.mood,
              contentIntensityLayer: intensityLayer,
              dialogueHint: unifiedDialogueLines.length
                ? unifiedDialogueLines.slice(0, 2).map((d) => `${d.speaker}: ${d.text}`).join(" / ")
                : undefined,
              sceneContext: [
                sceneBlueprint.promptBridge.sceneContextLine,
                scene.summary,
                scene.purpose ? `purpose: ${scene.purpose}` : "",
                `panel purpose: ${panelContract.purpose}`,
                `shot: ${panelContract.shotType}`,
                panelContract.continuityFromPanelId ? "keep continuity with previous panel" : "",
              ].filter(Boolean).join(" · ").slice(0, 320),
              environmentHint: [
                sceneBlueprint.promptBridge.environmentLine,
                (() => {
                  const locationNorm = normalizeLocationName(scene.location);
                  if (!locationNorm) return null;
                  const locationRecord = knownLocations.find(
                    (loc) => {
                      const ln = normalizeLocationName(loc.name);
                      return ln === locationNorm || locationNorm.includes(ln);
                    },
                  );
                  // P0.9 : on lit d'abord la Map locale des briefs établis dans
                  // la Tx courante, puis on fallback sur la valeur DB chargée
                  // au début de la pass. Plus aucune mutation de `knownLocations`.
                  const freshBrief =
                    establishedBriefsThisTx.get(locationNorm) ?? locationRecord?.establishedVisualBrief ?? null;
                  return freshBrief && locationRecord
                    ? `ESTABLISHED VISUAL ANCHOR [${locationRecord.name}]: ${freshBrief}`
                    : null;
                })(),
                composeEnvironment({
                location: scene.location,
                mood: panel.mood,
                // BUG-21 : ne PLUS fallback sur "fantasy". Si le genre est null, on utilise
                // un fallback neutre qui ne déclenche aucun flavor thématique parasite
                // (plutôt que contaminer un projet cyberpunk avec "walled medieval city").
                genre: context.project.primaryGenre?.trim() || "generic",
                tone: context.project.tone ?? "dramatique",
                visualStyle: context.project.visualStyle ?? "manga",
                lore: typeof context.storyBible?.lore === "string" ? context.storyBible.lore : null,
                worldRules: context.storyBible?.worldRules,
                glossary: context.storyBible?.glossary,
                knownLocations: knownLocations,
                sceneCharCount: scene.characters.length,
                panelCharCount: panel.characters.length,
                sceneSummary: scene.summary,
                seed: chapterNumber * 10_000 + (index + 1) * 100 + panel.panelNumber,
                }),
                panelContract.backgroundExtras.length > 0 ? `persistent extras visible: ${panelContract.backgroundExtras.join(", ")}` : "",
                sceneBlueprint.promptBridge.hardConstraintLine,
                sceneBlueprint.promptBridge.softConstraintLine,
              ].filter(Boolean).join(", "),
              chapterLookProfile,
              sceneAnchor: panelSceneAnchor,
              intentCard: panelIntentCard,
              requiredProps: panelContract.requiredPropsTyped ?? null,
              npcPresence: (() => {
                const npcSubjectFocus = (panelContract as Record<string, unknown>).subjectFocus as string | null ?? null;
                const isFocusNpc = npcSubjectFocus === "important_npc" || npcSubjectFocus === "npc";
                const activeNpcDescriptors = npcProfiles
                  .filter(
                    (n) =>
                      typeof n.shortVisualCore === "string" &&
                      (n.importanceLevel === "recurring" || n.importanceLevel === "important"),
                  )
                  .sort((a, b) => b.appearanceCount - a.appearanceCount)
                  .slice(0, 3)
                  .map((n, npcIdx) => {
                    const parts: string[] = [];
                    if (n.shortVisualCore) parts.push(n.shortVisualCore);
                    if (n.outfitSignature) parts.push(`wearing ${n.outfitSignature}`);
                    // Premier NPC = focus si subjectFocus le demande, sinon background
                    parts.push(isFocusNpc && npcIdx === 0 ? "pnj par défaut, présence visible" : "background character");
                    return parts.join(", ");
                  });
                return activeNpcDescriptors.length > 0 ? activeNpcDescriptors : null;
              })(),
              shotType: panelContract.shotType ?? null,
              cutawayType: (panelContract as Record<string, unknown>).cutawayType as string | null ?? null,
              subjectFocus: (panelContract as Record<string, unknown>).subjectFocus as string | null ?? null,
              cameraAngle: shotPlanPanel?.cameraAngle ?? (panelContract as Record<string, unknown>).cameraAngle as string | null ?? null,
              chapterStyleAnchor: stylePack
                ? [
                    stylePack.renderFamily ?? null,
                    `${stylePack.lineWeight ?? ""} line weight`,
                    stylePack.shadingMode ?? null,
                    "manga panel style",
                  ].filter(Boolean).join(", ")
                : "manga art style, clean ink lines, screen tone shading, Japanese manga aesthetics",
              beatType: (revisedBundle.outline.beats[index]?.pageRole as string | undefined) ?? null,
            });
            composedPositive = [
              composed.positive,
              panelContract.mustNotShow.length > 0 ? `avoid showing: ${panelContract.mustNotShow.join(", ")}` : "",
            ].filter(Boolean).join(", ");
            composedNegative = composed.negative;
            promptDebug = composed.debug ?? null;
          } catch {
            // fallback sur le prompt du storyboard
          }

            // P1.4 : résoudre les characterIds à partir des noms pour que
            // le retry (P0.5) puisse matcher par ID en priorité, sans dépendre
            // des libellés (robuste au renommage et aux doublons de nom).
            const resolvedCharacterIds: string[] = [];
            for (const cname of panel.characters ?? []) {
              const match = rawCharacters.find((rc) => rc.name === cname);
              if (match?.id && !resolvedCharacterIds.includes(match.id)) {
                resolvedCharacterIds.push(match.id);
              }
            }

            const baseMetadata = {
              // Identifiants pour que le shot compliance + quality report retrouvent le blueprint
              panelId: panelMetadataId,
              beatId: panelPremiumBlueprint?.beatId ?? revisedBundle.outline.beats[index]?.id ?? null,
              caption: panel.caption,
              camera: panel.camera,
              characters: panel.characters,
              // P1.4 : IDs résolus pour robustesse retry + QA
              characterIds: resolvedCharacterIds,
              sceneId: createdScene.id,
              sceneKeyframeId: sceneKeyframe.id,
              pageNumber: storyboardPage.pageNumber,
              pagePanelCount: storyboardPage.panels.length,
              mood: panel.mood,
              combatDirection,
              textScale: panel.textScale ?? "normal",
              sfx: panel.sfx,
              dialogue: unifiedDialogueLines[0] ?? null,
              dialogues: unifiedDialogueLines,
              textContract: persistedTextContract,
              narration: panel.narration,
              layout: storyboardPage.layout,
              panelContract: (() => {
                const panelFingerprintMap: Record<string, unknown> = {};
                for (const charName of panel.characters ?? []) {
                  const raw = rawCharacters.find((rc) => rc.name === charName);
                  if (raw?.id && raw.characterFingerprint && typeof raw.characterFingerprint === "object" && Object.keys(raw.characterFingerprint as object).length > 0) {
                    panelFingerprintMap[raw.id] = raw.characterFingerprint;
                  }
                }
                // P2.1 : on injecte explicitement dans `metadata.panelContract`
                // tous les champs contractuels du blueprint premium pour que la
                // génération + QA + retry sachent exactement ce que ce panel
                // était censé respecter (arme, ennemi, PNJ, cutaway, speaker).
                const bp = panelPremiumBlueprint as Record<string, unknown> | null | undefined;
                const premiumFields = bp
                  ? {
                      subjectFocus:
                        (panelContract as Record<string, unknown>).subjectFocus
                        ?? (bp.subjectFocus as string | null | undefined)
                        ?? null,
                      cutawayType:
                        (panelContract as Record<string, unknown>).cutawayType
                        ?? (bp.cutawayType as string | null | undefined)
                        ?? "none",
                      mustShowEnemy: Boolean(bp.mustShowEnemy),
                      requiredNpcCount:
                        typeof bp.requiredNpcCount === "number" ? bp.requiredNpcCount : 0,
                      speakerAnchorCharacterId:
                        (bp.speakerAnchorCharacterId as string | null | undefined) ?? null,
                      requiredPropsTyped: Array.isArray(bp.requiredProps)
                        ? (bp.requiredProps as Array<Record<string, unknown>>).map((p) => ({
                            canonicalName: typeof p.canonicalName === "string" ? p.canonicalName : "",
                            mustBeVisible: Boolean(p.mustBeVisible),
                            narrativeRole: typeof p.narrativeRole === "string" ? p.narrativeRole : null,
                          }))
                        : [],
                      contractualCritical: Boolean(bp.contractualCritical),
                    }
                  : {
                      subjectFocus:
                        (panelContract as Record<string, unknown>).subjectFocus ?? null,
                      cutawayType:
                        (panelContract as Record<string, unknown>).cutawayType ?? "none",
                      mustShowEnemy: false,
                      requiredNpcCount: 0,
                      speakerAnchorCharacterId: null,
                      requiredPropsTyped: [],
                      contractualCritical: false,
                    };
                return Object.keys(panelFingerprintMap).length > 0
                  ? { ...panelContract, ...premiumFields, characterFingerprints: panelFingerprintMap }
                  : { ...panelContract, ...premiumFields };
              })(),
              panelCharacterPlan,
              panelCast,
              sceneBlueprint,
              effectiveCreativeControls,
              visualPriority: panelContract.purpose === "reveal" ? "critical" : panelContract.shotType === "closeup" ? "high" : "medium",
              chapterLookProfileMode: chapterLookProfile.mode,
              intentCard: panelIntentCard,
              sceneAnchor: panelSceneAnchor,
              panelDebugTrace: {
                sourceBeatId: revisedBundle.outline.beats[index]?.id ?? null,
                panelCastSummary: panelCast ? {
                  focus: panelCast.focus?.name ?? null,
                  supporting: panelCast.supporting.map((m: any) => m.name),
                  background: panelCast.background.map((m: any) => m.name),
                } : null,
                shotPlan: {
                  shotType: panelContract.shotType ?? null,
                  cameraAngle: shotPlanPanel?.cameraAngle ?? (panelContract as Record<string, unknown>).cameraAngle as string | null ?? null,
                  cutawayType: (panelContract as Record<string, unknown>).cutawayType as string | null ?? null,
                  // I04: shot plan détaillé prévu vs réalisé
                  planned: shotPlanPanel ? {
                    shotType: shotPlanPanel.shotType,
                    cameraAngle: shotPlanPanel.cameraAngle,
                    subjectFocus: shotPlanPanel.subjectFocus,
                    cutawayType: shotPlanPanel.cutawayType,
                    transitionFromPrevious: shotPlanPanel.transitionFromPrevious,
                    emphasisReason: shotPlanPanel.emphasisReason ?? null,
                  } : null,
                },
                subjectFocus: (panelContract as Record<string, unknown>).subjectFocus as string | null ?? null,
                refsUsed: [],
                lorasUsed: [],
                promptDigest: composedPositive?.slice(0, 240) ?? "",
                negativeDigest: composedNegative?.slice(0, 120) ?? "",
                entityResolutions: [],
                qualityGateResult: null,
                rerollHistory: [],
              },
              ...(objectStateTimeline.length > 0 ? {
                objectStateBeat: objectStateTimeline.filter((frame) => {
                  const beatNumMatch = frame.beatId?.match(/(\d+)/);
                  const bpBeatIndex = beatNumMatch ? parseInt(beatNumMatch[1], 10) - 1 : -1;
                  return bpBeatIndex === index;
                }),
              } : {}),
              ...(panelPremiumBlueprint ? {
                premiumBlueprint: {
                  subjectFocus: panelPremiumBlueprint.subjectFocus,
                  cutawayType: panelPremiumBlueprint.cutawayType,
                  mustShowEnemy: panelPremiumBlueprint.mustShowEnemy,
                  requiredNpcCount: panelPremiumBlueprint.requiredNpcCount,
                  speakerAnchorCharacterId: panelPremiumBlueprint.speakerAnchorCharacterId,
                  // P4.1 : flag contractualCritical propagé jusqu'à la metadata
                  contractualCritical: Boolean((panelPremiumBlueprint as unknown as Record<string, unknown>).contractualCritical),
                  requiredProps: panelPremiumBlueprint.requiredProps.map((p: any) => ({
                    canonicalName: p.canonicalName,
                    mustBeVisible: p.mustBeVisible,
                    narrativeRole: p.narrativeRole,
                  })),
                },
              } : {}),
              stylePack: stylePack
                ? {
                    renderFamily: stylePack.renderFamily,
                    lineWeight: stylePack.lineWeight,
                    shadingMode: stylePack.shadingMode,
                    contrastProfile: stylePack.contrastProfile,
                    anatomyBias: stylePack.anatomyBias,
                    backgroundDensity: stylePack.backgroundDensity,
                    cameraLanguage: stylePack.cameraLanguage,
                    negativeConstraints: Array.isArray(stylePack.negativeConstraints)
                      ? stylePack.negativeConstraints
                      : [],
                  }
                : null,
              renderMeta: {
                cropMode: panelContract.renderHints.cropMode,
                focalPoint: panelContract.renderHints.focalPoint,
                reservedTextZones: panelContract.textBoxPlan.reservedZones,
              },
              promptDebug,
              layoutMeta: {
                slotType:
                  panelContract.shotType === "wide"
                    ? "wide"
                    : panelContract.shotType === "closeup" || panelContract.shotType === "extreme_closeup"
                      ? "closeup"
                      : panelContract.purpose === "dialogue"
                        ? "dialogue"
                        : "square",
                targetAspectRatio: panelContract.renderHints.targetAspectRatio,
                layoutTemplate: storyboardPage.layout,
              },
            };

            // C05: collect image data for micro-tx write phase (after Tx B)
            pendingImageWrites.push({
              sceneId: createdScene.id,
              sceneKeyframeId: sceneKeyframe.id,
              panelNumber: panel.panelNumber,
              panel,
              composedPositive,
              composedNegative,
              baseMetadata: baseMetadata as Record<string, unknown>,
              panelCast,
              panelCanonRefs,
              sceneIndex: index,
            });
          }
        }
      },
      { timeout: 60_000, maxWait: 20_000 },
    );

    // C05: Tx C — write images in micro-transactions of 8 (scenes already committed above).
    // La logique complète vit dans `./narrative/persist-planned-images.ts` (extraction
    // isoBehaviour pour préparer le split v3 du render path sans changer le comportement).
    const persisted = await persistPlannedImages({
      pendingImageWrites,
      panelDraftSize: PANEL_DRAFT_SIZE,
    });
    plannedImages.push(...persisted);

    // P0-5 / P0.8 : Tx D — flip final "ready_for_render" UNIQUEMENT après
    // succès de Tx A + Tx B + Tx C. Garantit qu'aucun chapter marqué "ready"
    // n'existe sans scènes+images persistées (pas de rendu fantôme côté UI).
    // On set aussi `narrativeCommitId` ici : un chapitre sans commitId sera
    // considéré "stale" côté API (GET chapter), ce qui évite qu'un chapitre
    // à moitié écrit apparaisse comme lisible.
    await prisma.$transaction(async (tx) => {
      await tx.chapter.update({
        where: { id: chapterId },
        data: {
          status: "ready_for_render",
          narrativeCommitId,
        },
      });
    }, { timeout: 5_000 });

    // P0.13 : remonter au jobOutput la liste (dédupliquée) des character states
    // malformés détectés pendant la composition → affichable côté qa-report.
    if (malformedCharacterStates.length > 0) {
      try {
        await mergeJobOutput(jobId, {
          continuityWarnings: {
            missingStableName: malformedCharacterStates,
          },
        });
      } catch (mergeErr) {
        console.warn(
          `[pipeline] merge_job_output_continuity_warnings_failed: ${mergeErr instanceof Error ? mergeErr.message : mergeErr}`,
        );
      }
    }

    await setJobProgress(
      jobId,
      { key: "persist_chapter", label: "Persistance chapitre" },
      "completed",
    );

    // ── Construire et persister les scene states (continuity engine) ───────
    const continuityEngineResult = await runSceneContinuityEngine({
      chapterId,
      chapterNumber,
      projectId,
      scenes: revisedBundle.script.scenes,
      beats: revisedBundle.outline.beats,
      previousCharacterStates,
      continuityKernel,
      rawCharacters,
      sceneBlueprintsByScene,
    });
    const validatedSceneSnapshots = continuityEngineResult.validatedSceneSnapshots;
    const kernelValidationWarnings = continuityEngineResult.kernelValidationWarnings;
    continuityKernel = continuityEngineResult.continuityKernel;

    // ── Étape 3b : Index refs canon et LoRA par personnage ────────────────
    // Extrait dans ./narrative/canon-and-lora-index.ts pour lisibilité.
    const { canonRefByName, faceCloseupRefByName, loraByCharId, loraByCharName } = buildCanonAndLoraIndex({
      rawCharacters,
      loraAttachments,
    });

  return {
    context,
    revisedBundle,
    continuity,
    narrative,
    continuityKernel,
    studioSnapshot,
    productionSource,
    adultEngine,
    finalPanelBlueprints,
    plannedImages,
    chapterGenreMode,
    chapterGenreConfig,
    chapterLookProfile,
    sceneAnchorByIndex,
    romanceDirectionByScene,
    canonRefByName,
    faceCloseupRefByName,
    loraByCharId,
    loraByCharName,
    validatedSceneSnapshots,
    kernelValidationWarnings,
    effectiveCreativeControls,
  };
}

void STD_NEGATIVE;
