/**
 * Visual Drift Detector 2.0 — scoring heuristique symbolique post-génération.
 *
 * Sans analyse image réelle, cette version croise prompt, signature canonique,
 * refs disponibles, hard traits, look profile et intent card pour exposer un drift lisible.
 */

import type { ChapterLookProfile } from "@manga-ai-studio/core";

export interface CharacterDriftInput {
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
  /** Traits durs non négociables — leur absence = character_reroll */
  hardTraits?: string[] | null;
  /** Traits souples */
  softTraits?: string[] | null;
}

export interface DriftCheckInput {
  prompt: string;
  characters: CharacterDriftInput[];
  usedLoras: boolean;
  usedRefs: boolean;
  /** Type de beat narratif de la scène — permet de moduler les pénalités (ex: aftermath tolère les silhouettes) */
  beatEventType?: string | null;
  /** Catégorie de panel — ESTABLISHING_ENVIRONMENT réduit les pénalités de drift personnage */
  panelCategory?: string | null;
  /** Profil look chapitre autoritaire — permet de détecter le style mismatch */
  chapterLookProfile?: ChapterLookProfile | null;
  /** Ancre spatiale de la scène */
  sceneAnchor?: {
    castLineup: string[];
    spatialLayout: string;
    dominantLocation: string;
    characterPositions: Record<string, string>;
  } | null;
  /** Carte d'intention visuelle */
  intentCard?: {
    beatEventType: string;
    motionLevel: number;
    actionIntensity: number;
    mustShow: string[];
    sfxForbiddenTypes?: string[];
  } | null;
}

export type DriftSeverity = "none" | "low" | "medium" | "high" | "critical";

/**
 * Action recommandée après analyse de drift.
 * - keep: aucune action requise, le panel est cohérent
 * - soft_reroll: reroll léger avec lock personnage conservé (LIGHT policy)
 * - character_reroll: reroll ciblé sur le personnage (STRONG policy)
 * - style_reroll: reroll ciblé sur le style (look profile mismatch)
 * - full_reroll: reroll complet nécessaire (trop de conflits)
 * - flag_for_review: signaler en review sans reroll automatique
 */
export type DriftRecommendedAction =
  | "keep"
  | "soft_reroll"
  | "character_reroll"
  | "style_reroll"
  | "full_reroll"
  | "flag_for_review";

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
  /** Score de dérive de style (0–100, 100 = pas de dérive) */
  styleDriftScore: number;
  /** Score de dérive de personnage (0–100, 100 = pas de dérive) */
  characterDriftScore: number;
  /** Score d'alignement beat-image (0–100, 100 = parfaitement aligné) */
  beatAlignmentScore: number;
  /** Score de continuité de scène (0–100, 100 = parfaite continuité) */
  sceneContinuityScore: number;
  pass: boolean;
  severity: DriftSeverity;
  /** True si le look profile du chapitre ne correspond pas au prompt */
  chapterLookMismatch: boolean;
  issues: string[];
  reasons: string[];
  missingTraits: DriftTraitMismatch[];
  conflictingTraits: DriftTraitMismatch[];
  /** Action recommandée pour corriger le drift détecté */
  recommendedAction: DriftRecommendedAction;
  /** Confiance dans le résultat (0–1) */
  confidence: number;
  /** Risque de continuité : true si des traits critiques (genre, couleur cheveux) sont en conflit */
  continuityRisk: boolean;
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

