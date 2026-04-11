/**
 * Visual Drift Detector — scoring heuristique symbolique post-génération.
 *
 * Sans analyse image réelle, cette version croise prompt, signature canonique,
 * refs disponibles et traits critiques personnages pour exposer un drift lisible.
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
    outfitDefault?: string | null;
    wardrobeDetails?: string | null;
    canonSignatureText?: string | null;
    forbiddenVisualDrift?: string[] | null;
    canonicalReferenceAvailable?: boolean;
    paletteSignature?: string | null;
    accessorySignature?: string | null;
  }>;
  usedLoras: boolean;
  usedRefs: boolean;
}

export type DriftSeverity = "none" | "low" | "medium" | "high" | "critical";

export interface DriftTraitMismatch {
  characterName: string;
  trait: string;
  expected: string;
  actual?: string | null;
  reason: string;
}

export interface DriftCheckResult {
  score: number;
  driftScore: number;
  pass: boolean;
  severity: DriftSeverity;
  issues: string[];
  reasons: string[];
  missingTraits: DriftTraitMismatch[];
  conflictingTraits: DriftTraitMismatch[];
}

const COLOR_TOKENS = [
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

const MALE_TOKENS = ["male", "man", "boy", "masculine"];
const FEMALE_TOKENS = ["female", "woman", "girl", "feminine"];

function normalize(value: string): string {
  return value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function includesWord(text: string, words: string[]) {
  return words.some((word) => text.includes(` ${word} `) || text.startsWith(`${word} `) || text.endsWith(` ${word}`) || text === word);
}

function splitTraitPhrases(value: string | null | undefined, limit = 3) {
  if (!value) return [];
  return value
    .split(/[;,/]| and | with /i)
    .map((part) => normalize(part))
    .filter((part) => part.length >= 3)
    .slice(0, limit);
}

function promptContainsTrait(prompt: string, trait: string): boolean {
  const normalizedTrait = normalize(trait);
  if (!normalizedTrait || normalizedTrait.length < 2) return true;
  if (prompt.includes(normalizedTrait)) return true;
  const traitTokens = normalizedTrait.split(" ").filter((token) => token.length >= 3);
  if (traitTokens.length === 0) return true;
  const matched = traitTokens.filter((token) => prompt.includes(token));
  return matched.length / traitTokens.length >= 0.66;
}

function findContextualColor(prompt: string, contexts: string[]) {
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

function scoreToSeverity(score: number): DriftSeverity {
  if (score >= 85) return "none";
  if (score >= 70) return "low";
  if (score >= 50) return "medium";
  if (score >= 30) return "high";
  return "critical";
}

function pushMissingTrait(
  list: DriftTraitMismatch[],
  reasons: string[],
  characterName: string,
  trait: string,
  expected: string,
  reason: string,
) {
  list.push({ characterName, trait, expected, reason });
  reasons.push(`${characterName}: ${reason}`);
}

function pushConflictingTrait(
  list: DriftTraitMismatch[],
  reasons: string[],
  characterName: string,
  trait: string,
  expected: string,
  actual: string | null | undefined,
  reason: string,
) {
  list.push({ characterName, trait, expected, actual: actual ?? null, reason });
  reasons.push(`${characterName}: ${reason}`);
}

export function detectVisualDrift(input: DriftCheckInput): DriftCheckResult {
  const normalizedPrompt = normalize(input.prompt);
  let score = 100;
  const reasons: string[] = [];
  const missingTraits: DriftTraitMismatch[] = [];
  const conflictingTraits: DriftTraitMismatch[] = [];

  if (input.usedLoras) score = Math.min(score + 8, 100);
  if (input.usedRefs) score = Math.min(score + 7, 100);

  for (const character of input.characters) {
    const visualAnchors = [
      ...splitTraitPhrases(character.appearance, 2),
      ...splitTraitPhrases(character.bodyDetails, 2),
      ...splitTraitPhrases(character.outfitDefault ?? null, 2),
      ...splitTraitPhrases(character.wardrobeDetails ?? null, 2),
      ...splitTraitPhrases(character.accessorySignature ?? null, 1),
      ...splitTraitPhrases(character.paletteSignature ?? null, 1),
      ...splitTraitPhrases(character.canonSignatureText ?? null, 2),
    ].filter((value, index, all) => all.indexOf(value) === index);

    if (character.gender) {
      const expectedGender = normalize(character.gender);
      const matchingTerms = expectedGender === "male" ? MALE_TOKENS : FEMALE_TOKENS;
      const oppositeTerms = expectedGender === "male" ? FEMALE_TOKENS : MALE_TOKENS;
      if (!includesWord(normalizedPrompt, matchingTerms)) {
        score -= 10;
        pushMissingTrait(missingTraits, reasons, character.name, "gender", character.gender, `genre attendu "${character.gender}" non explicite`);
      }
      if (includesWord(normalizedPrompt, oppositeTerms)) {
        score -= 25;
        pushConflictingTrait(conflictingTraits, reasons, character.name, "gender", character.gender, oppositeTerms.find((term) => normalizedPrompt.includes(term)) ?? null, `genre contradictoire détecté dans le prompt`);
      }
    }

    if (character.hairColor) {
      const expectedHair = normalize(character.hairColor);
      if (!promptContainsTrait(normalizedPrompt, expectedHair)) {
        score -= 12;
        pushMissingTrait(missingTraits, reasons, character.name, "hairColor", character.hairColor, `couleur de cheveux "${character.hairColor}" absente`);
      }
      const actualHairColor = findContextualColor(normalizedPrompt, ["hair", "haired", "haircolor", "hair color"]);
      if (actualHairColor && actualHairColor !== expectedHair && !expectedHair.includes(actualHairColor)) {
        score -= 18;
        pushConflictingTrait(conflictingTraits, reasons, character.name, "hairColor", character.hairColor, actualHairColor, `couleur de cheveux contradictoire "${actualHairColor}"`);
      }
    }

    if (character.eyeColor) {
      const expectedEye = normalize(character.eyeColor);
      if (!promptContainsTrait(normalizedPrompt, expectedEye)) {
        score -= 10;
        pushMissingTrait(missingTraits, reasons, character.name, "eyeColor", character.eyeColor, `couleur d'yeux "${character.eyeColor}" absente`);
      }
      const actualEyeColor = findContextualColor(normalizedPrompt, ["eyes", "eye", "iris"]);
      if (actualEyeColor && actualEyeColor !== expectedEye && !expectedEye.includes(actualEyeColor)) {
        score -= 15;
        pushConflictingTrait(conflictingTraits, reasons, character.name, "eyeColor", character.eyeColor, actualEyeColor, `couleur d'yeux contradictoire "${actualEyeColor}"`);
      }
    }

    for (const anchor of visualAnchors.slice(0, 5)) {
      if (!promptContainsTrait(normalizedPrompt, anchor)) {
        score -= anchor === normalize(character.canonSignatureText ?? "") ? 10 : 6;
        pushMissingTrait(missingTraits, reasons, character.name, "visualAnchor", anchor, `trait visuel "${anchor}" non retrouvé`);
      }
    }

    if (character.canonicalReferenceAvailable && !input.usedRefs && !input.usedLoras) {
      score -= 12;
      reasons.push(`${character.name}: référence canonique disponible mais aucun lock visuel utilisé`);
    }

    const forbiddenRules = Array.isArray(character.forbiddenVisualDrift)
      ? character.forbiddenVisualDrift.map((item) => normalize(item)).filter(Boolean)
      : [];
    for (const forbidden of forbiddenRules.slice(0, 3)) {
      if (promptContainsTrait(normalizedPrompt, forbidden)) {
        score -= 20;
        pushConflictingTrait(conflictingTraits, reasons, character.name, "forbiddenVisualDrift", forbidden, forbidden, `règle de drift interdite détectée: "${forbidden}"`);
      }
    }
  }

  if (!input.usedLoras && !input.usedRefs) {
    score -= 8;
    reasons.push("Ni LoRA ni ref image utilisés: verrou visuel faible");
  }

  score = Math.max(0, Math.min(100, score));
  const severity = scoreToSeverity(score);
  const pass = score >= 60 && conflictingTraits.length === 0;
  const issues = reasons.slice(0, 8);

  return {
    score,
    driftScore: score,
    pass,
    severity,
    issues,
    reasons,
    missingTraits,
    conflictingTraits,
  };
}
