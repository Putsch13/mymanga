/**
 * Construit les contextes (`narrativeContext`, `universeContext`) consommés
 * lors de l'enrichissement d'un beat. Identique entre les versions sync et
 * async — d'où la factorisation.
 */
import { isPipelineV3PremiumOnlyEnabled } from "@manga-ai-studio/core";
import type { NarrativeExtractionContext } from "../narrative-fact-extractor";
import { indexVisualWorldPropsByBeat } from "../prop-inference-engine";
import type { BuildPremiumChapterContractInput } from "./types";

export interface PremiumEnrichmentContexts {
  narrativeContext: NarrativeExtractionContext;
  universeContext: Record<string, unknown>;
}

export function buildPremiumEnrichmentContexts(
  input: BuildPremiumChapterContractInput,
): PremiumEnrichmentContexts {
  const { heroCharacterId, projectGenre, projectTone, recentContinuityEvents } = input;
  const narrativeContext: NarrativeExtractionContext = {
    projectGenre,
    projectTone,
    heroCharacterId,
    recentContinuityEvents,
  };
  const visualWorldPropsForBeat = indexVisualWorldPropsByBeat(input.visualWorldContract);
  const visualWorldContractActive = input.visualWorldContract != null;
  const premiumOnly = isPipelineV3PremiumOnlyEnabled();
  const universeContext: Record<string, unknown> = {
    projectGenre,
    projectTone,
    heroCharacterId,
    premiumStrictChapterSourcing: premiumOnly,
    suppressUniverseTemplateProps: premiumOnly,
    visualWorldContractActive,
    premiumOnly,
    visualWorldContract: input.visualWorldContract ?? null,
    ...(visualWorldPropsForBeat ? { visualWorldPropsForBeat } : {}),
  };
  return { narrativeContext, universeContext };
}
