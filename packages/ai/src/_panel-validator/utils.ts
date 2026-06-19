/**
 * Utilitaires de scoring partagés par tous les sous-modules du validateur.
 */
export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function blendScores(
  heuristic: number,
  vision: number | null | undefined,
  confidence = 0.7,
): number {
  if (typeof vision !== "number") return heuristic;
  const weight = clamp01(confidence);
  return clamp01(heuristic * (1 - weight) + vision * weight);
}

export function includesAll(text: string, needles: string[]): number {
  if (needles.length === 0) return 1;
  const matches = needles.filter((needle) => text.includes(needle.toLowerCase()));
  return matches.length / needles.length;
}
