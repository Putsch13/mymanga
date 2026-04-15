import type { PipelineContext, PipelineNarrativeResult } from "../pipeline-types";

/**
 * Passe narrative : contexte projet → generateChapterBundle → coherence → blueprints → persistance scènes.
 * Code à extraire de run-full-chapter-pipeline.ts lignes 1135-2718.
 *
 * Ordre d'extraction : ÉTAPE C (la plus complexe, extraire en dernier).
 */
export async function runNarrativePass(
  _ctx: PipelineContext,
  _input: {
    chapter: unknown;
    project: unknown;
    rawCharacters: unknown[];
    npcProfiles: unknown[];
    propInventory: unknown[];
    jobInput: Record<string, unknown>;
    effectiveCreativeControls: unknown;
    enrichedIntent: string;
    selectedPlotLabel: string | undefined;
    focusCharacterIds: string[];
    heroCharacterId: string | null;
    studioSnapshot: unknown;
    approvedOutline: unknown;
    intensityLayer: string;
  },
): Promise<PipelineNarrativeResult & {
  context: unknown;
  revisedBundle: unknown;
  genreMode: unknown;
  lookProfile: unknown;
  sceneAnchors: unknown;
  continuityKernel: unknown;
  validatedSceneSnapshots: unknown[];
  plannedImages: Array<{ sceneImageId: string; sceneIndex: number; baseMetadata: Record<string, unknown> }>;
  canonWarnings: string[];
  kernelValidationWarnings: string[];
  npcProfileByCharacterId: Map<string, unknown>;
  stylePack: unknown;
  recurringNpcs: unknown[];
}> {
  throw new Error("runNarrativePass: not yet extracted — see run-full-chapter-pipeline.ts lines 1135-2718");
}
