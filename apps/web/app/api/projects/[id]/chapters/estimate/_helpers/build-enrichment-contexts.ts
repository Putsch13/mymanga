/**
 * P5.2 — Prépare les contextes utilisés par `enrichEstimateBeats`.
 *
 * Sépare 3 axes :
 *   - `universeContext`  : décor / props / VW pour `inferRequiredPropsFromBeat`.
 *   - `narrativeContext` : continuité passée pour `inferNarrativeFactsFromBeat`.
 *   - `characterCatalogForResolution` : map id↔name pour les refs personnages.
 */
import {
  indexVisualWorldPropsByBeat,
  inferNarrativeFactsFromBeat,
  inferRequiredPropsFromBeat,
} from "@manga-ai-studio/ai";
import {
  isHeroRole,
  isPipelineV3PremiumOnlyEnabled,
  type VisualWorldContract,
} from "@manga-ai-studio/core";

type UniverseContext = Parameters<typeof inferRequiredPropsFromBeat>[2];
type NarrativeContext = Parameters<typeof inferNarrativeFactsFromBeat>[1];

interface ContextProject {
  primaryGenre?: string | null;
  tone?: string | null;
}

interface ContextCharacter {
  id: string;
  name: string;
  roleType: string | null;
}

interface ContextContinuityEvent {
  eventType: string;
  summary: string | null;
  entities?: unknown;
}

export function buildEnrichmentContexts(args: {
  project: ContextProject;
  characters: ContextCharacter[] | undefined;
  recentContinuityEvents: ContextContinuityEvent[] | undefined;
  visualWorldContract: VisualWorldContract | null;
}): {
  heroCharacterId: string | null;
  universeContext: UniverseContext;
  narrativeContext: NarrativeContext;
  characterCatalogForResolution: Array<{
    id: string;
    name: string;
    displayName: string | null;
    roleType: string | null;
  }>;
} {
  const { project, characters, recentContinuityEvents, visualWorldContract } = args;
  const heroCharacterId = characters?.find((c) => isHeroRole(c.roleType))?.id ?? null;
  const visualWorldPropsForBeat = indexVisualWorldPropsByBeat(visualWorldContract ?? undefined);
  const visualWorldContractActive = visualWorldContract != null;

  const universeContext: UniverseContext = {
    projectGenre: project.primaryGenre ?? null,
    projectTone: project.tone ?? null,
    heroCharacterId,
    premiumStrictChapterSourcing: isPipelineV3PremiumOnlyEnabled(),
    suppressUniverseTemplateProps: isPipelineV3PremiumOnlyEnabled(),
    visualWorldContractActive,
    premiumOnly: isPipelineV3PremiumOnlyEnabled(),
    visualWorldContract: visualWorldContract ?? null,
    ...(visualWorldPropsForBeat ? { visualWorldPropsForBeat } : {}),
  };

  const narrativeContext: NarrativeContext = {
    projectGenre: project.primaryGenre ?? null,
    projectTone: project.tone ?? null,
    heroCharacterId,
    recentContinuityEvents: recentContinuityEvents?.map((e) => ({
      eventType: e.eventType,
      summary: e.summary ?? "",
      entities:
        e.entities && typeof e.entities === "object" && !Array.isArray(e.entities)
          ? (e.entities as {
              objectsGained?: string[];
              objectsLost?: string[];
              locationChange?: string;
            })
          : undefined,
    })),
  };

  const characterCatalogForResolution = (characters ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    displayName: null as string | null,
    roleType: c.roleType,
  }));

  return {
    heroCharacterId,
    universeContext,
    narrativeContext,
    characterCatalogForResolution,
  };
}
