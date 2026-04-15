import type { PipelineContext, PipelineNarrativeResult } from "../pipeline-types";

/**
 * Passe narrative : contexte → bundle → coherence → blueprints → persistance scènes.
 * TODO: Extraire depuis run-full-chapter-pipeline.ts lignes 1240-1715
 */
export async function runNarrativePass(
  _ctx: PipelineContext,
  _input: {
    chapter: unknown;
    project: unknown;
    rawCharacters: unknown[];
    recurringNpcs: unknown[];
    continuityKernel: unknown;
    jobInput: Record<string, unknown>;
    effectiveCreativeControls: unknown;
    enrichedIntent: string;
    selectedPlotLabel: string | undefined;
    focusCharacterIds: string[];
    heroCharacterId: string | null;
    studioSnapshot: unknown;
    approvedOutline: unknown;
  },
): Promise<PipelineNarrativeResult> {
  throw new Error("runNarrativePass: not yet extracted — see run-full-chapter-pipeline.ts");
}
