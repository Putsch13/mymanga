import type { PipelineContext, PipelineNarrativeResult, PipelineImageResult, PipelineMemoryResult } from "../pipeline-types";

/**
 * Passe mémoire : snapshot → continuity diff → canon state → finalisation.
 * TODO: Extraire depuis run-full-chapter-pipeline.ts lignes 3830-4022
 */
export async function runMemoryPass(
  _ctx: PipelineContext,
  _narrativeResult: PipelineNarrativeResult,
  _imageResult: PipelineImageResult,
  _input: {
    chapterQualityReport: unknown;
    validatedSceneSnapshots: unknown[];
    continuityKernel: unknown;
    plannedImages: unknown[];
    revisedBundle: unknown;
    canonWarnings: string[];
  },
): Promise<PipelineMemoryResult> {
  throw new Error("runMemoryPass: not yet extracted — see run-full-chapter-pipeline.ts");
}
