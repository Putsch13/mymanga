import type {
  PipelineContext,
  PipelineNarrativeResult,
  PipelineImageResult,
  PipelineMemoryResult,
} from "../pipeline-types";

/**
 * Passe mémoire : persistChapterMemory → runContinuityDiff → buildChapterCanonState → finalisation.
 * Code à extraire de run-full-chapter-pipeline.ts lignes 3857-4049.
 *
 * Ordre d'extraction : ÉTAPE A (la plus isolée, extraire en premier).
 */
export async function runMemoryPass(
  _ctx: PipelineContext,
  _narrativeResult: PipelineNarrativeResult,
  _imageResult: PipelineImageResult,
  _input: {
    revisedBundle: unknown;
    continuityKernel: unknown;
    validatedSceneSnapshots: unknown[];
    plannedImages: unknown[];
    chapterQualityReport: unknown;
    canonWarnings: string[];
    kernelValidationWarnings: string[];
  },
): Promise<PipelineMemoryResult> {
  throw new Error("runMemoryPass: not yet extracted — see run-full-chapter-pipeline.ts lines 3857-4049");
}
