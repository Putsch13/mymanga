import type { PipelineContext } from "../pipeline-types";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Passe narrative : contexte projet → generateChapterBundle → coherence → blueprints → persistance scènes.
 * Code à extraire de run-full-chapter-pipeline.ts lignes ~370-1963.
 *
 * Ordre d'extraction : ÉTAPE C (la plus complexe, extraire en dernier).
 *
 * ⚠️ N'attaquer qu'après 3 chapitres réussis post-B.
 *
 * Sous-blocs bien délimités :
 *   Ligne  370 → 474  : buildProjectContext + recurringNpcs + continuityKernel
 *   Ligne  475 → 750  : generateChapterBundle + coherence + integrity + NPC promo
 *   Ligne  751 → 988  : Genre director + LookProfile + SceneAnchor + Romance director
 *   Ligne  989 → 1963 : Boucle scènes (blueprints + LLM + persistance DB)
 */
export async function runNarrativePass(
  _ctx: PipelineContext,
  _input: {
    chapter: any;
    project: any;
    rawCharacters: any[];
    npcProfiles: any[];
    propInventory: any[];
    loraAttachments: any[];
    effectiveCreativeControls: any;
    enrichedIntent: string;
    selectedPlotLabel: string | undefined;
    focusCharacterIds: string[];
    intensityLayer: string;
  },
): Promise<{
  context: any;
  revisedBundle: any;
  continuity: { notes: string[] };
  narrative: { notes: string[] };
  continuityKernel: any;
  finalPanelBlueprints: any[];
  plannedImages: Array<{ sceneImageId: string; panel: any; sceneIndex: number; baseMetadata: Record<string, unknown> }>;
  loraByCharId: Map<string, { url: string; triggerWord: string; scale: number }>;
  canonRefByCharId: Map<string, any>;
  chapterLookProfile: any;
  chapterGenreMode: any;
  sceneAnchorByIndex: Map<number, any>;
  romanceDirectionByScene: Map<number, any>;
  stylePackMeta: any;
  npcProfileByCharacterId: Map<string, any>;
  validatedSceneSnapshots: any[];
  kernelValidationWarnings: string[];
  debugPanel: boolean;
}> {
  throw new Error(
    "runNarrativePass: not yet extracted — see run-full-chapter-pipeline.ts. " +
    "Extract only after runImageGenerationPass (Étape B) has been validated on 3+ chapters in production.",
  );
}
