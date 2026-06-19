/**
 * Extracteur de faits narratifs — façade orchestrant les sous-modules.
 *
 * Architecture à 3 couches :
 * 1. Heuristiques synchrones (`_narrative-fact-extractor/dictionaries.ts`
 *    + `beat-inference.ts`) — toujours actif, gratuit
 * 2. Analyse sémantique légère (`narrative-fact-llm-enricher.inferAdditionalFactsFromSemantics`)
 *    — toujours actif, gratuit
 * 3. Enrichissement LLM async — optionnel via `enrichNarrativeFactsWithLLM`
 *
 * Ce fichier ne contient plus que :
 *   - le ré-export des helpers utilisés ailleurs ;
 *   - la passe d'agrégation au niveau chapitre (`extractNarrativeFactsFromChapterBundle`).
 */

import type {
  NarrativeFact,
  PresenceObligation,
  ProductionBeat,
} from "@manga-ai-studio/core";
import { inferNarrativeFactsFromBeat } from "./_narrative-fact-extractor/beat-inference";
import type {
  ChapterBundleExtractionResult,
  NarrativeExtractionContext,
} from "./_narrative-fact-extractor/types";

export type {
  ChapterBundleExtractionResult,
  NarrativeExtractionContext,
} from "./_narrative-fact-extractor/types";
export { inferNarrativeFactsFromBeat } from "./_narrative-fact-extractor/beat-inference";

export function extractNarrativeFactsFromChapterBundle(
  beats: ProductionBeat[],
  context: NarrativeExtractionContext,
): ChapterBundleExtractionResult {
  const allFacts: NarrativeFact[] = [];
  const storyObjectsSet = new Set<string>();
  const presenceObligations: PresenceObligation[] = [];
  const speakerAnchors: ChapterBundleExtractionResult["speakerAnchors"] = [];

  for (const beat of beats) {
    const beatFacts = inferNarrativeFactsFromBeat(beat, context);
    allFacts.push(...beatFacts);

    for (const fact of beatFacts) {
      for (const prop of fact.propCandidates) {
        storyObjectsSet.add(prop);
      }
    }

    const hasEnemy = beatFacts.some(
      (f) => f.type === "enemy_presence" || f.type === "threat",
    );
    const hasCrowd = beatFacts.some((f) => f.type === "npc_presence");
    const hasDialogue = beatFacts.some((f) => f.type === "dialogue");

    if (hasEnemy) {
      presenceObligations.push({
        id: `obligation_enemy_${beat.beatId}`,
        beatId: beat.beatId,
        entityType: "enemy",
        entityIdOrLabel: "enemy_actor",
        requirement: "must_show",
        minVisualSalience: "high",
        reason: "beat involves threat or confrontation",
      });
    }

    if (hasCrowd) {
      presenceObligations.push({
        id: `obligation_crowd_${beat.beatId}`,
        beatId: beat.beatId,
        entityType: "crowd",
        entityIdOrLabel: "crowd_group",
        requirement: "should_show",
        minVisualSalience: "low",
        reason: "public/crowd scene detected",
      });
    }

    if (hasDialogue && beat.involvedCharacters && beat.involvedCharacters.length > 0) {
      speakerAnchors.push({
        beatId: beat.beatId,
        speakerCharacterId: beat.involvedCharacters[0],
        visibilityRequirement: "required_visible",
      });
    }
  }

  return {
    facts: allFacts,
    storyObjects: [...storyObjectsSet],
    presenceObligations,
    speakerAnchors,
  };
}
