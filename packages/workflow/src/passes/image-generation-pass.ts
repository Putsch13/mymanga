import type { PipelineContext } from "../pipeline-types";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Passe image : boucle FAL → retry policy → persistance Supabase → cover chapter.
 * Code à extraire de run-full-chapter-pipeline.ts lignes ~1964-3200.
 *
 * Ordre d'extraction : ÉTAPE B (après memory-pass validée sur 2+ chapitres).
 *
 * La stratégie : la fonction prend en input toutes les données calculées avant
 * la boucle de génération, et retourne tout ce qui est consommé par la memory pass.
 *
 * Les closures internes (generateAttempt, validateAttempt, rankCandidate,
 * isEnvironmentSufficientForNarrativePanel) restent à l'intérieur de cette fonction.
 */
export async function runImageGenerationPass(
  _ctx: PipelineContext,
  _input: {
    plannedImages: Array<{ sceneImageId: string; panel: any; sceneIndex: number; baseMetadata: Record<string, unknown> }>;
    finalPanelBlueprints: any[];
    loraByCharId: Map<string, { url: string; triggerWord: string; scale: number }>;
    canonRefByCharId: Map<string, any>;
    context: any;
    revisedBundle: any;
    chapterLookProfile: any;
    chapterGenreMode: any;
    sceneAnchorByIndex: Map<number, any>;
    romanceDirectionByScene: Map<number, any>;
    intensityLayer: string;
    stylePackMeta: any;
    continuityKernel: any;
    npcProfileByCharacterId: Map<string, any>;
    propInventory: any[];
    rawCharacters: any[];
    debugPanel: boolean;
  },
): Promise<{
  generatedCount: number;
  failedCount: number;
  rerollCount: number;
  envCacheHits: number;
  chapterQualityReport: any;
  generationRunSummary: any;
  validatedSceneSnapshots: any[];
  kernelValidationWarnings: string[];
  continuityKernel: any;
}> {
  throw new Error(
    "runImageGenerationPass: not yet extracted — see run-full-chapter-pipeline.ts. " +
    "Extract only after runMemoryPass (Étape A) has been validated on 2+ chapters in production.",
  );
}
