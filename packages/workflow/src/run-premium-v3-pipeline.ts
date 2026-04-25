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
  resolveProductionOutlineForPremiumPipeline,
  type CanonicalChapterProductionPlan,
  type PanelBlueprintPremium,
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
import { loadLocationsForV3StoryPass, type PremiumV3PipelineLocation } from "./load-locations-for-v3-story-pass";
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
import { runNarrativeContractQa } from "./passes/beat-narrative-contract";
import { repairStoryboardVisualCoverage } from "./passes/repair-storyboard-visual-coverage";
import {
  assertPremiumVisualQaConfig,
  getPremiumVisualQaConfigStatus,
  isPremiumVisualQaStrictlyRequired,
} from "./passes/assert-premium-visual-qa-config";

export type { PremiumV3PipelineLocation } from "./load-locations-for-v3-story-pass";

export interface PremiumV3PipelineCharacter {
  id: string;
  name: string;
  roleType?: string | null;
  hairColor?: string | null;
  eyeColor?: string | null;
  canonSignatureText?: string | null;
  forbiddenVisualDrift?: string[] | null;
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
  chapterLocationName?: string | null;
  /** Répliques du chapitre précédent (normalisées) — alimente le dialoguiste scène si activé. */
  priorChapterDialogueSnippets?: string[] | null;
  /** Studio : forcer le dialoguiste scène pour ce run (cumulable avec OPENAI_SCENE_DIALOGUE_ENRICH). */
  sceneDialogueEnrich?: boolean;
}

export interface RunPremiumV3PipelineResult {
  v3RenderSucceeded: boolean;
}

function assertPremiumOnlyV3Config(input: Pick<RunPremiumV3PipelineInput, "pipelineV3Enabled" | "premiumV3OnlyEnabled">) {
  if (input.premiumV3OnlyEnabled && !input.pipelineV3Enabled) {
    throw new Error(
      "premium_v3_only_misconfigured: PIPELINE_V3_PREMIUM_ONLY=true mais PIPELINE_V3_STORYBOARD=false. " +
        "Le premium-only interdit toute exécution legacy : active la v3 ou désactive PREMIUM_ONLY.",
    );
  }
  if (input.premiumV3OnlyEnabled && !isPipelineV3RenderFalEnabled()) {
    throw new Error(
      "premium_v3_only_misconfigured: PIPELINE_V3_PREMIUM_ONLY=true impose PIPELINE_V3_RENDER_FAL=true. " +
        "Le render-pass v3 doit générer et persister les images ; aucun fallback legacy n'est autorisé.",
    );
  }
}

function resolveProjectFormat(project: Record<string, unknown> | null, projectId: string): "manga" | "webtoon" {
  const projectFormatRaw = typeof project?.format === "string" ? project.format : null;
  const projectFormat: "manga" | "webtoon" = projectFormatRaw === "webtoon" ? "webtoon" : "manga";
  if (projectFormatRaw !== "manga" && projectFormatRaw !== "webtoon") {
    console.warn(
      `[pipeline:v3:storyboard] project_format_fallback raw=${projectFormatRaw ?? "null"} → manga (projectId=${projectId})`,
    );
  }
  return projectFormat;
}

async function resolveLocationsForStoryPass(
  input: RunPremiumV3PipelineInput,
): Promise<PremiumV3PipelineLocation[]> {
  let resolved = Array.isArray(input.locations) && input.locations.length > 0 ? [...input.locations] : [];
  if (resolved.length === 0 && Array.isArray(input.locationIds) && input.locationIds.length > 0) {
    resolved = await loadLocationsForV3StoryPass({
      projectId: input.projectId,
      locationIds: input.locationIds,
    });
  }
  if (
    resolved.length === 0
    && typeof input.chapterLocationName === "string"
    && input.chapterLocationName.trim().length > 0
  ) {
    resolved = [
      {
        id: `chapter-primary:${input.chapterId}`,
        name: input.chapterLocationName.trim(),
        visualDNA: { source: "chapter_location_field" },
      },
    ];
  }
  if (resolved.length > 0) {
    const locationSource =
      input.locations?.length ? "input"
      : input.locationIds?.length ? "locationIds"
      : "chapterLocationName";
    console.info(
      `[pipeline:v3:locations] chapterId=${input.chapterId} count=${resolved.length} source=${locationSource}`,
    );
  }
  return resolved;
}

export function hasApprovedPlanDrivenInput(input: RunPremiumV3PipelineInput): boolean {
  const plan = input.productionPlan as Record<string, unknown> | null | undefined;
  return Boolean(
    plan
    && Array.isArray(plan.panelBlueprints)
    && plan.panelBlueprints.length > 0,
  );
}

