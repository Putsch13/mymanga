/**
 * Enrichit un beat de l'`approvedOutline` :
 *   - heuristiques (sync) ou heuristiques + LLM (async),
 *   - narrative facts → required props → panel blueprints.
 *
 * Avant la refacto, cette logique était dupliquée à l'identique entre
 * `buildPremiumChapterContract` (sync) et `buildPremiumChapterContractAsync`
 * (async), à un seul endroit près : l'enrichissement LLM.
 */
import type { ProductionBeat } from "@manga-ai-studio/core";
import type { ApprovedChapterOutline } from "@manga-ai-studio/core";
import {
  inferNarrativeFactsFromBeat,
  type NarrativeExtractionContext,
} from "../narrative-fact-extractor";
import { enrichNarrativeFactsWithLLM, mergeNarrativeFacts } from "../narrative-fact-llm-enricher";
import { inferRequiredPropsFromBeat } from "../prop-inference-engine";
import { buildPanelBlueprintsFromBeat } from "../panel-blueprint-builder";
import type { EnrichedBeatInternal } from "./types";

function toProductionBeat(beat: ApprovedChapterOutline["beats"][number]): ProductionBeat {
  return {
    beatId: beat.id,
    summary: beat.summary,
    narrativeFunction: beat.pageRole ?? "escalation",
    whyThisBeatExists: beat.summary,
    dramaticChange: beat.turn ?? "",
    involvedCharacters: beat.characters ?? [],
    activeCanonConstraints: [],
    environmentContext: beat.location ? [beat.location] : [],
    visualPriority: "high" as const,
    estimatedPanels: 4,
    criticality: (beat.pageRole === "cliffhanger" || beat.pageRole === "revelation"
      ? "critical"
      : "medium") as "critical" | "medium",
    continuityDependencies: [],
    infoGained: null,
    emotionProduced: null,
    indispensabilityScore: 72,
    redundancyRisk: 18,
  };
}

interface EnrichBeatArgs {
  beat: ApprovedChapterOutline["beats"][number];
  narrativeContext: NarrativeExtractionContext;
  universeContext: Record<string, unknown>;
  heroCharacterId: string | null;
  projectGenre: string | null;
  projectTone: string | null;
}

export function enrichBeatSync(args: EnrichBeatArgs): EnrichedBeatInternal {
  const { beat, narrativeContext, universeContext, heroCharacterId, projectGenre, projectTone } = args;
  const productionBeat = toProductionBeat(beat);
  const narrativeFacts = inferNarrativeFactsFromBeat(productionBeat, narrativeContext);
  const requiredProps = inferRequiredPropsFromBeat(productionBeat, narrativeFacts, universeContext);
  const blueprints = buildPanelBlueprintsFromBeat(productionBeat, narrativeFacts, requiredProps, {
    heroCharacterId,
    projectGenre,
    projectTone,
  });
  return {
    productionBeat: { ...productionBeat, estimatedPanels: blueprints.length > 0 ? blueprints.length : 4 },
    narrativeFacts,
    requiredProps,
    blueprints,
  };
}

export async function enrichBeatAsync(args: EnrichBeatArgs): Promise<EnrichedBeatInternal> {
  const { beat, narrativeContext, universeContext, heroCharacterId, projectGenre, projectTone } = args;
  const productionBeat = toProductionBeat(beat);
  const heuristicFacts = inferNarrativeFactsFromBeat(productionBeat, narrativeContext);
  const llmFacts = await enrichNarrativeFactsWithLLM(productionBeat, heuristicFacts, narrativeContext);
  const narrativeFacts = mergeNarrativeFacts(heuristicFacts, llmFacts);
  const requiredProps = inferRequiredPropsFromBeat(productionBeat, narrativeFacts, universeContext);
  const blueprints = buildPanelBlueprintsFromBeat(productionBeat, narrativeFacts, requiredProps, {
    heroCharacterId,
    projectGenre,
    projectTone,
  });
  return {
    productionBeat: { ...productionBeat, estimatedPanels: blueprints.length > 0 ? blueprints.length : 4 },
    narrativeFacts,
    requiredProps,
    blueprints,
  };
}
