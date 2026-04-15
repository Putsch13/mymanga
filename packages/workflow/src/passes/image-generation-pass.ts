import type {
  PipelineContext,
  PipelineNarrativeResult,
  PipelineImageResult,
} from "../pipeline-types";

/**
 * Passe image : boucle FAL → retry policy → persistance Supabase → cover chapter.
 * Code à extraire de run-full-chapter-pipeline.ts lignes 2718-3857.
 *
 * Ordre d'extraction : ÉTAPE B (après memory-pass validée).
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
    context: unknown;
    revisedBundle: unknown;
    genreMode: unknown;
    lookProfile: unknown;
    sceneAnchors: unknown;
    continuityKernel: unknown;
    npcProfileByCharacterId: Map<string, unknown>;
    propInventory: unknown[];
  },
): Promise<PipelineImageResult> {
  throw new Error("runImageGenerationPass: not yet extracted — see run-full-chapter-pipeline.ts lines 2718-3857");
}
