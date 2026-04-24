import {
  extractRequiredVisualCoverage,
  extractRequiredVisualCoverageFromProductionPlan,
  validateVisualCoverage,
  type StoryArc,
} from "@manga-ai-studio/ai";
import { PREMIUM_PANEL_RANGE, type PanelBlueprintPremium } from "@manga-ai-studio/core";
import { createDefaultPanelImageGenerator } from "./passes/default-panel-image-generator";
import { loadChapterVisualMemory } from "./passes/load-chapter-visual-memory";
import { runPageQaPass } from "./passes/page-qa-pass";
import { runRenderPass } from "./passes/render-pass";
import { runStoryPass } from "./passes/story-pass";
import { buildStoryboardPlanFromApprovedProductionPlan } from "./build-storyboard-plan-from-approved-production-plan";
import { buildStoryboardPlanFromPremiumBlueprints } from "./passes/storyboard-from-premium-plan";
import { runStoryboardPass } from "./passes/storyboard-pass";
import { buildStyleBibleFromUserProject } from "./chapter-style-bible-resolver";
import { isPipelineV3RenderFalEnabled } from "./pipeline-feature-flags";
import { loadLocationsForV3StoryPass, type PremiumV3PipelineLocation } from "./load-locations-for-v3-story-pass";
import { saveStoryboardPlan } from "./persistence/storyboard-persistence";

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

  let v3RenderSucceeded = false;
  if (!input.pipelineV3Enabled) {
    return { v3RenderSucceeded };
  }

  const pipelineStartMs = Date.now();
  const timings: Record<string, number> = {};

  try {
    const approvedPlanDriven = hasApprovedPlanDrivenInput(input);
    let storyArc: StoryArc | null = null;

    let storyboardPassResult: Awaited<ReturnType<typeof runStoryboardPass>>;

    if (approvedPlanDriven) {
      const storyboardBuildStart = Date.now();
      storyboardPassResult = {
        storyboardPlan: buildStoryboardPlanFromApprovedProductionPlan({
          chapterId: input.chapterId,
          projectId: input.projectId,
          chapterNumber: input.chapterNumber,
          productionPlan: input.productionPlan!,
          projectFormat: resolveProjectFormat(input.project, input.projectId),
          chapterLocationName: input.chapterLocationName,
          productionPlanPages: input.productionPlanPages,
        }),
        warnings: ["storyboard_plan.source=approved_production_plan"],
        blockers: [],
      };
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
        Array.isArray(input.panelBlueprints) && input.panelBlueprints.length > 0
          ? {
              storyboardPlan: buildStoryboardPlanFromPremiumBlueprints({
                chapterId: input.chapterId,
                projectFormat: resolveProjectFormat(input.project, input.projectId),
                panelBlueprints: input.panelBlueprints,
                pages: input.productionPlanPages,
                chapterLocationName: input.chapterLocationName ?? null,
              }),
              warnings: ["storyboard_plan.source=premium_production_plan"],
              blockers: [],
            }
          : await runStoryboardPass({
              storyArc: storyPassResult.storyArc,
              heroCharacterIds: input.focusCharacterIds,
              projectFormat: resolveProjectFormat(input.project, input.projectId),
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

    // P1.9 — Extraire le coverage depuis productionPlan si approved_plan_driven
    const requiredCoverage = storyArc
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
    const coverageReport = validateVisualCoverage(
      requiredCoverage,
      storyboardPassResult.storyboardPlan,
    );
    console.log(
      `[pipeline:v3:visual-coverage] required=${requiredCoverage.length} fulfilled=${coverageReport.fulfilled.length} gaps=${coverageReport.gaps.length} source=${storyArc ? "storyArc" : approvedPlanDriven ? "productionPlan" : "none"}`,
    );
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
    const MAX_CUTAWAY_RATIO = 0.35;

    console.log(
      `[pipeline:v3:cutaway-ratio] count=${cutawayPanels.length}/${allPanels.length} ratio=${(cutawayRatio * 100).toFixed(1)}% max=${(MAX_CUTAWAY_RATIO * 100).toFixed(0)}%`,
    );

    if (cutawayRatio > MAX_CUTAWAY_RATIO && input.premiumV3OnlyEnabled) {
      console.error(
        `[pipeline:v3:cutaway-ratio] exceeded chapterId=${input.chapterId} ratio=${(cutawayRatio * 100).toFixed(1)}%`,
      );
      throw new Error(
        `premium_v3_only_cutaway_ratio_exceeded: ${(cutawayRatio * 100).toFixed(1)}% > ${(MAX_CUTAWAY_RATIO * 100).toFixed(0)}% — trop de cutaways, pas assez de personnages/action`,
      );
    }

    if (!coverageReport.ok) {
      const gapSummary = coverageReport.gaps
        .slice(0, 8)
        .map((g) => `${g.coverage.entityType}:${g.coverage.entity}@${g.coverage.sourceBeatId}`)
        .join(" | ");
      console.error(
        `[pipeline:v3:visual-coverage] gaps=${coverageReport.gaps.length} ${gapSummary}`,
      );
      if (input.premiumV3OnlyEnabled) {
        throw new Error(
          `premium_v3_only_visual_coverage_gaps: ${coverageReport.gaps.length} entities uncovered [${gapSummary}]`,
        );
      }
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

      const renderFalEnabled = isPipelineV3RenderFalEnabled();
      console.log(
        `[pipeline:v3:render] fal_real_enabled=${renderFalEnabled} (flag PIPELINE_V3_RENDER_FAL)`,
      );
      const renderStart = Date.now();
      const renderPassResult = await runRenderPass({
        chapterId: input.chapterId,
        storyboardPlan: storyboardPassResult.storyboardPlan,
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
          ? createDefaultPanelImageGenerator()
          : undefined,
        persistToDb: renderFalEnabled,
      });
      timings.render_pass_ms = Date.now() - renderStart;
      console.log(
        `[pipeline:v3:render] total=${renderPassResult.summary.totalPanels} specs=${renderPassResult.specs.length} failed=${renderPassResult.summary.failedCount} panel_qa_ok=${renderPassResult.panelQa.okCount}/${renderPassResult.panelQa.okCount + renderPassResult.panelQa.failCount}`,
      );
      if (renderPassResult.summary.warnings.length > 0) {
        console.warn(
          `[pipeline:v3:render] warnings=${renderPassResult.summary.warnings.slice(0, 5).join(" | ")}`,
        );
      }

      const renderedCount = renderPassResult.summary.renderedCount;
      const skippedCount = renderPassResult.summary.skippedCount;
      v3RenderSucceeded =
        renderPassResult.summary.failedCount === 0 &&
        renderPassResult.specs.length === renderPassResult.summary.totalPanels &&
        renderPassResult.summary.totalPanels > 0 &&
        renderedCount > 0 &&
        skippedCount === 0;
      if (!v3RenderSucceeded) {
        console.warn(
          `[pipeline:v3:render] v3_succeeded=false rendered=${renderedCount} skipped=${skippedCount} failed=${renderPassResult.summary.failedCount} specs=${renderPassResult.specs.length}/${renderPassResult.summary.totalPanels} — legacy image-gen will still run (unless PREMIUM_ONLY=true which would then fail-hard)`,
        );
        if (input.premiumV3OnlyEnabled) {
          throw new Error(
            `premium_v3_only_render_incomplete: rendered=${renderedCount} skipped=${skippedCount} failed=${renderPassResult.summary.failedCount} specs=${renderPassResult.specs.length}/${renderPassResult.summary.totalPanels}`,
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
