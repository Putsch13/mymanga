import type { PipelineContext, PipelineBundle } from "../pipeline-types";

/**
 * Passe image : blueprints → routing FAL → retry policy → persistance URLs.
 * TODO: Extraire depuis run-full-chapter-pipeline.ts lignes ~2000-3500
 */
export async function runImageGenerationPass(
  _ctx: PipelineContext,
  _bundle: PipelineBundle,
): Promise<{ generatedCount: number; failedCount: number; rerollCount: number }> {
  throw new Error("runImageGenerationPass: not yet extracted — see run-full-chapter-pipeline.ts");
}
