import { runImageGenerationPass } from "./passes/image-generation-pass";
import { runMemoryPass } from "./passes/memory-pass";
import { runNarrativePass } from "./passes/narrative-pass";
import type { PipelineJobInput } from "./pipeline-quality";
import {
  buildChapterImagePlanFromNarrative,
  deriveContentRatingFromProject,
  deriveMangaStyleProfileFromStylePack,
} from "./chapter-image-plan-from-narrative";

export interface RunLegacyCompatibleChapterPipelineInput {
  jobId: string;
  chapterId: string;
  projectId: string;
  chapterNumber: number;
  pipelineVersion: "v1" | "v2";
  chapter: unknown;
  project: unknown;
  job: unknown;
  stylePacks: unknown[];
  loraAttachments: unknown[];
  rawCharacters: unknown[];
  npcProfiles: unknown[];
  propInventory: unknown[];
  npcProfileByCharacterId: Map<string, unknown>;
  intensityLayer: string;
  effectiveCreativeControls: unknown;
  enrichedIntent: string;
  selectedPlotLabel: "safe" | "bold" | "shock" | undefined;
  focusCharacterIds: string[];
  jobInput: PipelineJobInput;
}

export async function runLegacyCompatibleChapterPipeline(
  input: RunLegacyCompatibleChapterPipelineInput,
): Promise<void> {
  const narrativeResult = await runNarrativePass(
    {
      jobId: input.jobId,
      chapterId: input.chapterId,
      projectId: input.projectId,
      userId: "",
      chapterNumber: input.chapterNumber,
      pipelineVersion: input.pipelineVersion,
    },
    {
      chapter: input.chapter,
      project: input.project,
      job: input.job,
      stylePacks: input.stylePacks,
      loraAttachments: input.loraAttachments,
      rawCharacters: input.rawCharacters,
      npcProfiles: input.npcProfiles,
      propInventory: input.propInventory,
      npcProfileByCharacterId: input.npcProfileByCharacterId,
      intensityLayer: input.intensityLayer,
      effectiveCreativeControls: input.effectiveCreativeControls,
      enrichedIntent: input.enrichedIntent,
      selectedPlotLabel: input.selectedPlotLabel,
      focusCharacterIds: input.focusCharacterIds,
      jobInput: input.jobInput,
    },
  );

  const {
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
    chapterLookProfile,
    canonRefByName,
    faceCloseupRefByName,
    loraByCharId,
    loraByCharName,
    validatedSceneSnapshots,
    kernelValidationWarnings,
  } = narrativeResult;

  const chapterImagePlan = buildChapterImagePlanFromNarrative({
    projectId: input.projectId,
    chapterId: input.chapterId,
    mangaStyleProfile: deriveMangaStyleProfileFromStylePack(input.stylePacks as Array<{ name?: string | null }>),
    contentRating: deriveContentRatingFromProject({
      intensityLayer: input.intensityLayer,
      settings: (input.project as { settings?: { contentRating?: string | null } | null } | null | undefined)?.settings,
    }),
    plannedImages: plannedImages as Parameters<typeof buildChapterImagePlanFromNarrative>[0]["plannedImages"],
    rawCharacters: input.rawCharacters as Array<{ id: string; name: string; roleType?: string | null }>,
  });
  console.log(
    `[pipeline:chapter-image-plan] chapter=${input.chapterId} items=${chapterImagePlan.plan.length} valid=${chapterImagePlan.validation.valid} issues=${chapterImagePlan.validation.issues.length} warnings=${chapterImagePlan.validation.warnings.length}`,
  );
  if (chapterImagePlan.validation.issues.length > 0) {
    console.warn(
      `[pipeline:chapter-image-plan] issues=${chapterImagePlan.validation.issues.join(" | ")}`,
    );
  }
  if (chapterImagePlan.validation.warnings.length > 0) {
    console.warn(
      `[pipeline:chapter-image-plan] warnings=${chapterImagePlan.validation.warnings.join(" | ")}`,
    );
  }

  const imageResult = await runImageGenerationPass(
    {
      jobId: input.jobId,
      chapterId: input.chapterId,
      projectId: input.projectId,
      userId: "",
      chapterNumber: input.chapterNumber,
    },
    {
      rawCharacters: input.rawCharacters,
      stylePacks: input.stylePacks,
      chapter: input.chapter,
      project: input.project,
      intensityLayer: input.intensityLayer,
      adultEngine,
      context,
      revisedBundle,
      studioSnapshot,
      productionSource,
      finalPanelBlueprints,
      plannedImages,
      chapterLookProfile,
      canonRefByName,
      faceCloseupRefByName,
      loraByCharName,
      loraByCharId,
      effectiveCreativeControls: input.effectiveCreativeControls,
      chapterImagePlan,
    },
  );
  const { generatedCount, failedCount, chapterQualityReport, generationRunSummary } = imageResult;

  await runMemoryPass(
    {
      jobId: input.jobId,
      chapterId: input.chapterId,
      projectId: input.projectId,
      userId: "",
      chapterNumber: input.chapterNumber,
    },
    {
      revisedBundle,
      continuity,
      narrative,
      continuityKernel,
      validatedSceneSnapshots,
      kernelValidationWarnings,
      plannedImages,
      chapterQualityReport,
      generatedCount,
      failedCount,
      generationRunSummary,
      effectiveCreativeControls: input.effectiveCreativeControls,
      context: context as unknown as { characters: { name: string; status?: string }[] },
    },
  );
}
