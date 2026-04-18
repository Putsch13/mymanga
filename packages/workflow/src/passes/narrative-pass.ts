/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  generateChapterBundle,
  composeMangaPanelPrompt,
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
  directRomanceDramaScene,
  type StoryboardPanel,
  type ProjectContextForChapter,
} from "@manga-ai-studio/ai";
import {
  getCharacterTierPolicy,
  resolveCharacterImportanceTier,
  resolveChapterLookProfile,
  enforceShotDiversity,
  type StableImageReference,
  type ChapterLookProfile,
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
import {
  buildSceneSnapshot,
  buildSceneState,
  deriveSceneEvents,
  persistSceneState,
  persistValidatedSceneContinuity,
  validateSceneSnapshotAgainstKernel,
  applySceneEventsToKernel,
} from "@manga-ai-studio/continuity";
import { buildSceneBlueprint, type SceneBlueprint } from "@manga-ai-studio/world";
import { buildPanelContract } from "../build-panel-contract";
import {
  buildPanelCharacterPlan,
  buildSceneKeyframeDraft,
  inferRequiredSceneExtras,
} from "../pipeline-scene-builder";
import { buildPanelCast } from "../build-panel-cast";
import { buildStableImageReference } from "../stable-image-refs";
import { buildCanonAndLoraIndex } from "./narrative/canon-and-lora-index";
import { buildSceneAnchorsByIndex } from "./narrative/scene-anchor-builder";
import { normalizeLocationName } from "./narrative/location-matcher";
import {
  buildChapterContextDocument,
  buildNpcMemoryContext,
} from "./narrative/chapter-context-document";
import { loadPreviousCanonStateAndKernel } from "./narrative/canon-state-loader";
import { resolveStudioBundle } from "./narrative/studio-bundle-resolver";
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
  type PipelineJobInput,
} from "../pipeline-quality";
import type { PipelineContext } from "../pipeline-types";

const STD_NEGATIVE =
  "blurry, deformed hands, extra limbs, wrong hair color, inconsistent outfit, bad anatomy, watermark, text overlay, low quality, duplicate character";
const PANEL_DRAFT_SIZE = getPremiumImageSize("PANEL_DRAFT");

