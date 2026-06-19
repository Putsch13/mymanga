export const COLOR_TOKENS = [
  "black",
  "white",
  "blonde",
  "blond",
  "brown",
  "red",
  "blue",
  "green",
  "purple",
  "pink",
  "silver",
  "grey",
  "gray",
  "gold",
  "orange",
];

export const MALE_TOKENS = ["male", "man", "boy", "masculine"];
export const FEMALE_TOKENS = ["female", "woman", "girl", "feminine"];

export function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function includesWord(text: string, words: string[]) {
  return words.some((word) => new RegExp(`\\b${word}\\b`).test(text));
}

export function splitTraitPhrases(value: string | null | undefined, limit = 3) {
  if (!value) return [];
  return value
    .split(/[;,/]| and | with /i)
    .map((part) => normalize(part))
    .filter((part) => part.length >= 3)
    .slice(0, limit);
}

export function promptContainsTrait(prompt: string, trait: string): boolean {
  const normalizedTrait = normalize(trait);
  if (!normalizedTrait || normalizedTrait.length < 2) return true;
  if (prompt.includes(normalizedTrait)) return true;
  const traitTokens = normalizedTrait.split(" ").filter((token) => token.length >= 3);
  if (traitTokens.length === 0) return true;
  const matched = traitTokens.filter((token) => prompt.includes(token));
  return matched.length / traitTokens.length >= 0.66;
}

export function findContextualColor(prompt: string, contexts: string[]) {
  for (const context of contexts) {
    for (const color of COLOR_TOKENS) {
      const patterns = [
        `${color} ${context}`,
        `${context} ${color}`,
        `${color} ${context}s`,
        `${context}s ${color}`,
      ];
      if (patterns.some((pattern) => prompt.includes(pattern))) {
        return color;
      }
    }
  }
  return null;
}
