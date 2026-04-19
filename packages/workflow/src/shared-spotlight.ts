/**
 * P2.1 — Shared Spotlight Mode
 *
 * Gère les panels où le héros partage l'attention visuelle avec un autre personnage.
 * Au lieu de forcer un "subject lock" sur le héros, ce module calcule une composition
 * équilibrée où les deux personnages sont lisibles.
 *
 * Cas d'usage :
 *   - Duo héros + allié (dialogue, marche côte à côte)
 *   - Confrontation héros vs ennemi
 *   - Héros guidé/protégé par un PNJ
 *   - Scène de révélation avec un personnage important
 *
 * Sorties :
 *   - `SharedSpotlightConfig` : configuration de composition pour le prompt composer
 *   - `SpotlightBalanceScore` : score de "qui domine visuellement" (P2.2)
 */

import type { DominantSubjectType, FramingCategory } from "./generation-intent-planner";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface SharedSpotlightConfig {
  mode: SpotlightMode;
  primaryCharacterId: string;
  secondaryCharacterId: string;
  balanceRatio: number;
  compositionType: CompositionType;
  framingRecommendation: FramingCategory;
  promptModifiers: SpotlightPromptModifiers;
  subjectLockBehavior: SubjectLockBehavior;
}

export type SpotlightMode =
  | "HERO_DOMINANT"
  | "EQUAL_SPOTLIGHT"
  | "OTHER_DOMINANT"
  | "HERO_FOREGROUND_OTHER_BACKGROUND"
  | "OTHER_FOREGROUND_HERO_BACKGROUND";

export type CompositionType =
  | "side_by_side"
  | "facing_each_other"
  | "over_shoulder"
  | "hero_foreground"
  | "other_foreground"
  | "diagonal_split"
  | "vertical_split";

export type SubjectLockBehavior =
  | "lock_hero_only"
  | "lock_both"
  | "lock_other_only"
  | "no_lock";

export interface SpotlightPromptModifiers {
  heroPositionTokens: string[];
  otherPositionTokens: string[];
  compositionTokens: string[];
  forbiddenTokens: string[];
}

export interface CharacterSpotlightInput {
  characterId: string;
  name: string;
  role: "hero" | "antagonist" | "ally" | "deuteragonist" | "important_npc" | "extra";
  importanceTier: "HERO" | "PRIMARY_CAST" | "IMPORTANT_NPC" | "BACKGROUND_EXTRA";
  isActiveInBeat: boolean;
  isSpeaker: boolean;
  isSubjectOfAction: boolean;
}

export interface SharedSpotlightInput {
  panelType: string;
  beatType: string;
  subjectFocus: string | null;
  shotType: string;
  heroCharacter: CharacterSpotlightInput;
  otherCharacter: CharacterSpotlightInput;
  narrativeContext: NarrativeContext;
}

export interface NarrativeContext {
  isDramaticConflict: boolean;
  isEmotionalMoment: boolean;
  isDialogueExchange: boolean;
  isActionSequence: boolean;
  heroIsReacting: boolean;
  otherIsReacting: boolean;
}

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────

const ANTAGONIST_CONFRONTATION_COMPOSITIONS: CompositionType[] = [
  "facing_each_other",
  "diagonal_split",
];

const ALLY_COLLABORATION_COMPOSITIONS: CompositionType[] = [
  "side_by_side",
  "over_shoulder",
];

const DIALOGUE_COMPOSITIONS: CompositionType[] = [
  "over_shoulder",
  "side_by_side",
  "facing_each_other",
];

// ────────────────────────────────────────────────────────────────────────────
// Balance calculation
// ────────────────────────────────────────────────────────────────────────────

export function calculateSpotlightBalance(input: SharedSpotlightInput): number {
  let heroWeight = 50;

  const { heroCharacter, otherCharacter, narrativeContext, subjectFocus, beatType } = input;

  // subjectFocus explicite
  if (subjectFocus === "hero") heroWeight += 25;
  else if (subjectFocus === "enemy" || subjectFocus === "npc" || subjectFocus === "ally") {
    heroWeight -= 25;
  }

  // Qui parle ?
  if (heroCharacter.isSpeaker && !otherCharacter.isSpeaker) heroWeight += 15;
  else if (!heroCharacter.isSpeaker && otherCharacter.isSpeaker) heroWeight -= 15;

  // Qui agit ?
  if (heroCharacter.isSubjectOfAction && !otherCharacter.isSubjectOfAction) heroWeight += 10;
  else if (!heroCharacter.isSubjectOfAction && otherCharacter.isSubjectOfAction) heroWeight -= 10;

  // Importance narrative de l'autre
  if (otherCharacter.importanceTier === "PRIMARY_CAST") heroWeight -= 5;
  if (otherCharacter.role === "antagonist") heroWeight -= 10;
  if (otherCharacter.role === "deuteragonist") heroWeight -= 15;

  // Contexte narratif
  if (narrativeContext.isDramaticConflict && otherCharacter.role === "antagonist") {
    heroWeight -= 10;
  }
  if (narrativeContext.heroIsReacting && !narrativeContext.otherIsReacting) {
    heroWeight -= 5;
  }
  if (narrativeContext.otherIsReacting && !narrativeContext.heroIsReacting) {
    heroWeight += 5;
  }

  // Beat type influence
  if (beatType === "reveal" && otherCharacter.role === "antagonist") {
    heroWeight -= 20;
  }
  if (beatType === "dialogue" && otherCharacter.isSpeaker) {
    heroWeight -= 10;
  }

  return Math.max(0, Math.min(100, heroWeight));
}

