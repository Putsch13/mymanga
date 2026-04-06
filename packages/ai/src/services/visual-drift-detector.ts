/**
 * Visual Drift Detector — scoring heuristique post-génération.
 *
 * Vérifie que le prompt injecté et les métadonnées du panel sont cohérents
 * avec les traits visuels attendus des personnages. Score 0–100.
 */

export interface DriftCheckInput {
  prompt: string;
  characters: Array<{
    name: string;
    gender: string | null;
    hairColor: string | null;
    eyeColor: string | null;
    bodyDetails: string | null;
    appearance: string | null;
  }>;
  usedLoras: boolean;
  usedRefs: boolean;
}

export interface DriftCheckResult {
  score: number;
  pass: boolean;
  issues: string[];
}

const TRAIT_WEIGHT = 15;

function normalize(value: string): string {
  return value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function promptContains(prompt: string, trait: string): boolean {
  const normalizedPrompt = normalize(prompt);
  const normalizedTrait = normalize(trait);
  if (!normalizedTrait || normalizedTrait.length < 2) return true;
  return normalizedPrompt.includes(normalizedTrait);
}

export function detectVisualDrift(input: DriftCheckInput): DriftCheckResult {
  let score = 100;
  const issues: string[] = [];

  if (input.usedLoras) score = Math.min(score + 10, 100);
  if (input.usedRefs) score = Math.min(score + 5, 100);

  for (const character of input.characters) {
    if (character.gender && !promptContains(input.prompt, character.gender === "male" ? "male" : "female")) {
      score -= TRAIT_WEIGHT;
      issues.push(`${character.name}: gender "${character.gender}" absent du prompt`);
    }

    if (character.hairColor && !promptContains(input.prompt, character.hairColor)) {
      score -= TRAIT_WEIGHT;
      issues.push(`${character.name}: hairColor "${character.hairColor}" absent du prompt`);
    }

    if (character.eyeColor && !promptContains(input.prompt, character.eyeColor)) {
      score -= TRAIT_WEIGHT;
      issues.push(`${character.name}: eyeColor "${character.eyeColor}" absent du prompt`);
    }

    if (character.bodyDetails) {
      const keyTerms = character.bodyDetails.split(",").map((t) => t.trim()).filter((t) => t.length > 3);
      for (const term of keyTerms.slice(0, 3)) {
        if (!promptContains(input.prompt, term)) {
          score -= Math.floor(TRAIT_WEIGHT / 2);
          issues.push(`${character.name}: bodyDetail "${term}" absent du prompt`);
        }
      }
    }
  }

  if (!input.usedLoras && !input.usedRefs) {
    score -= 10;
    issues.push("Ni LoRA ni ref image utilisés — risque de dérive élevé");
  }

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    pass: score >= 60,
    issues,
  };
}