export async function runPremiumV3Pipeline(
  input: RunPremiumV3PipelineInput,
): Promise<RunPremiumV3PipelineResult> {
  assertPremiumOnlyV3Config(input);
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
  if (!input.pipelineV3Enabled) {
    return { v3RenderSucceeded };
  }

  const pipelineStartMs = Date.now();
  const timings: Record<string, number> = {};

  try {
    const approvedPlanDriven = hasApprovedPlanDrivenInput(input);
    const projectFormat = resolveProjectFormat(input.project, input.projectId);
    const resolvedProductionOutline = resolveProductionOutlineForPremiumPipeline({
      approvedOutlineRaw: input.approvedOutline ?? null,
      productionPlanRaw: input.productionPlan ?? null,
      chapterSummary: input.chapterSummary,
      cliffhangerOverride: null,
    });
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
        const derivedBlueprints = canonicalPlanToPanelBlueprints(canonicalRuntimePlan);
        panelBlueprintsForPremiumPath = derivedBlueprints;
        if (productionPlanForStoryboard) {
          productionPlanForStoryboard.panelBlueprints = derivedBlueprints;
        }
        console.info(
          `[pipeline:v3:canonical-runtime] panels=${derivedBlueprints.length} qa_valid=${canonicalRuntimePlan.qa.valid}`,
        );
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
          focusCharacterIds: input.focusCharacterIds,
          heroCharacterId: input.heroCharacterId ?? null,
          activeCreatureIds: input.activeCreatureIds,
        });

        const rebal = rebalancePremiumBlueprintsForManga({
          blueprints: workingBlueprints,
          visualEntities,
          projectFormat: "manga",
          maxCutawayRatio: mangaMaxCutawayRatio,
          minActorDrivenRatio: mangaMinActorDrivenRatio,
          fallbackHeroId: input.heroCharacterId ?? input.focusCharacterIds[0] ?? null,
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
          forceSceneDialogueEnrich: input.sceneDialogueEnrich === true,
        });
        if (sceneDialogue.linesWritten > 0 || sceneDialogue.warnings.length > 0) {
          console.info(
            `[pipeline:v3:scene-dialogue] beatsTouched=${sceneDialogue.beatsTouched} linesWritten=${sceneDialogue.linesWritten} warnings=${sceneDialogue.warnings.join(";") || "none"}`,
          );
        }

        ensureDialogueBeatsHaveAnchors({
          blueprints: rebal.blueprints,
          visualEntities,
          fallbackHeroId: input.heroCharacterId ?? input.focusCharacterIds[0] ?? null,
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
            console.warn(
              `[pipeline:v3:narrative-contract] violations=${narrativeQa.violations.length} ` +
                `first=${narrativeQa.violations[0]?.type}:${narrativeQa.violations[0]?.expected}`,
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

      const deterministicPlan = canonicalRuntimePlan
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
        locations: locationsForStory.map((l) => ({ id: l.id, name: l.name })),
      });
      timings.story_pass_ms = Date.now() - storyStart;
      storyArc = storyPassResult.storyArc;
      if (storyPassResult.warnings.length > 0) {
        console.warn(
          `[pipeline:v3:story] warnings=${storyPassResult.warnings.join(" | ")}`,
        );
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
              }),
              warnings: ["storyboard_plan.source=premium_production_plan"],
              blockers: [],
            }
          : await runStoryboardPass({
              storyArc: storyPassResult.storyArc,
              heroCharacterIds: input.focusCharacterIds,
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
    const parasitePolicy = visualContractUi.parasitePolicy ?? "auto_strip";
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
          parasitePolicy: "keep_all",
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
      if (parasitePolicy === "keep_all") {
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
      focusCharacterIds: input.focusCharacterIds,
      heroCharacterId: input.heroCharacterId ?? null,
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
      const visualMemoryResult = await loadChapterVisualMemory({
        chapterId: input.chapterId,
        projectId: input.projectId,
        mainCharacterIds: input.focusCharacterIds,
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

      const mainCharacterNames = input.rawCharacters
        .filter((c) => input.focusCharacterIds.includes(c.id) || c.id === input.heroCharacterId)
        .map((c) => c.name);

      runPreRenderPremiumQaOrThrow({
        storyboardPlan: storyboardPassResult.storyboardPlan,
        chapterSummary: input.chapterSummary,
        chapterUserIntent: input.chapterUserIntent,
        chapterLocationName: input.chapterLocationName,
        mainCharacterNames,
      });
      await saveStoryboardPlan(input.chapterId, storyboardPassResult.storyboardPlan);

      const renderFalEnabled = isPipelineV3RenderFalEnabled();
      console.log(
        `[pipeline:v3:render] fal_real_enabled=${renderFalEnabled} (flag PIPELINE_V3_RENDER_FAL)`,
      );
      const renderStart = Date.now();
      const renderPassResult = await runRenderPass({
        chapterId: input.chapterId,
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
          forbiddenVisualDrift: c.forbiddenVisualDrift ?? [],
        })),
        mainCharacterIds: input.focusCharacterIds,
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

      v3RenderSucceeded =
        renderPassResult.summary.failedCount === 0 &&
        visualQaFailedCount === 0 &&
        manualReviewRequiredCount === 0 &&
        qualityAcceptable &&
        renderPassResult.specs.length === renderPassResult.summary.totalPanels &&
        renderPassResult.summary.totalPanels > 0 &&
        renderedCount > 0 &&
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

  return { v3RenderSucceeded };
}
