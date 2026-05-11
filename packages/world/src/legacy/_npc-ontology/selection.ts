import { createSeededRng } from "../../seeded-rng";
import type {
  OntologyEntry,
  ProceduralEntity,
  SceneBlueprintInput,
} from "../../types";
import { isEntryUniverseCompatible } from "../../universe-compatibility";
import { NPC_ONTOLOGY } from "./data";

export function matchScore(entry: OntologyEntry, input: SceneBlueprintInput): number {
  // BUG-20 : filtre DUR d'univers. Sans cela, un NPC fantasy/post-apo pouvait être
  // sélectionné dans un projet cyberpunk grâce au bonus rarity + tone match.
  if (!isEntryUniverseCompatible(entry, input.style.universe)) {
    return 0;
  }

  const haystacks = [
    input.style.universe.toLowerCase(),
    input.style.tone.toLowerCase(),
    input.scene.location.toLowerCase(),
    input.narrative.sceneSummary.toLowerCase(),
  ];
  let score = 0;
  if (entry.universes.some((u) => haystacks[0].includes(u.toLowerCase()))) score += 4;
  if (entry.tones.some((t) => haystacks[1].includes(t.toLowerCase()))) score += 3;
  if (
    entry.tags.some((t) =>
      haystacks[2].includes(t.toLowerCase()) || haystacks[3].includes(t.toLowerCase()),
    )
  ) {
    score += 2;
  }
  // Bonus rarity plafonné (2 au lieu de 5 max) pour éviter qu'il compense à lui seul
  // l'absence totale de match univers/tone/tags.
  score += Math.max(0, Math.min(2, 6 - entry.rarity));
  return score;
}

export function generateNpcSelection(
  input: SceneBlueprintInput,
  seed: number,
): ProceduralEntity[] {
  const rng = createSeededRng(seed);
  const ranked = [...NPC_ONTOLOGY]
    .map((entry) => ({ entry, score: matchScore(entry, input) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  const desired =
    input.controls.npcVariety >= 70
      ? 3
      : input.controls.npcVariety >= 40
        ? 2
        : 1;
  const candidatePool = ranked.slice(0, Math.min(ranked.length, desired + 2));
  return rng.pickMany(candidatePool, desired).map(({ entry }) => ({
    id: `${entry.id}-${seed}`,
    label: entry.label,
    kind: "npc",
    role: entry.role,
    visualCues: entry.visualCues,
    interactionHooks: entry.interactionHooks,
    sourceOntologyId: entry.id,
  }));
}