function computeRecommendedAction(
  score: number,
  conflictingTraits: DriftTraitMismatch[],
  missingTraits: DriftTraitMismatch[],
  isEnvironmentPanel: boolean,
  styleDriftScore: number,
  hardTraitsMissing: number,
  chapterLookMismatch: boolean,
): DriftRecommendedAction {
  // Panel décor pur sans personnage important → keep même avec un score moyen
  if (isEnvironmentPanel && conflictingTraits.length === 0 && !chapterLookMismatch) return "keep";

  // Style mismatch fort → style_reroll prioritaire
  if (chapterLookMismatch && styleDriftScore < 40) return "style_reroll";

  // Traits durs manquants (2+) → character_reroll
  if (hardTraitsMissing >= 2) return "character_reroll";

  // Traits critiques en conflit (genre, couleur cheveux) → reroll fort
  const hasCriticalConflict = conflictingTraits.some(
    (t) => t.trait === "gender" || t.trait === "hairColor" || t.trait === "forbiddenVisualDrift",
  );
  if (hasCriticalConflict) return "character_reroll";

  // Score très bas avec plusieurs conflits → reroll complet
  if (score < 30 && conflictingTraits.length >= 2) return "full_reroll";

  // Style mismatch modéré → style_reroll
  if (chapterLookMismatch && styleDriftScore < 60) return "style_reroll";

  // Score bas avec traits manquants → reroll léger avec lock
  if (score < 50 && missingTraits.length >= 2) return "soft_reroll";

  // Score moyen → signaler en review
  if (score < 70) return "flag_for_review";

  return "keep";
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

/** Calculer le styleDriftScore depuis le prompt vs le look profile */
function computeStyleDriftScore(normalizedPrompt: string, lookProfile: ChapterLookProfile | null | undefined): number {
  if (!lookProfile) return 100;

  let styleScore = 100;

  // Vérifier si des familles incompatibles sont présentes dans le prompt
  for (const incompatible of lookProfile.incompatibleFamilies) {
    const normalized = normalize(incompatible);
    if (promptContainsTrait(normalizedPrompt, normalized)) {
      styleScore -= 30;
    }
  }

  // Vérifier si le style family est présent
  const styleFamilyNorm = normalize(lookProfile.styleFamily);
  if (!promptContainsTrait(normalizedPrompt, styleFamilyNorm)) {
    styleScore -= 15;
  }

  return Math.max(0, Math.min(100, styleScore));
}

/** Calculer le beatAlignmentScore depuis le prompt vs l'intent card */
function computeBeatAlignmentScore(
  normalizedPrompt: string,
  intentCard: DriftCheckInput["intentCard"],
): number {
  if (!intentCard) return 100;

  let beatScore = 100;

  // Vérifier les éléments mustShow
  for (const mustShow of (intentCard.mustShow ?? []).slice(0, 3)) {
    const normalized = normalize(mustShow);
    if (!promptContainsTrait(normalizedPrompt, normalized)) {
      beatScore -= 15;
    }
  }

  // Vérifier les SFX interdits
  for (const sfxForbidden of (intentCard.sfxForbiddenTypes ?? [])) {
    const normalized = normalize(sfxForbidden);
    if (promptContainsTrait(normalizedPrompt, normalized)) {
      beatScore -= 20;
    }
  }

  // Si motionLevel élevé mais pas de motion dans le prompt
  if (intentCard.motionLevel >= 7) {
    const hasMotion = /(speed lines|motion blur|dynamic|explosive|burst|impact|movement)/.test(normalizedPrompt);
    if (!hasMotion) {
      beatScore -= 25;
    }
  }

  return Math.max(0, Math.min(100, beatScore));
}

/** Calculer le sceneContinuityScore depuis le prompt vs le scene anchor */
function computeSceneContinuityScore(
  normalizedPrompt: string,
  sceneAnchor: DriftCheckInput["sceneAnchor"],
): number {
  if (!sceneAnchor) return 100;

  let continuityScore = 100;

  // Vérifier que le lieu dominant est présent
  const locationNorm = normalize(sceneAnchor.dominantLocation);
  if (!promptContainsTrait(normalizedPrompt, locationNorm)) {
    continuityScore -= 20;
  }

  // Vérifier que les personnages du cast sont présents
  for (const character of sceneAnchor.castLineup.slice(0, 3)) {
    const charNorm = normalize(character);
    if (!promptContainsTrait(normalizedPrompt, charNorm)) {
      continuityScore -= 10;
    }
  }

  return Math.max(0, Math.min(100, continuityScore));
}

export function detectVisualDrift(input: DriftCheckInput): DriftCheckResult {
  const normalizedPrompt = normalize(input.prompt);
  let score = 100;
  let characterScore = 100;
  const reasons: string[] = [];
  const missingTraits: DriftTraitMismatch[] = [];
  const conflictingTraits: DriftTraitMismatch[] = [];
  let hardTraitsMissing = 0;

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
        characterScore -= 10;
        pushMissingTrait(missingTraits, reasons, character.name, "gender", character.gender, `genre attendu "${character.gender}" non explicite`);
      }
      if (includesWord(normalizedPrompt, oppositeTerms)) {
        score -= 25;
        characterScore -= 25;
        pushConflictingTrait(conflictingTraits, reasons, character.name, "gender", character.gender, oppositeTerms.find((term) => normalizedPrompt.includes(term)) ?? null, `genre contradictoire détecté dans le prompt`);
      }
    }

    if (character.hairColor) {
      const expectedHair = normalize(character.hairColor);
      if (!promptContainsTrait(normalizedPrompt, expectedHair)) {
        score -= 12;
        characterScore -= 12;
        pushMissingTrait(missingTraits, reasons, character.name, "hairColor", character.hairColor, `couleur de cheveux "${character.hairColor}" absente`);
      }
      const actualHairColor = findContextualColor(normalizedPrompt, ["hair", "haired", "haircolor", "hair color"]);
      if (actualHairColor && actualHairColor !== expectedHair && !expectedHair.includes(actualHairColor)) {
        score -= 18;
        characterScore -= 18;
        pushConflictingTrait(conflictingTraits, reasons, character.name, "hairColor", character.hairColor, actualHairColor, `couleur de cheveux contradictoire "${actualHairColor}"`);
      }
    }

    if (character.eyeColor) {
      const expectedEye = normalize(character.eyeColor);
      if (!promptContainsTrait(normalizedPrompt, expectedEye)) {
        score -= 10;
        characterScore -= 10;
        pushMissingTrait(missingTraits, reasons, character.name, "eyeColor", character.eyeColor, `couleur d'yeux "${character.eyeColor}" absente`);
      }
      const actualEyeColor = findContextualColor(normalizedPrompt, ["eyes", "eye", "iris"]);
      if (actualEyeColor && actualEyeColor !== expectedEye && !expectedEye.includes(actualEyeColor)) {
        score -= 15;
        characterScore -= 15;
        pushConflictingTrait(conflictingTraits, reasons, character.name, "eyeColor", character.eyeColor, actualEyeColor, `couleur d'yeux contradictoire "${actualEyeColor}"`);
      }
    }

    for (const anchor of visualAnchors.slice(0, 5)) {
      if (!promptContainsTrait(normalizedPrompt, anchor)) {
        score -= anchor === normalize(character.canonSignatureText ?? "") ? 10 : 6;
        characterScore -= anchor === normalize(character.canonSignatureText ?? "") ? 10 : 6;
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
        characterScore -= 20;
        pushConflictingTrait(conflictingTraits, reasons, character.name, "forbiddenVisualDrift", forbidden, forbidden, `règle de drift interdite détectée: "${forbidden}"`);
      }
    }

    // Hard traits — vérification stricte
    const hardTraits = Array.isArray(character.hardTraits) ? character.hardTraits : [];
    for (const hardTrait of hardTraits.slice(0, 5)) {
      const normalized = normalize(hardTrait);
      if (!promptContainsTrait(normalizedPrompt, normalized)) {
        score -= 15;
        characterScore -= 15;
        hardTraitsMissing += 1;
        pushMissingTrait(missingTraits, reasons, character.name, "hardTrait", hardTrait, `hard trait "${hardTrait}" absent du prompt`);
      }
    }
  }

  if (!input.usedLoras && !input.usedRefs) {
    score -= 8;
    reasons.push("Ni LoRA ni ref image utilisés: verrou visuel faible");
  }

  // Modulation selon le contexte narratif
  const isEnvironmentPanel = input.panelCategory === "ESTABLISHING_ENVIRONMENT"
    || input.panelCategory === "SCENE_BASE";
  const isAftermathBeat = input.beatEventType === "silent_aftermath"
    || input.beatEventType === "post_impact_silence";
  const isCrowdScene = input.panelCategory === "CROWD_SCENE"
    || input.beatEventType === "crowd_reaction";

  if (isEnvironmentPanel) {
    score = Math.min(100, score + 15);
    characterScore = Math.min(100, characterScore + 15);
    if (score < 70) reasons.push("Panel décor : pénalités personnage réduites");
  }

  if (isAftermathBeat) {
    score = Math.min(100, score + 8);
    characterScore = Math.min(100, characterScore + 8);
  }

  if (isCrowdScene) {
    score = Math.min(100, score + 10);
    characterScore = Math.min(100, characterScore + 10);
  }

  score = Math.max(0, Math.min(100, score));
  characterScore = Math.max(0, Math.min(100, characterScore));

  // Calcul des nouveaux scores
  const styleDriftScore = computeStyleDriftScore(normalizedPrompt, input.chapterLookProfile);
  const beatAlignmentScore = computeBeatAlignmentScore(normalizedPrompt, input.intentCard);
  const sceneContinuityScore = computeSceneContinuityScore(normalizedPrompt, input.sceneAnchor);
  const chapterLookMismatch = styleDriftScore < 60;

  // Score global pondéré
  const globalScore = Math.round(
    score * 0.5
    + styleDriftScore * 0.2
    + beatAlignmentScore * 0.2
    + sceneContinuityScore * 0.1,
  );

  const severity = scoreToSeverity(globalScore);
  const pass = globalScore >= 60 && conflictingTraits.length === 0 && !chapterLookMismatch;
  const issues = reasons.slice(0, 8);

  const continuityRisk = conflictingTraits.some(
    (t) => t.trait === "gender" || t.trait === "hairColor",
  );

  // Confiance basée sur la quantité de données disponibles
  const dataPoints = input.characters.length + (input.chapterLookProfile ? 1 : 0) + (input.intentCard ? 1 : 0);
  const confidence = Math.min(1, 0.3 + dataPoints * 0.1 + (input.usedRefs ? 0.2 : 0) + (input.usedLoras ? 0.1 : 0));

  const recommendedAction = computeRecommendedAction(
    globalScore,
    conflictingTraits,
    missingTraits,
    isEnvironmentPanel,
    styleDriftScore,
    hardTraitsMissing,
    chapterLookMismatch,
  );

  return {
    score: globalScore,
    driftScore: globalScore,
    styleDriftScore,
    characterDriftScore: characterScore,
    beatAlignmentScore,
    sceneContinuityScore,
    pass,
    severity,
    chapterLookMismatch,
    issues,
    reasons,
    missingTraits,
    conflictingTraits,
    recommendedAction,
    confidence,
    continuityRisk,
  };
}
