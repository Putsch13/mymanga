import type { PipelineContext, PipelineBundle } from "../pipeline-types";

/**
 * Passe narrative : génération outline, script, dialogues, continuité.
 * TODO: Extraire depuis run-full-chapter-pipeline.ts lignes ~893-2000
 */
export async function runNarrativePass(
  _ctx: PipelineContext,
): Promise<{ bundle: PipelineBundle; usedFallback: boolean }> {
  throw new Error("runNarrativePass: not yet extracted — see run-full-chapter-pipeline.ts");
}
