import {
  FEMALE_TOKENS,
  MALE_TOKENS,
  findContextualColor,
  includesWord,
  normalize,
  promptContainsTrait,
  splitTraitPhrases,
} from "./text-utils";
import { pushConflictingTrait, pushMissingTrait } from "./trait-collectors";
import type { CharacterDriftInput, DriftTraitMismatch } from "./types";

export interface CharacterCheckContext {
  normalizedPrompt: string;
  usedRefs: boolean;
  usedLoras: boolean;
}

export interface CharacterCheckOutcome {
  scoreDelta: number;
  characterScoreDelta: number;
  hardTraitsMissing: number;
}

/**
 * Vérifie un personnage contre le prompt normalisé. Met à jour les listes de
 * traits manquants/conflictuels et renvoie les pénalités cumulées.
 */
export function checkCharacter(
  character: CharacterDriftInput,
  context: CharacterCheckContext,
  reasons: string[],
  missingTraits: DriftTraitMismatch[],
  conflictingTraits: DriftTraitMismatch[],
): CharacterCheckOutcome {
  const { normalizedPrompt } = context;
  let scoreDelta = 0;
  let characterScoreDelta = 0;
  let hardTraitsMissing = 0;

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
      scoreDelta -= 10;
      characterScoreDelta -= 10;
      pushMissingTrait(
        missingTraits,
        reasons,
        character.name,
        "gender",
        character.gender,
        `genre attendu "${character.gender}" non explicite`,
      );
    }
    if (includesWord(normalizedPrompt, oppositeTerms)) {
      scoreDelta -= 25;
      characterScoreDelta -= 25;
      pushConflictingTrait(
        conflictingTraits,
        reasons,
        character.name,
        "gender",
        character.gender,
        oppositeTerms.find((term) => normalizedPrompt.includes(term)) ?? null,
        `genre contradictoire détecté dans le prompt`,
      );
    }
  }

  if (character.hairColor) {
    const expectedHair = normalize(character.hairColor);
    if (!promptContainsTrait(normalizedPrompt, expectedHair)) {
      scoreDelta -= 12;
      characterScoreDelta -= 12;
      pushMissingTrait(
        missingTraits,
        reasons,
        character.name,
        "hairColor",
        character.hairColor,
        `couleur de cheveux "${character.hairColor}" absente`,
      );
    }
    const actualHairColor = findContextualColor(normalizedPrompt, [
      "hair",
      "haired",
      "haircolor",
      "hair color",
    ]);
    if (actualHairColor && actualHairColor !== expectedHair && !expectedHair.includes(actualHairColor)) {
      scoreDelta -= 18;
      characterScoreDelta -= 18;
      pushConflictingTrait(
        conflictingTraits,
        reasons,
        character.name,
        "hairColor",
        character.hairColor,
        actualHairColor,
        `couleur de cheveux contradictoire "${actualHairColor}"`,
      );
    }
  }

  if (character.eyeColor) {
    const expectedEye = normalize(character.eyeColor);
    if (!promptContainsTrait(normalizedPrompt, expectedEye)) {
      scoreDelta -= 10;
      characterScoreDelta -= 10;
      pushMissingTrait(
        missingTraits,
        reasons,
        character.name,
        "eyeColor",
        character.eyeColor,
        `couleur d'yeux "${character.eyeColor}" absente`,
      );
    }
    const actualEyeColor = findContextualColor(normalizedPrompt, ["eyes", "eye", "iris"]);
    if (actualEyeColor && actualEyeColor !== expectedEye && !expectedEye.includes(actualEyeColor)) {
      scoreDelta -= 15;
      characterScoreDelta -= 15;
      pushConflictingTrait(
        conflictingTraits,
        reasons,
        character.name,
        "eyeColor",
        character.eyeColor,
        actualEyeColor,
        `couleur d'yeux contradictoire "${actualEyeColor}"`,
      );
    }
  }

  for (const anchor of visualAnchors.slice(0, 5)) {
    if (!promptContainsTrait(normalizedPrompt, anchor)) {
      const penalty = anchor === normalize(character.canonSignatureText ?? "") ? 10 : 6;
      scoreDelta -= penalty;
      characterScoreDelta -= penalty;
      pushMissingTrait(
        missingTraits,
        reasons,
        character.name,
        "visualAnchor",
        anchor,
        `trait visuel "${anchor}" non retrouvé`,
      );
    }
  }

  if (character.canonicalReferenceAvailable && !context.usedRefs && !context.usedLoras) {
    scoreDelta -= 12;
    reasons.push(`${character.name}: référence canonique disponible mais aucun lock visuel utilisé`);
  }

  const forbiddenRules = Array.isArray(character.forbiddenVisualDrift)
    ? character.forbiddenVisualDrift.map((item) => normalize(item)).filter(Boolean)
    : [];
  for (const forbidden of forbiddenRules.slice(0, 3)) {
    if (promptContainsTrait(normalizedPrompt, forbidden)) {
      scoreDelta -= 20;
      characterScoreDelta -= 20;
      pushConflictingTrait(
        conflictingTraits,
        reasons,
        character.name,
        "forbiddenVisualDrift",
        forbidden,
        forbidden,
        `règle de drift interdite détectée: "${forbidden}"`,
      );
    }
  }

  const hardTraits = Array.isArray(character.hardTraits) ? character.hardTraits : [];
  for (const hardTrait of hardTraits.slice(0, 5)) {
    const normalized = normalize(hardTrait);
    if (!promptContainsTrait(normalizedPrompt, normalized)) {
      scoreDelta -= 15;
      characterScoreDelta -= 15;
      hardTraitsMissing += 1;
      pushMissingTrait(
        missingTraits,
        reasons,
        character.name,
        "hardTrait",
        hardTrait,
        `hard trait "${hardTrait}" absent du prompt`,
      );
    }
  }

  return { scoreDelta, characterScoreDelta, hardTraitsMissing };
}
