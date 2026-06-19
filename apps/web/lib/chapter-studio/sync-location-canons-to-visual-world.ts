/**
 * P0.8 — Projette les `locationCanons` studio vers `visualWorldContract.locations`
 * (source cible premium), en préservant le reste du contrat monde.
 */
import type { ChapterStudioData, VisualWorldContract } from "@manga-ai-studio/core";
import { visualWorldContractSchema } from "@manga-ai-studio/core";

export function syncLocationCanonsToVisualWorld(opts: {
  chapterId: string;
  draft: ChapterStudioData;
}): VisualWorldContract {
  const { chapterId, draft } = opts;
  const existing = draft.visualWorldContract;
  const canons = draft.locationCanons ?? [];

  const locations = canons.map((c) => {
    const anchors = [...c.visualMarkers, ...c.fixedElements, ...c.palette].filter(Boolean);
    const lighting = c.lightingRules?.length ? c.lightingRules : c.atmosphere;
    return {
      id: c.locationId,
      label: c.label,
      kind: (c.locationType ?? "").trim() || "scene",
      description: (c.visualBrief ?? "").trim() || c.label,
      visualAnchors: anchors.length > 0 ? anchors : [c.label],
      architecture: c.architecture ?? [],
      lighting: lighting ?? [],
      atmosphere: c.atmosphere ?? [],
      recurringProps: c.mustKeep ?? [],
      negativeConstraints: c.forbiddenDrift ?? [],
      source: "user_canon" as const,
      canonPolicy: c.isPrimary ? ("locked" as const) : ("promote_candidate" as const),
    };
  });

  const merged: VisualWorldContract = {
    version: 1,
    chapterId,
    source: existing?.source ?? "studio_curated",
    locations,
    props: existing?.props ?? [],
    npcGroups: existing?.npcGroups ?? [],
    creatures: existing?.creatures ?? [],
    vehicles: existing?.vehicles ?? [],
    factions: existing?.factions ?? [],
    beatBindings: existing?.beatBindings ?? [],
    diagnostics: existing?.diagnostics,
  };

  return visualWorldContractSchema.parse(merged);
}
