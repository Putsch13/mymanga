import type { PipelineContext, PipelineNarrativeResult, PipelineQAResult } from "../pipeline-types";

/**
 * Passe QA : vision QA sur panels critiques, quality report, release gate.
 * TODO: Extraire depuis run-full-chapter-pipeline.ts lignes 3500-3700
 */
export async function runQAPass(
  _ctx: PipelineContext,
  _narrativeResult: PipelineNarrativeResult,
): Promise<PipelineQAResult> {
  throw new Error("runQAPass: not yet extracted — see run-full-chapter-pipeline.ts");
}
