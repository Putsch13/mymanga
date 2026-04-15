import type {
  PipelineContext,
  PipelineNarrativeResult,
  PipelineQAResult,
} from "../pipeline-types";

/**
 * Passe QA : vision QA sur panels critiques, quality report, release gate.
 * Actuellement intégrée dans la passe image (computeChapterQualityReport).
 * À extraire séparément quand la passe image sera isolée.
 */
export async function runQAPass(
  _ctx: PipelineContext,
  _narrativeResult: PipelineNarrativeResult,
): Promise<PipelineQAResult> {
  throw new Error("runQAPass: not yet extracted — see run-full-chapter-pipeline.ts");
}
