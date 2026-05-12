import { prisma, type Prisma } from "@manga-ai-studio/db";
import {
  buildChapterCanonState,
  buildChapterSnapshot,
  persistChapterCanonState,
  materializeCanonStateFromChapterSnapshot,
  runContinuityDiff,
} from "@manga-ai-studio/continuity";
import { detectCanonWarnings, persistChapterMemory } from "@manga-ai-studio/memory";
import { uniq } from "../pipeline-helpers";
import { setJobProgress } from "../pipeline-job";
import type { PipelineContext, PipelineMemoryResult } from "../pipeline-types";

/* eslint-disable @typescript-eslint/no-explicit-any -- TODO(Sprint 4): typer CharacterStateLike/ContinuityIssueLike via les types Prisma. */

type CharacterStateLike = {
  characterId: string;
  currentState: { outfit?: unknown };
  physicalCanon: { allowedOutfitVariations?: unknown };
};

type ContinuityIssueLike = {
  message: string;
  severity: "critical" | "major" | "minor" | string;
};

export async function runMemoryPass(
  ctx: PipelineContext,
  input: {
    revisedBundle: any;
    continuity: { notes: string[] };
    narrative: { notes: string[] };
    continuityKernel: any;
    validatedSceneSnapshots: unknown[];
    kernelValidationWarnings: string[];
    plannedImages: Array<{ sceneImageId: string; sceneIndex: number; baseMetadata: Record<string, unknown> }>;
    chapterQualityReport: {
      premiumReleaseAccepted: boolean;
      acceptedImages: number;
      rejectedImages: number;
      missingImages: number;
      minimumAcceptedImages: number;
    };
    generatedCount: number;
    failedCount: number;
    generationRunSummary: unknown;
    effectiveCreativeControls: unknown;
    context: { characters: Array<{ name: string; status?: string }> };
  },
): Promise<PipelineMemoryResult> {
  const { jobId, chapterId, projectId, chapterNumber } = ctx;
  const {
    revisedBundle, continuityKernel, validatedSceneSnapshots, plannedImages,
    chapterQualityReport, kernelValidationWarnings, continuity, narrative,
    generatedCount, failedCount, generationRunSummary, effectiveCreativeControls, context,
  } = input;

  await setJobProgress(jobId, { key: "update_memory", label: "Mémoire et timeline" }, "running");

  const canonWarnings = detectCanonWarnings({
    characterStatuses: context.characters.map(c => ({ name: c.name, status: c.status ?? "" })),
    scriptText: JSON.stringify(revisedBundle.script),
  });

  const chapterSnapshot = buildChapterSnapshot({
    kernel: continuityKernel,
    chapterId,
    chapterNumber,
    title: revisedBundle.outline.chapter_title,
    summary: revisedBundle.memory.narrativeSummary,
    sceneSnapshots: validatedSceneSnapshots as any,
    continuityWarnings: [...canonWarnings, ...kernelValidationWarnings],
  });

  // FIX-10 (MOD) — On lance `runContinuityDiff` AVANT
  // `persistChapterMemory` afin d'incorporer les warnings de continuité
  // dans le `memorySnapshot.structuredState`. Avant ce TODO, le diff
  // était calculé après : ses issues étaient seulement loggées et ne
  // remontaient ni au snapshot ni à l'output du job — invisibles côté
  // studio.
  const continuityReport = await runContinuityDiff(prisma, {
    projectId,
    chapterId,
    chapterNumber,
    outline: revisedBundle.outline,
    script: revisedBundle.script,
    generatedImages: plannedImages.map(img => ({
      id: img.sceneImageId,
      sceneId: String(img.sceneIndex),
      metadata: img.baseMetadata,
    })),
  });

  console.log(`[pipeline] Continuity score: ${continuityReport.score.toFixed(2)}`);
  if (continuityReport.issues.length > 0) {
    console.warn(`[pipeline] Continuity issues detected:`, continuityReport.issues);
  }

  const snapshot = await persistChapterMemory(prisma, {
    projectId,
    chapterId,
    chapterNumber,
    title: revisedBundle.outline.chapter_title,
    summary: revisedBundle.memory.narrativeSummary,
    structuredState: {
      ...revisedBundle.memory.structuredState,
      canonWarnings,
      continuityNotes: continuity.notes,
      qualityReport: chapterQualityReport,
      chapterSnapshot,
      // FIX-10 — issues de continuité disponibles immédiatement dans
      // le snapshot persisté (consulté par le studio / readers).
      continuityReport: {
        score: continuityReport.score,
        issues: continuityReport.issues,
        suggestedRepairs: continuityReport.suggestedRepairs,
      },
      continuityKernel: {
        storyBible: continuityKernel.storyBible,
        worldState: continuityKernel.worldState,
        characterStates: continuityKernel.characterStates,
        locationStates: continuityKernel.locationStates,
        relationshipGraph: continuityKernel.relationshipGraph,
        eventLog: continuityKernel.eventLog.slice(0, 40),
        arcRegistry: continuityKernel.arcRegistry,
      },
    } as any,
    timelineEvents: revisedBundle.memory.timelineEvents as any,
    openLoops: revisedBundle.memory.openLoops as any,
    characterSnapshots: continuityKernel.characterStates as unknown as Prisma.InputJsonValue,
    wardrobeSnapshots: (continuityKernel.characterStates as CharacterStateLike[]).map((state) => ({
      characterId: state.characterId,
      outfit: state.currentState.outfit,
      allowedOutfitVariations: state.physicalCanon.allowedOutfitVariations,
    })) as unknown as Prisma.InputJsonValue,
    relationshipSnapshots: continuityKernel.relationshipGraph as unknown as Prisma.InputJsonValue,
    visualContinuityWarnings: [
      ...canonWarnings,
      ...kernelValidationWarnings,
      ...(continuityReport.issues as ContinuityIssueLike[]).map((issue) => issue.message),
    ] as unknown as Prisma.InputJsonValue,
  });

  await setJobProgress(jobId, { key: "update_memory", label: "Mémoire et timeline" }, "completed");

  const canonStateData = await buildChapterCanonState(prisma, {
    projectId, chapterId, chapterNumber,
    outline: revisedBundle.outline,
    script: revisedBundle.script,
    summary: revisedBundle.memory.narrativeSummary,
    cliffhanger: revisedBundle.outline.cliffhanger,
  });

  const materializedCanonState = materializeCanonStateFromChapterSnapshot(canonStateData, chapterSnapshot);
  materializedCanonState.continuityWarnings = uniq([
    ...materializedCanonState.continuityWarnings,
    ...(continuityReport.issues as ContinuityIssueLike[]).map((issue) => issue.message),
  ]);

  await persistChapterCanonState(prisma, {
    projectId, chapterId, chapterNumber,
    canonStateData: materializedCanonState,
  });

  console.log(`[pipeline] Canon state persisted with ${continuityReport.issues.length} warnings`);

  const hasDegradedFallback = revisedBundle.generationDiagnostics.degradedModes.length > 0;
  const finalStatus =
    failedCount === plannedImages.length
      ? "failed"
      : canonWarnings.length > 0 || kernelValidationWarnings.length > 0 || failedCount > 0
        || hasDegradedFallback || !chapterQualityReport.premiumReleaseAccepted
          ? "partial_success"
          : "completed";

  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: finalStatus,
      finishedAt: new Date(),
      output: {
        currentStep: "done",
        steps: [
          { key: "build_context", label: "Contexte projet", status: "completed" },
          { key: "generate_bundle", label: "Direction, outline, script, storyboard", status: "completed" },
          { key: "continuity_pass", label: "Continuité IA avant images", status: "completed" },
          { key: "story_coherence_pass", label: "Cohérence narrative", status: "completed" },
          { key: "persist_chapter", label: "Persistance chapitre", status: "completed" },
          {
            key: "generate_images",
            label: `Images : ${generatedCount}/${plannedImages.length}`,
            status: failedCount === plannedImages.length ? "failed" : "completed",
          },
          { key: "update_memory", label: "Mémoire et timeline", status: "completed" },
        ],
        plotOptions: revisedBundle.plotOptions,
        creativeDirection: revisedBundle.creativeDirection,
        creativityControls: effectiveCreativeControls,
        operationalStatus: revisedBundle.generationDiagnostics.operationalStatus,
        degradedModes: revisedBundle.generationDiagnostics.degradedModes,
        generationDiagnostics: revisedBundle.generationDiagnostics,
        memorySnapshotId: snapshot.id,
        canonWarnings,
        continuityKernelWarnings: kernelValidationWarnings,
        continuityNotes: continuity.notes,
        narrativeNotes: narrative.notes,
        imageStats: { total: plannedImages.length, generated: generatedCount, failed: failedCount },
        qualityReport: chapterQualityReport,
        continuityReport: {
          score: continuityReport.score,
          issuesCount: continuityReport.issues.length,
          criticalIssues: (continuityReport.issues as ContinuityIssueLike[]).filter((i) => i.severity === "critical").length,
          majorIssues: (continuityReport.issues as ContinuityIssueLike[]).filter((i) => i.severity === "major").length,
          suggestedRepairs: continuityReport.suggestedRepairs,
        },
        generationRunSummary,
      } as unknown as Prisma.InputJsonValue,
    },
  });

  return {
    continuityScore: continuityReport.score,
    canonStateId: null,
    memorySnapshotId: snapshot.id,
    continuityIssueCount: continuityReport.issues.length,
  };
}
