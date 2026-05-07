/**
 * P3.2 — Entity Relegation
 *
 * Détermine quelles entités doivent être reléguées à l'arrière-plan
 * en fonction du sujet dominant du panel.
 *
 * Règles de relégation :
 *   - Sur un panel "guard_group" ou "crowd" : le héros est relégué en silhouette
 *   - Sur un panel "environment" : tous les personnages sont relégués
 *   - Sur un panel "prop" : tous les personnages sont supprimés visuellement
 *   - Sur un panel "enemy" : le héros peut être présent mais pas centré
 *
 * Sorties :
 *   - Liste d'entités à reléguer avec leur mode de relégation
 *   - Tokens de prompt pour appliquer la relégation
 */

import { isHeroRole } from "@manga-ai-studio/core";
import type { DominantSubjectKind } from "./dominant-subject";
import { isAnonymousGroupDominant, shouldExcludeHeroFromComposition } from "./dominant-subject";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export type RelegationMode =
  | "SILHOUETTE"
  | "BACKGROUND_BLUR"
  | "PARTIAL_VISIBLE"
  | "EDGE_OF_FRAME"
  | "FULLY_HIDDEN"
  | "NONE";

export interface RelegatedEntity {
  characterId: string;
  characterName: string;
  role: string;
  relegationMode: RelegationMode;
  reason: string;
  promptTokens: string[];
  negativeTokens: string[];
}

export interface RelegationConfig {
  relegatedEntities: RelegatedEntity[];
  compositionTokens: string[];
  forbiddenCompositionTokens: string[];
  heroVisibilityMode: RelegationMode;
  debugInfo: string;
}

export interface RelegationInput {
  dominantSubjectKind: DominantSubjectKind;
  heroCharacterId: string | null;
  heroCharacterName: string | null;
  presentCharacters: Array<{
    characterId: string;
    name: string;
    role: string;
    isHero: boolean;
    isDominant: boolean;
  }>;
  cutawayType: string | null;
  subjectFocus: string | null;
}

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────

const SILHOUETTE_TOKENS = [
  "silhouette only",
  "backlit figure",
  "not centered",
  "background element",
  "small in frame",
];

const BACKGROUND_BLUR_TOKENS = [
  "background blur",
  "out of focus",
  "depth of field blur",
  "not sharp",
];

const PARTIAL_VISIBLE_TOKENS = [
  "partially visible",
  "edge of frame",
  "cropped",
  "not the main focus",
];

const HERO_NEGATIVE_TOKENS_FOR_CUTAWAY = [
  "hero centered",
  "protagonist foreground",
  "main character large",
  "hero close-up",
  "face filling frame",
  "hero portrait",
  "hero panel",
  "protagonist dominating",
];

// ────────────────────────────────────────────────────────────────────────────
// Core logic
// ────────────────────────────────────────────────────────────────────────────

function determineHeroRelegationMode(
  dominantSubjectKind: DominantSubjectKind,
  cutawayType: string | null,
): RelegationMode {
  if (dominantSubjectKind === "hero") return "NONE";

  if (dominantSubjectKind === "environment" || dominantSubjectKind === "aftermath") {
    return "SILHOUETTE";
  }

  if (dominantSubjectKind === "prop") {
    return "FULLY_HIDDEN";
  }

  if (dominantSubjectKind === "guard_group" || dominantSubjectKind === "crowd") {
    return "SILHOUETTE";
  }

  if (dominantSubjectKind === "enemy" || dominantSubjectKind === "ally" || dominantSubjectKind === "npc") {
    return "BACKGROUND_BLUR";
  }

  if (dominantSubjectKind === "group") {
    return "PARTIAL_VISIBLE";
  }

  if (dominantSubjectKind === "reaction") {
    return "EDGE_OF_FRAME";
  }

  return "NONE";
}

function determineNonHeroRelegationMode(
  dominantSubjectKind: DominantSubjectKind,
  characterRole: string,
  isDominant: boolean,
): RelegationMode {
  if (isDominant) return "NONE";

  if (dominantSubjectKind === "hero") {
    return "BACKGROUND_BLUR";
  }

  if (dominantSubjectKind === "environment" || dominantSubjectKind === "prop" || dominantSubjectKind === "aftermath") {
    return "SILHOUETTE";
  }

  if (dominantSubjectKind === "guard_group" || dominantSubjectKind === "crowd") {
    return "PARTIAL_VISIBLE";
  }

  return "BACKGROUND_BLUR";
}

