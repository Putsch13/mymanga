import type { OntologyEntry, ProceduralEntity, SceneBlueprintInput } from "./types";
import { NPC_ONTOLOGY } from "./npc-ontology";
import { createSeededRng } from "./seeded-rng";

export type NpcResolverResult = {
  entities: ProceduralEntity[];
  source: "local" | "ai";
  confidence: number;
};

function scoreEntry(entry: OntologyEntry, input: SceneBlueprintInput): number {
  const hayUniverse = input.style.universe.toLowerCase();
  const hayTone = input.style.tone.toLowerCase();
  const hayLocation = input.scene.location.toLowerCase();
  const haySummary = input.narrative.sceneSummary.toLowerCase();

  let score = 0;
  if (entry.universes.some((u) => hayUniverse.includes(u.toLowerCase()))) score += 4;
  if (entry.tones.some((t) => hayTone.includes(t.toLowerCase()))) score += 3;
  if (entry.tags.some((t) => hayLocation.includes(t.toLowerCase()) || haySummary.includes(t.toLowerCase()))) score += 2;

  if (entry.factions.length > 0 && input.scene.factions.some((f) => entry.factions.includes(f))) score += 3;
  if (entry.weathers.length > 0 && input.scene.weather && entry.weathers.includes(input.scene.weather)) score += 1;
  if (entry.worldStates.length > 0 && input.scene.worldState.some((ws) => entry.worldStates.includes(ws))) score += 2;

  score += Math.max(0, 6 - entry.rarity);
  return score;
}

export function resolveNpcLocally(
  input: SceneBlueprintInput,
  seed: number,
  desiredCount?: number,
): NpcResolverResult {
  const rng = createSeededRng(seed);
  const ranked = [...NPC_ONTOLOGY]
    .map((entry) => ({ entry, score: scoreEntry(entry, input) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  const count =
    desiredCount ??
    (input.controls.npcVariety >= 70 ? 3 : input.controls.npcVariety >= 40 ? 2 : 1);

  if (ranked.length === 0) {
    return { entities: [], source: "local", confidence: 0 };
  }

  const poolSize = Math.min(ranked.length, count + 2);
  const selected = rng.pickMany(ranked.slice(0, poolSize), Math.min(count, poolSize));

  const topScore = ranked[0]?.score ?? 0;
  const confidence = Math.min(1, topScore / 12);

  return {
    entities: selected.map(({ entry }) => ({
      id: `${entry.id}-${seed}`,
      label: entry.label,
      kind: "npc" as const,
      role: entry.role,
      visualCues: entry.visualCues,
      interactionHooks: entry.interactionHooks,
      sourceOntologyId: entry.id,
    })),
    source: "local",
    confidence,
  };
}

export type AiNpcResolver = (
  input: SceneBlueprintInput,
  localCandidates: ProceduralEntity[],
) => Promise<ProceduralEntity[]>;

export async function resolveNpcWithAI(
  input: SceneBlueprintInput,
  seed: number,
  aiResolver: AiNpcResolver,
  desiredCount?: number,
): Promise<NpcResolverResult> {
  const local = resolveNpcLocally(input, seed, desiredCount);

  if (local.confidence >= 0.7) {
    return local;
  }

  try {
    const aiEntities = await aiResolver(input, local.entities);
    return {
      entities: aiEntities.length > 0 ? aiEntities : local.entities,
      source: aiEntities.length > 0 ? "ai" : "local",
      confidence: aiEntities.length > 0 ? 0.9 : local.confidence,
    };
  } catch {
    return local;
  }
}
