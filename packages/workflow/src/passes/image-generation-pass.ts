import type { PipelineContext, PipelineNarrativeResult, PipelineImageResult } from "../pipeline-types";

/**
 * Passe image : blueprints → génération FAL → retry → persistance URLs → cover.
 * TODO: Extraire depuis run-full-chapter-pipeline.ts lignes 2660-3830
 */
export async function runImageGenerationPass(
  _ctx: PipelineContext,
  _narrativeResult: PipelineNarrativeResult,
  _input: {
    loraAttachments: unknown[];
    stylePack: unknown;
    rawCharacters: unknown[];
    recurringNpcs: unknown[];
    intensityLayer: string;
    effectiveCreativeControls: unknown;
    studioSnapshot: unknown;
  },
): Promise<PipelineImageResult> {
  throw new Error("runImageGenerationPass: not yet extracted — see run-full-chapter-pipeline.ts");
}