export function resolveSpotlightMode(balance: number): SpotlightMode {
  if (balance >= 70) return "HERO_DOMINANT";
  if (balance >= 55) return "HERO_FOREGROUND_OTHER_BACKGROUND";
  if (balance >= 45) return "EQUAL_SPOTLIGHT";
  if (balance >= 30) return "OTHER_FOREGROUND_HERO_BACKGROUND";
  return "OTHER_DOMINANT";
}

// ────────────────────────────────────────────────────────────────────────────
// Composition selection
// ────────────────────────────────────────────────────────────────────────────

export function selectCompositionType(
  input: SharedSpotlightInput,
  mode: SpotlightMode,
): CompositionType {
  const { otherCharacter, narrativeContext, shotType } = input;

  // Confrontation antagoniste
  if (otherCharacter.role === "antagonist" && narrativeContext.isDramaticConflict) {
    return ANTAGONIST_CONFRONTATION_COMPOSITIONS[0]!;
  }

  // Dialogue
  if (narrativeContext.isDialogueExchange) {
    if (shotType === "over_shoulder") return "over_shoulder";
    return DIALOGUE_COMPOSITIONS[Math.floor(Math.random() * DIALOGUE_COMPOSITIONS.length)]!;
  }

  // Collaboration ally
  if (otherCharacter.role === "ally" || otherCharacter.role === "deuteragonist") {
    return ALLY_COLLABORATION_COMPOSITIONS[0]!;
  }

  // Par défaut selon le mode
  switch (mode) {
    case "HERO_DOMINANT":
    case "HERO_FOREGROUND_OTHER_BACKGROUND":
      return "hero_foreground";
    case "OTHER_DOMINANT":
    case "OTHER_FOREGROUND_HERO_BACKGROUND":
      return "other_foreground";
    default:
      return "side_by_side";
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Subject lock behavior
// ────────────────────────────────────────────────────────────────────────────

export function resolveSubjectLockBehavior(
  mode: SpotlightMode,
  otherCharacter: CharacterSpotlightInput,
): SubjectLockBehavior {
  switch (mode) {
    case "HERO_DOMINANT":
      return "lock_hero_only";
    case "OTHER_DOMINANT":
      if (otherCharacter.importanceTier === "PRIMARY_CAST") return "lock_other_only";
      return "no_lock";
    case "EQUAL_SPOTLIGHT":
      if (otherCharacter.importanceTier === "PRIMARY_CAST") return "lock_both";
      return "lock_hero_only";
    case "HERO_FOREGROUND_OTHER_BACKGROUND":
      return "lock_hero_only";
    case "OTHER_FOREGROUND_HERO_BACKGROUND":
      if (otherCharacter.importanceTier === "PRIMARY_CAST") return "lock_other_only";
      return "no_lock";
    default:
      return "lock_hero_only";
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Prompt modifiers
// ────────────────────────────────────────────────────────────────────────────

function buildPromptModifiers(
  input: SharedSpotlightInput,
  mode: SpotlightMode,
  composition: CompositionType,
): SpotlightPromptModifiers {
  const heroName = input.heroCharacter.name;
  const otherName = input.otherCharacter.name;

  const heroPositionTokens: string[] = [];
  const otherPositionTokens: string[] = [];
  const compositionTokens: string[] = [];
  const forbiddenTokens: string[] = [];

  // Composition tokens
  switch (composition) {
    case "side_by_side":
      compositionTokens.push("two characters side by side", "equal framing", "balanced composition");
      heroPositionTokens.push(`${heroName} on one side`);
      otherPositionTokens.push(`${otherName} on other side`);
      forbiddenTokens.push("single subject centered");
      break;
    case "facing_each_other":
      compositionTokens.push("characters facing each other", "confrontation framing", "eye contact possible");
      heroPositionTokens.push(`${heroName} facing`);
      otherPositionTokens.push(`${otherName} facing`);
      forbiddenTokens.push("characters looking away", "back to camera");
      break;
    case "over_shoulder":
      compositionTokens.push("over the shoulder shot", "conversation framing");
      if (mode === "HERO_DOMINANT" || mode === "HERO_FOREGROUND_OTHER_BACKGROUND") {
        heroPositionTokens.push(`${heroName} visible, foreground shoulder`);
        otherPositionTokens.push(`${otherName} in background, partially visible`);
      } else {
        otherPositionTokens.push(`${otherName} visible, foreground shoulder`);
        heroPositionTokens.push(`${heroName} in background, partially visible`);
      }
      break;
    case "hero_foreground":
      compositionTokens.push("hero foreground, other background");
      heroPositionTokens.push(`${heroName} prominent, foreground`, "larger scale");
      otherPositionTokens.push(`${otherName} smaller, background`);
      break;
    case "other_foreground":
      compositionTokens.push("other character foreground, hero background");
      otherPositionTokens.push(`${otherName} prominent, foreground`, "larger scale");
      heroPositionTokens.push(`${heroName} smaller, background`);
      break;
    case "diagonal_split":
      compositionTokens.push("diagonal composition", "dynamic split");
      heroPositionTokens.push(`${heroName} in one diagonal half`);
      otherPositionTokens.push(`${otherName} in other diagonal half`);
      forbiddenTokens.push("static centered composition");
      break;
    case "vertical_split":
      compositionTokens.push("vertical split composition");
      heroPositionTokens.push(`${heroName} in one half`);
      otherPositionTokens.push(`${otherName} in other half`);
      break;
  }

  // Mode-specific adjustments
  switch (mode) {
    case "HERO_DOMINANT":
      heroPositionTokens.push("hero clearly readable", "protagonist prominent");
      forbiddenTokens.push("hero obscured", "hero in shadow");
      break;
    case "OTHER_DOMINANT":
      otherPositionTokens.push("other character clearly readable", "other character prominent");
      forbiddenTokens.push("other character obscured");
      break;
    case "EQUAL_SPOTLIGHT":
      compositionTokens.push("both characters equally visible", "balanced prominence");
      forbiddenTokens.push("one character dominating", "one character obscured");
      break;
  }

  return {
    heroPositionTokens,
    otherPositionTokens,
    compositionTokens,
    forbiddenTokens,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Main builder
// ────────────────────────────────────────────────────────────────────────────

export function buildSharedSpotlightConfig(
  input: SharedSpotlightInput,
): SharedSpotlightConfig {
  const balance = calculateSpotlightBalance(input);
  const mode = resolveSpotlightMode(balance);
  const composition = selectCompositionType(input, mode);
  const subjectLockBehavior = resolveSubjectLockBehavior(mode, input.otherCharacter);
  const promptModifiers = buildPromptModifiers(input, mode, composition);

  let framingRecommendation: FramingCategory = "medium";
  if (input.shotType === "closeup" || input.shotType === "extreme_closeup") {
    framingRecommendation = "closeup";
  } else if (input.shotType === "wide") {
    framingRecommendation = "wide";
  } else if (input.shotType === "over_shoulder") {
    framingRecommendation = "over_shoulder";
  }

  return {
    mode,
    primaryCharacterId: balance >= 50 ? input.heroCharacter.characterId : input.otherCharacter.characterId,
    secondaryCharacterId: balance >= 50 ? input.otherCharacter.characterId : input.heroCharacter.characterId,
    balanceRatio: balance / 100,
    compositionType: composition,
    framingRecommendation,
    promptModifiers,
    subjectLockBehavior,
  };
}

export function isSharedSpotlightNeeded(
  heroCharacterId: string | null,
  characterIds: string[],
  dominantSubject: DominantSubjectType,
): boolean {
  if (!heroCharacterId) return false;
  if (!characterIds.includes(heroCharacterId)) return false;
  if (dominantSubject === "hero" && characterIds.length === 1) return false;

  const nonHeroCount = characterIds.filter((id) => id !== heroCharacterId).length;
  return nonHeroCount === 1 && (dominantSubject === "duo" || dominantSubject === "hero");
}

export function getSharedSpotlightDebugInfo(config: SharedSpotlightConfig): string {
  return [
    `Spotlight Mode: ${config.mode}`,
    `Balance: ${Math.round(config.balanceRatio * 100)}% hero`,
    `Composition: ${config.compositionType}`,
    `Lock behavior: ${config.subjectLockBehavior}`,
    `Primary: ${config.primaryCharacterId}`,
    `Secondary: ${config.secondaryCharacterId}`,
  ].join(" | ");
}