function buildRelegationTokens(mode: RelegationMode): string[] {
  switch (mode) {
    case "SILHOUETTE":
      return [...SILHOUETTE_TOKENS];
    case "BACKGROUND_BLUR":
      return [...BACKGROUND_BLUR_TOKENS];
    case "PARTIAL_VISIBLE":
      return [...PARTIAL_VISIBLE_TOKENS];
    case "EDGE_OF_FRAME":
      return ["edge of frame", "partial view", "not centered"];
    case "FULLY_HIDDEN":
      return ["not visible", "absent from frame"];
    case "NONE":
      return [];
    default:
      return [];
  }
}

function buildNegativeTokensForMode(mode: RelegationMode, isHero: boolean): string[] {
  if (mode === "NONE") return [];

  if (isHero) {
    return [...HERO_NEGATIVE_TOKENS_FOR_CUTAWAY];
  }

  return [];
}

// ────────────────────────────────────────────────────────────────────────────
// Main builder
// ────────────────────────────────────────────────────────────────────────────

export function buildRelegationConfig(input: RelegationInput): RelegationConfig {
  const { dominantSubjectKind, heroCharacterId, heroCharacterName, presentCharacters, cutawayType } = input;

  const relegatedEntities: RelegatedEntity[] = [];
  let heroVisibilityMode: RelegationMode = "NONE";
  const compositionTokens: string[] = [];
  const forbiddenCompositionTokens: string[] = [];

  for (const char of presentCharacters) {
    let mode: RelegationMode;

    if (char.isHero) {
      mode = determineHeroRelegationMode(dominantSubjectKind, cutawayType);
      heroVisibilityMode = mode;
    } else {
      mode = determineNonHeroRelegationMode(dominantSubjectKind, char.role, char.isDominant);
    }

    if (mode !== "NONE") {
      const promptTokens = buildRelegationTokens(mode);
      const negativeTokens = buildNegativeTokensForMode(mode, char.isHero);

      relegatedEntities.push({
        characterId: char.characterId,
        characterName: char.name,
        role: char.role,
        relegationMode: mode,
        reason: `${char.isHero ? "hero" : char.role}_relegated_on_${dominantSubjectKind}_panel`,
        promptTokens: promptTokens.map((t) => `${char.name}: ${t}`),
        negativeTokens,
      });

      if (char.isHero) {
        forbiddenCompositionTokens.push(...HERO_NEGATIVE_TOKENS_FOR_CUTAWAY);
      }
    }
  }

  switch (dominantSubjectKind) {
    case "environment":
    case "aftermath":
      compositionTokens.push("environment as main subject", "characters minimized");
      break;
    case "prop":
      compositionTokens.push("object as main subject", "no characters prominent");
      break;
    case "guard_group":
    case "crowd":
      compositionTokens.push("anonymous group as main subject", "hero relegated to background");
      break;
    case "enemy":
      compositionTokens.push("antagonist as main focus", "other characters secondary");
      break;
  }

  const debugInfo = [
    `dominant=${dominantSubjectKind}`,
    `heroMode=${heroVisibilityMode}`,
    `relegated=${relegatedEntities.length}`,
    `forbidden=${forbiddenCompositionTokens.length}`,
  ].join(" | ");

  return {
    relegatedEntities,
    compositionTokens,
    forbiddenCompositionTokens,
    heroVisibilityMode,
    debugInfo,
  };
}

export function isHeroRelegated(config: RelegationConfig): boolean {
  return config.heroVisibilityMode !== "NONE";
}

export function getHeroRelegationTokens(config: RelegationConfig): string[] {
  const heroEntity = config.relegatedEntities.find((e) => isHeroRole(e.role));
  return heroEntity?.promptTokens ?? [];
}

export function getAllRelegationPromptTokens(config: RelegationConfig): string[] {
  return config.relegatedEntities.flatMap((e) => e.promptTokens);
}

export function getAllRelegationNegativeTokens(config: RelegationConfig): string[] {
  return [
    ...config.forbiddenCompositionTokens,
    ...config.relegatedEntities.flatMap((e) => e.negativeTokens),
  ];
}
