/**
 * P5.2 — Enrichissement des beats avec narrative facts + props + blueprints.
 *
 * Pour chaque beat de l'outline :
 *   1. Résolution stricte des refs personnages (libellés → ids).
 *   2. Construction du `productionBeat` (criticality, focus default, dramatic change).
 *   3. Couches d'inférence faits narratifs : heuristique → LLM → merge.
 *   4. Props requis + blueprints panneau associés (`buildPanelBlueprintsFromBeat`).
 *
 * Renvoie les beats enrichis (avec `_blueprints`) et la liste plate de blueprints.
 */
import {
  buildPanelBlueprintsFromBeat,
  enrichNarrativeFactsWithLLM,
  inferNarrativeFactsFromBeat,
  inferRequiredPropsFromBeat,
  mergeNarrativeFacts,
} from "@manga-ai-studio/ai";
import { resolveCharacterRefsToIds } from "@manga-ai-studio/core";

type GeneratedBundle = {
  outline: {
    beats: Array<{
      id: string;
      summary: string;
      characters?: string[];
      location: string;
      pageRole?: string | null;
      purpose: string;
      turn?: string | null;
      emotionalDelta?: number | null;
      structuredBeat?: unknown | null;
    }>;
  };
};

type CharacterRef = { id: string; name: string; displayName: string | null; roleType: string | null };
type NpcGroupRef = { id: string; label: string };

type UniverseContext = Parameters<typeof inferRequiredPropsFromBeat>[2];
type NarrativeContext = Parameters<typeof inferNarrativeFactsFromBeat>[1];

export async function enrichEstimateBeats(args: {
  bundle: GeneratedBundle;
  characterCatalogForResolution: CharacterRef[];
  npcGroupRefsForResolution: NpcGroupRef[];
  narrativeContext: NarrativeContext;
  universeContext: UniverseContext;
  heroCharacterId: string | null;
  projectGenre: string | null;
  projectTone: string | null;
}) {
  const {
    bundle,
    characterCatalogForResolution,
    npcGroupRefsForResolution,
    narrativeContext,
    universeContext,
    heroCharacterId,
    projectGenre,
    projectTone,
  } = args;

  const enrichedBeats = await Promise.all(bundle.outline.beats.map(async (beat) => {
    const charLabels = Array.isArray(beat.characters) ? beat.characters : [];
    const resolved = resolveCharacterRefsToIds(
      charLabels,
      characterCatalogForResolution,
      npcGroupRefsForResolution,
    );
    if (resolved.unresolved.length > 0) {
      console.warn(
        `[estimate] character_ref_unresolved beatId=${beat.id} labels=${JSON.stringify(resolved.unresolved)}`,
      );
    }
    if (resolved.npcGroupIds && resolved.npcGroupIds.length > 0) {
      console.info(
        `[estimate] character_ref_npc_group_resolved beatId=${beat.id} groupIds=${JSON.stringify(resolved.npcGroupIds)}`,
      );
    }

    const productionBeat = {
      beatId: beat.id,
      summary: beat.summary,
      narrativeFunction: beat.pageRole ?? beat.purpose,
      whyThisBeatExists: beat.summary,
      dramaticChange: beat.turn ?? beat.purpose,
      involvedCharacters: resolved.ids,
      involvedCharacterLabels: charLabels,
      unresolvedCharacterRefs: resolved.unresolved,
      activeCanonConstraints: [] as string[],
      environmentContext: [beat.location],
      visualPriority: "high" as const,
      estimatedPanels: 4,
      criticality:
        (beat.pageRole === "cliffhanger" || beat.pageRole === "revelation"
          ? "critical"
          : "medium") as "critical" | "medium",
      continuityDependencies: [] as string[],
      infoGained: null,
      emotionProduced: null,
      indispensabilityScore: 72,
      redundancyRisk: 18,
    };

    const heuristicFacts = inferNarrativeFactsFromBeat(productionBeat, narrativeContext);
    const llmFacts = await enrichNarrativeFactsWithLLM(
      productionBeat,
      heuristicFacts,
      narrativeContext,
    );
    const narrativeFacts = mergeNarrativeFacts(heuristicFacts, llmFacts);

    const requiredProps = inferRequiredPropsFromBeat(productionBeat, narrativeFacts, universeContext);

    const blueprints = buildPanelBlueprintsFromBeat(productionBeat, narrativeFacts, requiredProps, {
      heroCharacterId,
      projectGenre,
      projectTone,
    });

    return {
      ...productionBeat,
      estimatedPanels: blueprints.length > 0 ? blueprints.length : 4,
      narrativeFacts,
      requiredProps,
      _blueprints: blueprints,
    };
  }));

  const rawBlueprints = enrichedBeats.flatMap((b) => b._blueprints);
  const rawProductionBeats = enrichedBeats.map((b) => {
    const { _blueprints, ...beat } = b;
    void _blueprints;
    return beat;
  });

  return { enrichedBeats, rawBlueprints, rawProductionBeats };
}
