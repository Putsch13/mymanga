/**
 * Score de cohérence personnage (MVP heuristique — brancher vision API ensuite).
 */
export type ConsistencyDimensions = {
  face: number;
  hair: number;
  eyes: number;
  silhouette: number;
  outfit: number;
  accessories: number;
  currentInjury: number;
  palette: number;
  perceivedAge: number;
};

export function averageConsistencyScore(d: ConsistencyDimensions): number {
  const values = Object.values(d);
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function mockScoreFromFlags(flags: { hasRefs: boolean; samePalette: boolean }): ConsistencyDimensions {
  const base = flags.hasRefs ? 0.75 : 0.45;
  return {
    face: base,
    hair: base + (flags.hasRefs ? 0.05 : -0.1),
    eyes: base,
    silhouette: base,
    outfit: base,
    accessories: base - 0.05,
    currentInjury: flags.samePalette ? 0.8 : 0.6,
    palette: flags.samePalette ? 0.85 : 0.55,
    perceivedAge: base,
  };
}