type PlannedImage = {
  sceneImageId: string;
  panel: StoryboardPanel;
  sceneIndex: number;
  baseMetadata: Record<string, unknown>;
};

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
      select: { id: true, name: true, description: true, visualBrief: true, establishedVisualBrief: true },
      take: 40,
    }).catch(() => [] as Array<{ id: string; name: string; description: string | null; visualBrief?: string | null; establishedVisualBrief?: string | null }>);

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
    const bundle = await generateChapterBundle({
      chapterNumber,
      chapterTitle: chapter.title,
      userIntent: enrichedIntent || chapter.userIntent || `Continuer ${context.project.title}`,
      selectedPlotLabel,
      creativityControls: effectiveCreativeControls,
      context,
      approvedOutline: approvedOutlineForBundle,
    });
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
            select: { id: true, name: true, description: true, visualBrief: true, establishedVisualBrief: true },
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

    const knownCharNames = new Set(rawCharacters.map((c) => c.name.toLowerCase()));
    const bundleCharNames = new Set<string>();
    for (const page of revisedBundle.storyboard.pages) {
      for (const panel of page.panels) {
        for (const name of panel.characters ?? []) {
          if (name && !knownCharNames.has(name.toLowerCase())) {
            bundleCharNames.add(name);
          }
        }
      }
    }
    for (const scene of revisedBundle.script.scenes) {
      for (const name of scene.characters ?? []) {
        if (name && !knownCharNames.has(name.toLowerCase())) {
          bundleCharNames.add(name);
        }
      }
    }

    const entityRegistry = studioSnapshot?.data?.entityRegistry ?? null;
    const promotedNames = new Set<string>(
      (entityRegistry?.namedEntities ?? [])
        .filter((e: any) => e.promotionStatus === "promoted" || e.allowedRecurrence === "story_locked")
        .map((e: any) => e.name.toLowerCase()),
    );
    const temporaryNames = new Set<string>(
      [
        ...(entityRegistry?.temporaryEntities ?? []),
        ...(entityRegistry?.backgroundExtras ?? []),
      ].map((e: any) => e.name.toLowerCase()),
    );

    if (bundleCharNames.size > 0) {
      const toPromote: string[] = [];
      const toSkip: string[] = [];

      for (const pnjName of bundleCharNames) {
        const nameLower = pnjName.toLowerCase();
        if (promotedNames.has(nameLower)) {
          toPromote.push(pnjName);
        } else if (temporaryNames.has(nameLower)) {
          toSkip.push(pnjName);
        } else if (entityRegistry) {
          toSkip.push(pnjName);
        } else {
          toPromote.push(pnjName);
        }
      }

      if (toSkip.length > 0) {
        console.log(`[pipeline] npc_discipline: skipping ${toSkip.length} non-promoted entities: ${toSkip.join(", ")}`);
      }

      if (toPromote.length > 0) {
        console.log(`[pipeline] npc_promotion: creating ${toPromote.length} characters: ${toPromote.join(", ")}`);
      }

      // C04: hoist storyBible query outside the NPC loop
      const { resolveEntity } = await import("@manga-ai-studio/ai");
      const storyBibleForGlossary = await prisma.storyBible.findUnique({ where: { projectId } }).catch(() => null);
      const glossaryForEntities = Array.isArray(storyBibleForGlossary?.glossary)
        ? storyBibleForGlossary.glossary as { term: string; description?: string; visualCore?: string; entityKind?: string }[]
        : [];
      for (const pnjName of toPromote) {
        try {
          const slug = pnjName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
          const scenesWithPnj = revisedBundle.script.scenes.filter((s: any) => (s.characters ?? []).includes(pnjName));
          const contextHint = scenesWithPnj[0]?.summary?.slice(0, 200) ?? "";
          const entityProfile = await resolveEntity({
            name: pnjName,
            contextText: contextHint,
            projectId,
            glossary: glossaryForEntities,
            projectBible: storyBibleForGlossary?.summary ?? null,
          });

          // P0.12 : on force les humains / named_npc à être promus "secondary"
          // plutôt que "pnj", pour que la regex `importantNpcs` du shot plan
          // les capte correctement (elle matche /mentor|deuteragonist|secondary|…/).
          const entityRoleType = entityProfile.entityKind === "human" || entityProfile.entityKind === "named_npc"
            ? "secondary"
            : entityProfile.entityKind;

          // P0.11 : défaut `forbiddenVisualDrift = []` (plus de null muet) +
          // défauts dérivés du type d'entité pour les cas non-humains évidents.
          // Un dragon ne doit PAS dériver visage humain ou vêtements modernes.
          const defaultForbiddenDrift: string[] = (() => {
            const kind = String(entityProfile.entityKind ?? "").toLowerCase();
            if (kind === "dragon" || kind === "beast" || kind === "monster") {
              return ["human face", "human hands", "modern clothing"];
            }
            if (kind === "spirit" || kind === "ghost") {
              return ["solid body material", "casting ordinary shadow"];
            }
            if (kind === "robot" || kind === "mecha") {
              return ["organic skin", "natural hair"];
            }
            return [];
          })();

          const charData = {
              name: pnjName,
              roleType: entityRoleType,
              status: "alive",
              autoGenerated: true,
              forbiddenVisualDrift: defaultForbiddenDrift,
              appearance: [
                entityProfile.speciesLabel ? `${entityProfile.speciesLabel}` : null,
                entityProfile.typicalAppearance || null,
                entityProfile.canonicalVisualCore || null,
                scenesWithPnj[0]?.location ? `lié à ${scenesWithPnj[0].location}` : null,
              ].filter(Boolean).join(", ") || null,
              continuityProfile: {
                entityKind: entityProfile.entityKind,
                speciesLabel: entityProfile.speciesLabel,
                dialogueMode: entityProfile.dialogueMode,
                recurrencePolicy: entityProfile.recurrencePolicy,
                canonicalVisualCore: entityProfile.canonicalVisualCore,
                source: entityProfile.source,
                confidence: entityProfile.confidence,
              },
          };
          const newChar = await prisma.character.upsert({
            where: { projectId_slug: { projectId, slug } },
            create: { projectId, slug, ...charData },
            update: { autoGenerated: true, updatedAt: new Date() },
          });

          rawCharacters.push({
            id: newChar.id,
            name: pnjName,
            roleType: newChar.roleType ?? "pnj",
            objective: scenesWithPnj[0]?.summary?.slice(0, 160) ?? null,
            fear: null as string | null,
            biography: contextHint ? `PNJ introduit dans le contexte suivant : ${contextHint}` : null,
            traits: [entityProfile.typicalAppearance || "pnj récurrent"].filter(Boolean) as string[],
            flaws: [] as string[],
            gender: null as string | null,
            appearance: (newChar.appearance as string | null) ?? null,
            hairColor: null as string | null,
            eyeColor: null as string | null,
            outfitDefault: null as string | null,
            canonicalImageUrl: null as string | null,
            canonSignatureText: null as string | null,
            forbiddenVisualDrift: defaultForbiddenDrift as unknown,
            bodyDetails: null as string | null,
            wardrobeDetails: null as string | null,
            visualProfile: {} as Record<string, unknown>,
            bodyState: {} as Record<string, unknown>,
            wardrobeProfile: {} as Record<string, unknown>,
            speechProfile: {} as Record<string, unknown>,
            continuityProfile: {
              entityKind: entityProfile.entityKind,
              speciesLabel: entityProfile.speciesLabel,
              dialogueMode: entityProfile.dialogueMode,
              recurrencePolicy: entityProfile.recurrencePolicy,
              canonicalVisualCore: entityProfile.canonicalVisualCore,
              source: entityProfile.source,
              confidence: entityProfile.confidence,
              introLocation: scenesWithPnj[0]?.location ?? null,
            } as Record<string, unknown>,
            characterFingerprint: null as Record<string, unknown> | null,
            visualRefUrls: [] as string[],
            entityKind: entityProfile.entityKind,
            speciesLabel: entityProfile.speciesLabel ?? null,
            dialogueMode: entityProfile.dialogueMode,
            recurrencePolicy: entityProfile.recurrencePolicy,
          } as (typeof rawCharacters)[number]);
          knownCharNames.add(pnjName.toLowerCase());
        } catch (e) {
          console.warn(`[pipeline] PNJ creation failed for "${pnjName}":`, e instanceof Error ? e.message : e);
        }
      }
    }

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
    const romanceDirectionByScene = new Map<number, ReturnType<typeof directRomanceDramaScene>>();
    if (chapterGenreMode === "romance_shojo" || chapterGenreMode === "quiet_aftermath") {
      for (let idx = 0; idx < revisedBundle.script.scenes.length; idx++) {
        const scene = revisedBundle.script.scenes[idx];
        if (!scene) continue;
        const romanceDirection = directRomanceDramaScene({
          sceneText: scene.summary,
          involvedCharacters: scene.characters.slice(0, 3),
          currentTensionLevel: 40 + idx * 8,
        });
        romanceDirectionByScene.set(idx, romanceDirection);
      }
    }

    console.log(
      `[pipeline] genre_director mode=${chapterGenreMode} rhythm=${chapterGenreConfig.beatRhythm} panelDensity=${chapterGenreConfig.panelDensity} romance_scenes=${romanceDirectionByScene.size}`,
    );

    let finalPanelBlueprints = effectivePanelBlueprints;

    if (finalPanelBlueprints.length === 0 && revisedBundle.outline.beats.length > 0) {
      console.log(`[pipeline] b3-1 generating panel blueprints dynamically for ${revisedBundle.outline.beats.length} beats`);
      const { buildPanelBlueprintsFromBeat, inferNarrativeFactsFromBeat, inferRequiredPropsFromBeat } = await import("@manga-ai-studio/ai");
      const heroCharacterId = rawCharacters.find((c) => /hero|protagon|main/i.test(c.roleType ?? ""))?.id ?? null;
      const knownUniverseTypes = ["ninja","cyberpunk","post_apo","school_life","mecha","fantasy","military","medical","urban","generic"] as const;
      type UniverseType = (typeof knownUniverseTypes)[number];
      const rawGenre = context.project.primaryGenre ?? "";
      const universeType: UniverseType | undefined = (knownUniverseTypes as readonly string[]).includes(rawGenre)
        ? (rawGenre as UniverseType)
        : undefined;
      const blueprintContext = {
        // BUG-06 fix : heroCharacterId est réintroduit dans le blueprintContext.
        // L'intention I05 originelle (« builder must not know the hero ») tombait en
        // contradiction silencieuse : le fallback mayShowCharacterIds pushait quand
        // même le héros via beat.involvedCharacters[0]. On le passe explicitement,
        // charge au builder de ne PAS le "must-show" en dehors du focus === "hero".
        heroCharacterId,
        chapterNumber,
        projectGenre: context.project.primaryGenre ?? undefined,
        projectTone: context.project.tone ?? undefined,
        antagonistNames: rawCharacters
          .filter((c) => c.roleType === "antagonist" || c.roleType === "villain" || c.roleType === "rival")
          .map((c) => c.name),
        antagonistIds: rawCharacters
          .filter((c) => c.roleType === "antagonist" || c.roleType === "villain" || c.roleType === "rival")
          .map((c) => c.id),
      };
      const narrativeCtx = {
        projectGenre: context.project.primaryGenre ?? null,
        projectTone: context.project.tone ?? null,
        heroCharacterId,
        universeType,
        antagonistIds: rawCharacters
          .filter((c) => c.roleType === "antagonist" || c.roleType === "villain" || c.roleType === "rival")
          .map((c) => c.id),
        antagonistNames: rawCharacters
          .filter((c) => c.roleType === "antagonist" || c.roleType === "villain" || c.roleType === "rival")
          .map((c) => c.name),
      };
      let pageCounter = 1;
      let panelCounter = 1;
      let usedLlmEnrichment = false;
      const allDynamicBlueprints: typeof finalPanelBlueprints = [];

      for (const beat of revisedBundle.outline.beats) {
        try {
          const productionBeat = {
            beatId: beat.id,
            summary: beat.summary,
            narrativeFunction: beat.pageRole ?? beat.purpose,
            whyThisBeatExists: beat.summary,
            dramaticChange: beat.turn ?? beat.purpose,
            involvedCharacters: beat.characters,
            activeCanonConstraints: [] as string[],
            environmentContext: [beat.location],
            visualPriority: "high" as const,
            estimatedPanels: 4,
            criticality: (beat.pageRole === "cliffhanger" || beat.pageRole === "revelation" ? "critical" : "medium") as "critical" | "medium",
            continuityDependencies: [] as string[],
            infoGained: null,
            emotionProduced: null,
            indispensabilityScore: 72,
            redundancyRisk: 18,
          };

          // Step 1: heuristic facts
          const facts = inferNarrativeFactsFromBeat(productionBeat, narrativeCtx);

          // Step 2: semantic enrichment
          const { inferAdditionalFactsFromSemantics, mergeNarrativeFacts } = await import("@manga-ai-studio/ai");
          const semanticFacts = inferAdditionalFactsFromSemantics(productionBeat, facts);
          const factsWithSemantics = semanticFacts.length > 0
            ? mergeNarrativeFacts(facts, semanticFacts)
            : facts;

          if (semanticFacts.length > 0) {
            console.log(`[pipeline:semantic-facts] beat=${productionBeat.beatId} +${semanticFacts.length} facts from semantics`);
          }

          // Step 3: LLM enrichment — systématique, pas conditionnel
          let finalFacts = factsWithSemantics;
          try {
            const { enrichNarrativeFactsWithLLM } = await import("@manga-ai-studio/ai");
            const llmFacts = await enrichNarrativeFactsWithLLM(
              productionBeat,
              factsWithSemantics,
              { ...narrativeCtx, universeType },
            );
            if (llmFacts && llmFacts.length > 0) {
              finalFacts = mergeNarrativeFacts(factsWithSemantics, llmFacts);
              usedLlmEnrichment = true;
              console.log(`[pipeline:llm-facts] beat=${productionBeat.beatId} +${llmFacts.length} facts from LLM`);
            }
          } catch {
            console.warn(`[pipeline:llm-facts] LLM enrichment failed for beat=${productionBeat.beatId}, using heuristic facts`);
          }

          // Step 4: props
          const props = inferRequiredPropsFromBeat(productionBeat, finalFacts, {
            universeType,
            projectGenre: context.project.primaryGenre ?? undefined,
            projectTone: context.project.tone ?? undefined,
            // I05: heroCharacterId intentionally omitted
          });

          // Step 5: blueprints
          const beatBlueprints = buildPanelBlueprintsFromBeat(
            productionBeat,
            finalFacts,
            props,
            blueprintContext,
            pageCounter,
            panelCounter,
          );
          allDynamicBlueprints.push(...beatBlueprints);
          pageCounter += Math.ceil(beatBlueprints.length / 3);
          panelCounter += beatBlueprints.length;

          // Step 6: persist props
          const propsToSave = props.filter((p: { mustBeVisible?: boolean; narrativeRole?: string | null }) =>
            p.mustBeVisible !== false &&
            (p.narrativeRole === "action_tool" || p.narrativeRole === "payoff" || p.narrativeRole === "threat"),
          );
          if (propsToSave.length > 0) {
            const firstInvolved = productionBeat.involvedCharacters?.[0];
            const carrierCharId = firstInvolved
              ? rawCharacters.find((rc: any) => rc.name === firstInvolved)?.id ?? null
              : null;
            if (!carrierCharId && firstInvolved) {
              console.warn(`[pipeline] prop carrier "${firstInvolved}" not found in rawCharacters — props not persisted`);
            }
            if (carrierCharId) {
              await Promise.allSettled(
                propsToSave.map((prop: { canonicalName: string; category?: string; narrativeRole?: string | null }) =>
                  prisma.characterPropInventory.upsert({
                    where: {
                      characterId_propCanonicalName: {
                        characterId: carrierCharId,
                        propCanonicalName: prop.canonicalName,
                      },
                    },
                    create: {
                      characterId: carrierCharId,
                      projectId,
                      propCanonicalName: prop.canonicalName,
                      propCategory: prop.category ?? "unknown",
                      propNarrativeRole: prop.narrativeRole ?? null,
                      acquiredAtChapterId: chapterId,
                      isActive: true,
                    },
                    update: { isActive: true },
                  }),
                ),
              );
            }
          }
        } catch (beatErr) {
          const msg = beatErr instanceof Error ? beatErr.message : "beat_blueprint_error";
          console.warn(`[pipeline] blueprint generation failed for beat=${beat.id}: ${msg}`);
          orphanedBeatIds.push(beat.id);
        }
      }

      if (allDynamicBlueprints.length > 0) {
        // BUG-01 fix : expandBlueprintsToMinimum pour garantir 70-75 panels / chapitre.
        // Sans cet appel, un chapitre ~10 beats produisait ~30 blueprints → 30 SceneImage.
        const { expandBlueprintsToMinimum } = await import("@manga-ai-studio/ai");
        const panelDensity = (chapterGenreConfig as { panelDensity?: string }).panelDensity;
        const TARGET_PANELS = panelDensity === "dense" ? 75 : 70;
        const beforeExpand = allDynamicBlueprints.length;
        const expanded = expandBlueprintsToMinimum(allDynamicBlueprints, TARGET_PANELS);
        if (expanded.length > beforeExpand) {
          console.log(
            `[pipeline] expanded ${beforeExpand} → ${expanded.length} blueprints (target=${TARGET_PANELS}, density=${panelDensity ?? "n/a"})`,
          );
          blueprintSource = usedLlmEnrichment ? "dynamic_llm_expanded" : "dynamic_heuristic_expanded";
        } else {
          blueprintSource = usedLlmEnrichment ? "dynamic_llm" : "dynamic_heuristic";
        }

        // BUG-05 fix (affiné) : renumérotation groupée par beatId.
        // Avant : pageCounter dérivait en +Math.ceil(n/3) → pages 1,3,6,9… et
        //         findPanelBlueprint strat 1 (pageNumber === sceneIndex+1) échouait.
        // Tentative initiale : pageNumber = idx+1 global → cassait aussi strat 1
        //         (une scène a N panels, pas 1).
        // Correct : pageNumber = index du beat (1..K), panelNumber = position dans le beat.
        //         Les panels d'enrichissement (expansion) héritent du beatId via {...seed, ...}
        //         et s'insèrent donc dans le bon groupe.
        const orderedBeatIds: string[] = [];
        const beatPanelCounters = new Map<string, number>();
        expanded.forEach((bp, idx) => {
          const key = bp.beatId ?? `__unknown_${idx}`;
          if (!beatPanelCounters.has(key)) {
            beatPanelCounters.set(key, 0);
            orderedBeatIds.push(key);
          }
          const nextPanel = (beatPanelCounters.get(key) ?? 0) + 1;
          beatPanelCounters.set(key, nextPanel);
          bp.pageNumber = orderedBeatIds.indexOf(key) + 1;
          bp.panelNumber = nextPanel;
          bp.panelIndex = idx;
        });

        finalPanelBlueprints = expanded;

        console.log(`[pipeline] b3-1 generated ${finalPanelBlueprints.length} blueprints dynamically (source=${blueprintSource})`);
        if (orphanedBeatIds.length > 0) {
          console.warn(`[pipeline] partial_success: ${orphanedBeatIds.length} beats orphaned: ${orphanedBeatIds.join(", ")}`);
        }
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

    // T07: Chapter ShotPlan — plan de coupe bout en bout
    try {
      const { directShotPlan } = await import("@manga-ai-studio/ai");
      const antagonists = rawCharacters
        .filter((c: any) => /antagonist|villain|rival/i.test(c.roleType ?? ""))
        .map((c: any) => ({ characterId: c.id, name: c.name, role: "antagonist" as const }));
      const heroes = rawCharacters
        .filter((c: any) => /hero|protagon|main/i.test(c.roleType ?? ""))
        .map((c: any) => ({ characterId: c.id, name: c.name, role: "hero" as const }));
      // Inclut tous les PNJ importants et récurrents (pas seulement mentor/deuteragonist)
      // firstAppearanceSceneIndex = index du premier beat où ce personnage est cité (pas l'index tableau)
      const beats = revisedBundle.outline.beats as Array<{ id: string; characters?: string[] }>;
      importantNpcs = rawCharacters
        .filter((c: any) => /mentor|deuteragonist|secondary|important|recurring/i.test(c.roleType ?? ""))
        .map((c: any) => {
          const firstName = (c.name as string).toLowerCase().split(/\s/)[0] ?? "";
          const firstBeatIdx = beats.findIndex((b) =>
            (b.characters ?? []).some((bc) => bc.toLowerCase().includes(firstName)),
          );
          return {
            characterId: c.id as string,
            name: c.name as string,
            role: "important_npc" as const,
            firstAppearanceSceneIndex: firstBeatIdx >= 0 ? firstBeatIdx : 0,
          };
        });

      chapterShotPlan = directShotPlan({
        beats: revisedBundle.outline.beats.map((b: any) => ({
          id: b.id,
          pageRole: b.pageRole ?? b.purpose,
          characters: b.characters,
          location: b.location,
          summary: b.summary,
        })),
        genreMode: chapterGenreMode,
        importantCharacters: [...heroes, ...antagonists, ...importantNpcs],
      });
      console.log(`[pipeline:shot-plan] pages=${chapterShotPlan.pages.length} rhythm=${chapterShotPlan.rhythm} emphasis=${chapterShotPlan.emphasis.length}`);
    } catch (shotPlanErr) {
      console.warn(`[pipeline:shot-plan] directShotPlan failed, attempting heuristic fallback: ${shotPlanErr instanceof Error ? shotPlanErr.message : shotPlanErr}`);
      try {
        const { directShotPlan: fallbackShotPlan } = await import("@manga-ai-studio/ai");
        chapterShotPlan = fallbackShotPlan({
          beats: revisedBundle.outline.beats.map((b: any) => ({
            id: b.id,
            pageRole: b.pageRole ?? "standard",
            characters: b.characters ?? [],
            location: b.location,
            summary: b.summary ?? "",
          })),
          genreMode: "standard",
          importantCharacters: [],
        });
        console.log(`[pipeline:shot-plan] heuristic fallback OK: pages=${chapterShotPlan.pages.length} rhythm=${chapterShotPlan.rhythm}`);
      } catch (fallbackErr) {
        console.error(`[pipeline:shot-plan] CRITICAL: both directShotPlan and heuristic fallback failed: ${fallbackErr instanceof Error ? fallbackErr.message : fallbackErr}`);
      }
    }

    // P0.16 : fail loud si shot plan toujours manquant après les deux
    // fallbacks. On ne throw pas (le pipeline peut encore générer sans),
    // mais on remonte clairement le mode dégradé via jobProgress + les
    // diagnostics, pour que la QA sache que la cohérence hero/NPC/décor
    // n'est plus garantie pour ce chapitre.
    if (!chapterShotPlan) {
      try {
        await setJobProgress(jobId, { key: "shot_plan", label: "shot_plan", detail: "failed_both_providers" }, "failed");
      } catch { /* non-blocking */ }
      try {
        const degraded = revisedBundle.generationDiagnostics.degradedModes ?? [];
        if (!degraded.includes("shot_plan_missing")) degraded.push("shot_plan_missing");
        (revisedBundle.generationDiagnostics as { degradedModes?: string[] }).degradedModes = degraded;
        (revisedBundle.generationDiagnostics as { operationalStatus?: string }).operationalStatus =
          "DEGRADED_SHOT_PLAN_MISSING";
      } catch { /* shape mismatch non-blocking */ }
    }

    const plannedImages: PlannedImage[] = [];
    const sceneBlueprintsByScene = new Map<number, SceneBlueprint[]>();

    // C05: collect computed image data outside transactions for micro-tx writes
    interface PendingImageWrite {
      sceneId: string;
      sceneKeyframeId: string;
      panelNumber: number;
      panel: typeof revisedBundle.storyboard.pages[0]["panels"][0];
      composedPositive: string | undefined;
      composedNegative: string | undefined;
      baseMetadata: Record<string, unknown>;
      panelCast: unknown;
      panelCanonRefs: string[];
      sceneIndex: number;
    }
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

          const persistentSceneExtras = await ensureSceneExtras(tx, {
            sceneId: createdScene.id,
            locationName: scene.location,
            projectId,
            requiredExtras: inferRequiredSceneExtras(scene),
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
                npcNames: persistentSceneExtras.map((extra) => extra.archetype),
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
                backgroundExtras: persistentSceneExtras.map((extra) => `${extra.archetype}:${extra.anchorSlot}`),
              },
              controls: effectiveCreativeControls,
              continuity: {
                anchors: persistentSceneExtras.map((extra) => `${extra.anchorSlot}:${extra.archetype}`),
                worldRules: [],
                styleRules: [],
                loreConstraints: [],
              },
            }),
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

              // C02: Appliquer le ShotPlan per-panel au panelContractBase
              const shotPlanPage = chapterShotPlan?.pages.find((p) => p.pageNumber === index + 1);
              const shotPlanPanel = shotPlanPage?.panels.find((sp) => sp.panelNumber === panel.panelNumber);
              if (shotPlanPanel) {
                panelContractBase.shotType = shotPlanPanel.shotType as typeof panelContractBase.shotType;
                (panelContractBase as any).cameraAngle = shotPlanPanel.cameraAngle;
                (panelContractBase as any).subjectFocus = shotPlanPanel.subjectFocus;
                (panelContractBase as any).cutawayType = shotPlanPanel.cutawayType;
                (panelContractBase as any).heroCenterAllowed = shotPlanPanel.heroCenterAllowed;

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
                ...persistentSceneExtras.map((extra) => `${extra.archetype}:${extra.anchorSlot}`),
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
                    ...persistentSceneExtras.map((extra) => extra.archetype),
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
              });
              const sceneBlueprints = sceneBlueprintsByScene.get(index) ?? [];
              sceneBlueprints.push(sceneBlueprint);
              sceneBlueprintsByScene.set(index, sceneBlueprints);
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
                  ...persistentSceneExtras.map((extra) => extra.archetype),
                ]).slice(0, 5),
                persistentSceneAnchors: uniq([
                  ...(panelContractBase.persistentSceneAnchors ?? []),
                  ...persistentSceneExtras.map((extra) => `${extra.anchorSlot}:${extra.visualSignature.outfit ?? extra.archetype}`),
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
                dialogueCount: (panel.dialogues?.length ?? 0) + (panel.dialogue ? 1 : 0),
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
              dialogueHint: panel.dialogues?.length
                ? panel.dialogues.slice(0, 2).map((d: any) => `${d.speaker}: ${d.text}`).join(" / ")
                : panel.dialogue ? `${panel.dialogue.speaker}: ${panel.dialogue.text}` : undefined,
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
              panelId: panelPremiumBlueprint?.panelId ?? `${createdScene.id}:${panel.panelNumber}`,
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
              dialogue: panel.dialogue,
              dialogues: panel.dialogues,
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
                return Object.keys(panelFingerprintMap).length > 0
                  ? { ...panelContract, characterFingerprints: panelFingerprintMap }
                  : panelContract;
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

    // C05: Tx C — write images in micro-transactions of 8 (scenes already committed above)
    for (let imgBatch = 0; imgBatch < pendingImageWrites.length; imgBatch += 8) {
      const imgSlice = pendingImageWrites.slice(imgBatch, imgBatch + 8);
      await prisma.$transaction(async (tx) => {
        for (const pi of imgSlice) {
          const panelDebugTraceData = (pi.baseMetadata as Record<string, unknown>).panelDebugTrace ?? null;
          const imageData = {
            renderingMode: "PANEL_DRAFT" as const,
            sceneKeyframeId: pi.sceneKeyframeId,
            prompt: pi.composedPositive,
            negativePrompt: pi.composedNegative,
            status: "planned",
            width: PANEL_DRAFT_SIZE.width,
            height: PANEL_DRAFT_SIZE.height,
            referenceImageIds: pi.panelCanonRefs as unknown as Prisma.InputJsonValue,
            metadata: pi.baseMetadata as unknown as Prisma.InputJsonValue,
            panelCast: pi.panelCast as unknown as Prisma.InputJsonValue,
            debugTrace: (panelDebugTraceData ?? null) as unknown as Prisma.InputJsonValue,
          };

          const existingImage = await tx.sceneImage.findUnique({
            where: { sceneId_panelNumber: { sceneId: pi.sceneId, panelNumber: pi.panelNumber } },
            select: { id: true, userValidatedAt: true },
          });

          let created: { id: string };
          if (existingImage?.userValidatedAt) {
            created = existingImage;
            await tx.sceneImage.update({
              where: { id: existingImage.id },
              data: {
                metadata: pi.baseMetadata as unknown as Prisma.InputJsonValue,
                panelCast: pi.panelCast as unknown as Prisma.InputJsonValue,
                debugTrace: (panelDebugTraceData ?? null) as unknown as Prisma.InputJsonValue,
              },
            });
          } else {
            created = await tx.sceneImage.upsert({
              where: { sceneId_panelNumber: { sceneId: pi.sceneId, panelNumber: pi.panelNumber } },
              create: { sceneId: pi.sceneId, panelNumber: pi.panelNumber, ...imageData },
              update: imageData,
            });
          }

          plannedImages.push({
            sceneImageId: created.id,
            panel: { ...pi.panel, prompt: pi.composedPositive ?? pi.panel.prompt, negativePrompt: pi.composedNegative ?? pi.panel.negativePrompt },
            sceneIndex: pi.sceneIndex,
            baseMetadata: pi.baseMetadata,
          });
        }
      }, { timeout: 15_000 });
    }

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
    console.log(`[pipeline] Building scene states for ${revisedBundle.script.scenes.length} scenes`);
    const validatedSceneSnapshots = [];
    const kernelValidationWarnings: string[] = [];
    for (let index = 0; index < revisedBundle.script.scenes.length; index++) {
      const scene = revisedBundle.script.scenes[index];
      if (!scene) continue;

      const beat = revisedBundle.outline.beats[index];
      const sceneDbRecord = await prisma.chapterScene.findFirst({
        where: { chapterId, sceneNumber: index + 1 },
      });

      if (sceneDbRecord) {
        const sceneStateData = await buildSceneState(prisma, {
          projectId,
          chapterId,
          sceneId: sceneDbRecord.id,
          sceneNumber: index + 1,
          scene: {
            title: scene.title,
            summary: scene.summary,
            location: scene.location,
            characters: scene.characters,
            beat: {
              location: beat?.location,
              characters: beat?.characters,
              turn: (beat as { turn?: string })?.turn,
            },
          },
          characterStatesFromCanon: previousCharacterStates,
        });

        await persistSceneState(prisma, {
          projectId,
          chapterId,
          sceneId: sceneDbRecord.id,
          sceneNumber: index + 1,
          sceneStateData,
        });

        // F03/F04: Physical events detection & body state persistence
        try {
          const { detectPhysicalEvents, applyPhysicalEvents, loadOrCreateBodyState } = await import("@manga-ai-studio/ai");
          const sceneText = [scene.summary, ...(scene.dialogue ?? []).map((d: any) => d.text ?? d.line ?? "")].filter(Boolean).join(" ");
          for (const charName of (scene.characters ?? [])) {
            const charRecord = rawCharacters.find((c: any) => c.name === charName);
            if (!charRecord) continue;
            const events = detectPhysicalEvents(sceneText, charName, chapterId, sceneDbRecord.id);
            if (events.length > 0) {
              const currentBodyState = loadOrCreateBodyState(charRecord.bodyState);
              const updatedBodyState = applyPhysicalEvents(currentBodyState, events);
              await prisma.character.update({
                where: { id: charRecord.id },
                data: { bodyState: updatedBodyState as any },
              });
              charRecord.bodyState = updatedBodyState as any;
              console.log(`[pipeline:physical-events] ${charName}: ${events.map(e => `${e.type}(${e.bodyPart})`).join(", ")}`);
            }
          }
        } catch (physErr) {
          console.warn(`[pipeline:physical-events] detection failed (non-blocking): ${physErr instanceof Error ? physErr.message : physErr}`);
        }

        const sceneSnapshot = buildSceneSnapshot({
          kernel: continuityKernel,
          chapterId,
          chapterNumber,
          sceneId: sceneDbRecord.id,
          sceneNumber: index + 1,
          title: scene.title,
          summary: scene.summary,
          dramaticGoal: sceneStateData.dramaticGoal,
          location: scene.location,
          sceneStateData,
          sceneBlueprints: sceneBlueprintsByScene.get(index) ?? [],
          continuityPayload: scene.continuityPayload,
          participantNames: scene.characters,
        });
        const continuityValidation = validateSceneSnapshotAgainstKernel({
          kernel: continuityKernel,
          sceneSnapshot,
        });
        const sceneEvents = continuityValidation.accepted
          ? deriveSceneEvents({ kernel: continuityKernel, sceneSnapshot })
          : [];
        if (continuityValidation.issues.length > 0) {
          console.warn(
            `[continuity-kernel] scene=${sceneDbRecord.id} accepted=${continuityValidation.accepted} issues=${continuityValidation.issues.map((issue: any) => issue.message).join(" | ")}`,
          );
        }
        kernelValidationWarnings.push(
          ...continuityValidation.issues.map((issue: any) => issue.message),
          ...continuityValidation.warnings,
        );
        const sceneMeta = asRecord(sceneDbRecord.metadata);
        await prisma.chapterScene.update({
          where: { id: sceneDbRecord.id },
          data: {
            metadata: ({
              ...sceneMeta,
              sceneSnapshot,
              continuityValidation,
            } as unknown) as Prisma.InputJsonValue,
          },
        });
        if (continuityValidation.accepted) {
          await persistValidatedSceneContinuity(prisma, {
            projectId,
            chapterId,
            chapterNumber,
            sceneId: sceneDbRecord.id,
            sceneNumber: index + 1,
            sceneSnapshot,
            validation: continuityValidation,
            events: sceneEvents,
          });
          continuityKernel = applySceneEventsToKernel(continuityKernel, sceneSnapshot, sceneEvents);
        }
        validatedSceneSnapshots.push(sceneSnapshot);
      }
    }

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
