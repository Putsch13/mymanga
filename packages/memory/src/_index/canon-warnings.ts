/**
 * `detectCanonWarnings` — heuristique simple qui repère les contradictions
 * canoniques évidentes dans un draft (ex : un personnage marqué `dead`
 * mentionné à nouveau dans le script).
 */

export interface DetectCanonWarningsInput {
  characterStatuses: Array<{ name: string; status: string }>;
  scriptText: string;
}

export function detectCanonWarnings(input: DetectCanonWarningsInput): string[] {
  const warnings: string[] = [];

  for (const character of input.characterStatuses) {
    if (
      character.status === "dead" &&
      new RegExp(`\\b${character.name}\\b`, "i").test(input.scriptText)
    ) {
      warnings.push(
        `${character.name} est marqué comme mort mais réapparaît dans le draft.`,
      );
    }
  }

  return warnings;
}
