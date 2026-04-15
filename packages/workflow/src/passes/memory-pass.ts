import type { PipelineContext, PipelineBundle } from "../pipeline-types";

/**
 * Passe mémoire : snapshot mémoire, canon state, NPC promotion, LoRA training check.
 * TODO: Extraire depuis run-full-chapter-pipeline.ts lignes ~3700-4022
 */
export async function runMemoryPass(
  _ctx: PipelineContext,
  _bundle: PipelineBundle,
): Promise<void> {
  throw new Error("runMemoryPass: not yet extracted — see run-full-chapter-pipeline.ts");
}
