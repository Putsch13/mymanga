/**
 * Petits helpers partagés entre les sous-modules de `chapter-studio-helpers`.
 *
 * Volontairement minimal pour rester réutilisable et éviter d'embarquer toute
 * la chaîne `chapter-studio` dans des modules transverses.
 */

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function sum(numbers: number[]): number {
  return numbers.reduce((acc, value) => acc + value, 0);
}
