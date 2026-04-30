/**
 * Résolution beat → ids du `VisualWorldContract` (partagé hydratation env / props / PNJ).
 */

import type { VisualWorldContract } from "../visual-world/visual-world-contract";

export function bindingForBeat(vw: VisualWorldContract, beatId: string) {
  return vw.beatBindings.find((b) => b.beatId === beatId);
}

export function propIdsForBeat(vw: VisualWorldContract, beatId: string, primaryIds: string[]): string[] {
  const set = new Set(primaryIds);
  for (const p of vw.props) {
    if (p.requiredBeatIds.includes(beatId)) set.add(p.id);
  }
  return [...set];
}

export function npcIdsForBeat(vw: VisualWorldContract, beatId: string, bindingNpcIds: string[]): string[] {
  const set = new Set(bindingNpcIds);
  for (const g of vw.npcGroups) {
    if (g.requiredBeatIds.includes(beatId)) set.add(g.id);
  }
  return [...set];
}

export function linkedEntityIdsForBeat<T extends { id: string; requiredBeatIds: string[] }>(
  entities: readonly T[],
  beatId: string,
  bindingIds: readonly string[],
): string[] {
  const set = new Set<string>(bindingIds);
  for (const e of entities) {
    if (e.requiredBeatIds.includes(beatId)) set.add(e.id);
  }
  return [...set];
}
