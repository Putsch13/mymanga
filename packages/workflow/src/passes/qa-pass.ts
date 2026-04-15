import type { PipelineContext, PipelineBundle } from "../pipeline-types";

/**
 * Passe QA : vision QA sur panels critiques, quality report, release gate.
 * TODO: Extraire depuis run-full-chapter-pipeline.ts lignes ~3500-3700
 */
export async function runQAPass(
  _ctx: PipelineContext,
  _bundle: PipelineBundle,
): Promise<{ qualityReport: unknown; releaseScore: number; blocked: boolean }> {
  throw new Error("runQAPass: not yet extracted — see run-full-chapter-pipeline.ts");
}
