/**
 * P1.3 — Panel Prompt Recipe Builder
 *
 * Construit une "recette de prompt" à partir d'un `PanelGenerationIntent`.
 * La recette décrit précisément quels blocs de prompt doivent être
 * inclus, exclus, ou modifiés pour ce type de panel.
 *
 * Utilisation :
 *   1. Le generation-intent-planner produit un `PanelGenerationIntent`
 *   2. Ce module transforme l'intent en `PromptRecipe`
 *   3. Le manga-prompt-composer consomme la recette pour générer le prompt final
 *
 * Avantages :
 *   - Découple l'intention métier de l'implémentation technique du prompt
 *   - Permet de valider la cohérence de la recette avant génération
 *   - Facilite le débogage et la traçabilité
 */

import type {
  PanelGenerationIntent,
  PanelIntentType,
  DominantSubjectType,
  FramingCategory,
} from "./generation-intent-planner";

// ────────────────────────────────────────────────────────────────────────────
// Types de la recette
// ────────────────────────────────────────────────────────────────────────────

export interface PromptRecipe {
  intentType: PanelIntentType;
  dominantSubject: DominantSubjectType;

  // Blocs à inclure
  includeBlocks: PromptBlockInstruction[];

  // Blocs explicitement interdits
  excludeBlocks: PromptBlockExclusion[];

  // Modifications de blocs existants
  blockOverrides: PromptBlockOverride[];

  // Tokens de cadrage à injecter
  framingTokens: string[];

  // Tokens négatifs à ajouter
  negativeTokens: string[];

  // Priorités d'éléments (pour pondération)
  elementWeights: ElementWeights;

  // Méta-informations pour traçabilité
  recipeVersion: string;
  generatedFrom: string;
}

export interface PromptBlockInstruction {
  blockType: PromptBlockType;
  priority: "critical" | "high" | "medium" | "low";
  content?: string;
  conditions?: string[];
}

export interface PromptBlockExclusion {
  blockType: PromptBlockType;
  reason: string;
}

export interface PromptBlockOverride {
  blockType: PromptBlockType;
  action: "prepend" | "append" | "replace" | "suppress_keywords";
  value: string;
}

export type PromptBlockType =
  | "subject_lock"
  | "character_description"
  | "environment_description"
  | "props_description"
  | "framing_instruction"
  | "composition_guide"
  | "crowd_instruction"
  | "action_verb"
  | "lighting_mood"
  | "negative_prompt"
  | "style_tokens";

export interface ElementWeights {
  character: number;
  environment: number;
  prop: number;
  crowd: number;
  action: number;
  mood: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Mapping intent → recette
// ────────────────────────────────────────────────────────────────────────────

const RECIPE_TEMPLATES: Record<PanelIntentType, Partial<PromptRecipe>> = {
  hero_portrait: {
    includeBlocks: [
      { blockType: "subject_lock", priority: "critical" },
      { blockType: "character_description", priority: "critical" },
      { blockType: "framing_instruction", priority: "high" },
      { blockType: "lighting_mood", priority: "medium" },
    ],
    excludeBlocks: [],
    framingTokens: ["portrait shot", "character centered", "face clearly visible"],
    negativeTokens: [],
    elementWeights: { character: 95, environment: 20, prop: 15, crowd: 5, action: 30, mood: 50 },
  },
  hero_action: {
    includeBlocks: [
      { blockType: "subject_lock", priority: "critical" },
      { blockType: "character_description", priority: "critical" },
      { blockType: "action_verb", priority: "critical" },
      { blockType: "framing_instruction", priority: "high" },
      { blockType: "props_description", priority: "medium" },
    ],
    excludeBlocks: [],
    framingTokens: ["dynamic pose", "action shot", "motion blur optional"],
    negativeTokens: ["static pose", "standing still"],
    elementWeights: { character: 85, environment: 30, prop: 40, crowd: 15, action: 90, mood: 40 },
  },
  hero_duo: {
    includeBlocks: [
      { blockType: "character_description", priority: "critical" },
      { blockType: "framing_instruction", priority: "high" },
      { blockType: "composition_guide", priority: "high" },
    ],
    excludeBlocks: [
      { blockType: "subject_lock", reason: "duo_requires_balanced_focus" },
    ],
    framingTokens: ["two characters visible", "balanced composition", "both readable"],
    negativeTokens: ["single subject centered", "one character only"],
    elementWeights: { character: 90, environment: 25, prop: 20, crowd: 10, action: 50, mood: 45 },
  },
  hero_reaction: {
    includeBlocks: [
      { blockType: "subject_lock", priority: "critical" },
      { blockType: "character_description", priority: "critical" },
      { blockType: "framing_instruction", priority: "high" },
      { blockType: "lighting_mood", priority: "high" },
    ],
    excludeBlocks: [],
    framingTokens: ["close-up", "emotional expression", "face focus"],
    negativeTokens: ["wide shot", "full body"],
    elementWeights: { character: 95, environment: 15, prop: 10, crowd: 5, action: 20, mood: 70 },
  },
  npc_focus: {
    includeBlocks: [
      { blockType: "character_description", priority: "critical" },
      { blockType: "framing_instruction", priority: "high" },
    ],
    excludeBlocks: [
      { blockType: "subject_lock", reason: "npc_focus_no_hero_lock" },
    ],
    framingTokens: ["npc centered", "supporting character focus"],
    negativeTokens: ["hero panel", "protagonist centered"],
    elementWeights: { character: 85, environment: 30, prop: 25, crowd: 20, action: 40, mood: 45 },
  },
  enemy_focus: {
    includeBlocks: [
      { blockType: "character_description", priority: "critical" },
      { blockType: "framing_instruction", priority: "high" },
      { blockType: "lighting_mood", priority: "high" },
    ],
    excludeBlocks: [
      { blockType: "subject_lock", reason: "enemy_focus_no_hero_lock" },
    ],
    framingTokens: ["antagonist centered", "menacing framing", "dramatic lighting"],
    negativeTokens: ["hero panel", "protagonist centered", "friendly atmosphere"],
    elementWeights: { character: 90, environment: 25, prop: 30, crowd: 10, action: 50, mood: 60 },
  },
  enemy_reveal: {
    includeBlocks: [
      { blockType: "character_description", priority: "critical" },
      { blockType: "framing_instruction", priority: "critical" },
      { blockType: "lighting_mood", priority: "critical" },
      { blockType: "environment_description", priority: "medium" },
    ],
    excludeBlocks: [
      { blockType: "subject_lock", reason: "enemy_reveal_no_hero_lock" },
    ],
    framingTokens: ["dramatic reveal", "silhouette emerging", "ominous entrance"],
    negativeTokens: ["hero panel", "protagonist centered", "bright cheerful"],
    elementWeights: { character: 80, environment: 50, prop: 25, crowd: 15, action: 40, mood: 80 },
  },
  ally_focus: {
    includeBlocks: [
      { blockType: "character_description", priority: "critical" },
      { blockType: "framing_instruction", priority: "high" },
    ],
    excludeBlocks: [
      { blockType: "subject_lock", reason: "ally_focus_no_hero_lock" },
    ],
    framingTokens: ["ally character centered", "supportive framing"],
    negativeTokens: ["hero panel", "protagonist centered"],
    elementWeights: { character: 85, environment: 30, prop: 25, crowd: 15, action: 40, mood: 45 },
  },
  group_conflict: {
    includeBlocks: [
      { blockType: "character_description", priority: "critical" },
      { blockType: "action_verb", priority: "high" },
      { blockType: "composition_guide", priority: "high" },
      { blockType: "environment_description", priority: "medium" },
    ],
    excludeBlocks: [
      { blockType: "subject_lock", reason: "group_requires_balanced_focus" },
    ],
    framingTokens: ["multiple characters", "conflict scene", "dynamic composition"],
    negativeTokens: ["single subject", "portrait"],
    elementWeights: { character: 75, environment: 40, prop: 35, crowd: 50, action: 85, mood: 55 },
  },
  group_presence: {
    includeBlocks: [
      { blockType: "character_description", priority: "high" },
      { blockType: "composition_guide", priority: "high" },
      { blockType: "environment_description", priority: "medium" },
    ],
    excludeBlocks: [
      { blockType: "subject_lock", reason: "group_requires_balanced_focus" },
    ],
    framingTokens: ["group shot", "multiple figures", "ensemble framing"],
    negativeTokens: ["single subject centered", "portrait"],
    elementWeights: { character: 70, environment: 45, prop: 25, crowd: 65, action: 35, mood: 40 },
  },
  guard_presence: {
    includeBlocks: [
      { blockType: "crowd_instruction", priority: "critical" },
      { blockType: "environment_description", priority: "high" },
      { blockType: "props_description", priority: "high" },
      { blockType: "composition_guide", priority: "medium" },
    ],
    excludeBlocks: [
      { blockType: "subject_lock", reason: "guard_panel_no_hero_lock" },
      { blockType: "character_description", reason: "guards_are_anonymous" },
    ],
    framingTokens: ["guards in formation", "patrol shot", "security presence"],
    negativeTokens: ["hero panel", "protagonist centered", "main character foreground", "face close-up"],
    elementWeights: { character: 30, environment: 50, prop: 45, crowd: 85, action: 40, mood: 50 },
  },
  crowd_cutaway: {
    includeBlocks: [
      { blockType: "crowd_instruction", priority: "critical" },
      { blockType: "environment_description", priority: "high" },
      { blockType: "composition_guide", priority: "medium" },
    ],
    excludeBlocks: [
      { blockType: "subject_lock", reason: "crowd_cutaway_no_hero_lock" },
      { blockType: "character_description", reason: "crowd_is_anonymous" },
    ],
    framingTokens: ["crowd scene", "mass of people", "anonymous faces"],
    negativeTokens: ["hero panel", "protagonist centered", "single subject", "portrait"],
    elementWeights: { character: 20, environment: 45, prop: 20, crowd: 90, action: 30, mood: 45 },
  },
  reaction_cutaway: {
    includeBlocks: [
      { blockType: "framing_instruction", priority: "critical" },
      { blockType: "lighting_mood", priority: "high" },
    ],
    excludeBlocks: [
      { blockType: "subject_lock", reason: "reaction_cutaway_not_hero_focused" },
    ],
    framingTokens: ["reaction shot", "emotional response", "observer perspective"],
    negativeTokens: ["hero panel", "protagonist centered"],
    elementWeights: { character: 60, environment: 35, prop: 20, crowd: 30, action: 20, mood: 70 },
  },
  prop_insert: {
    includeBlocks: [
      { blockType: "props_description", priority: "critical" },
      { blockType: "framing_instruction", priority: "critical" },
      { blockType: "lighting_mood", priority: "medium" },
    ],
    excludeBlocks: [
      { blockType: "subject_lock", reason: "prop_insert_no_character_focus" },
      { blockType: "character_description", reason: "prop_is_the_subject" },
      { blockType: "crowd_instruction", reason: "prop_insert_no_crowd" },
    ],
    framingTokens: ["object insert", "prop close-up", "item focus"],
    negativeTokens: ["hero panel", "character centered", "portrait", "crowd scene"],
    elementWeights: { character: 10, environment: 25, prop: 95, crowd: 5, action: 15, mood: 40 },
  },
  environment_establishing: {
    includeBlocks: [
      { blockType: "environment_description", priority: "critical" },
      { blockType: "framing_instruction", priority: "critical" },
      { blockType: "lighting_mood", priority: "high" },
      { blockType: "composition_guide", priority: "medium" },
    ],
    excludeBlocks: [
      { blockType: "subject_lock", reason: "environment_no_character_focus" },
      { blockType: "character_description", reason: "environment_is_the_subject" },
    ],
    framingTokens: ["establishing shot", "wide angle", "location reveal", "architectural focus"],
    negativeTokens: ["hero panel", "character centered", "portrait", "close-up", "face visible"],
    elementWeights: { character: 10, environment: 95, prop: 30, crowd: 25, action: 10, mood: 60 },
  },
  environment_transition: {
    includeBlocks: [
      { blockType: "environment_description", priority: "critical" },
      { blockType: "framing_instruction", priority: "high" },
      { blockType: "lighting_mood", priority: "high" },
    ],
    excludeBlocks: [
      { blockType: "subject_lock", reason: "transition_no_character_focus" },
      { blockType: "character_description", reason: "transition_is_environmental" },
    ],
    framingTokens: ["transition shot", "time passage", "location shift"],
    negativeTokens: ["hero panel", "character centered", "portrait"],
    elementWeights: { character: 5, environment: 90, prop: 20, crowd: 15, action: 10, mood: 70 },
  },
  aftermath: {
    includeBlocks: [
      { blockType: "environment_description", priority: "critical" },
      { blockType: "props_description", priority: "high" },
      { blockType: "lighting_mood", priority: "high" },
      { blockType: "composition_guide", priority: "medium" },
    ],
    excludeBlocks: [
      { blockType: "subject_lock", reason: "aftermath_no_character_focus" },
      { blockType: "character_description", reason: "aftermath_is_environmental" },
    ],
    framingTokens: ["aftermath scene", "consequences visible", "debris and damage"],
    negativeTokens: ["hero panel", "character centered", "action shot", "combat scene"],
    elementWeights: { character: 15, environment: 80, prop: 60, crowd: 20, action: 10, mood: 75 },
  },
  symbolic_insert: {
    includeBlocks: [
      { blockType: "props_description", priority: "critical" },
      { blockType: "framing_instruction", priority: "critical" },
      { blockType: "lighting_mood", priority: "high" },
    ],
    excludeBlocks: [
      { blockType: "subject_lock", reason: "symbolic_no_character_focus" },
      { blockType: "character_description", reason: "symbol_is_the_subject" },
    ],
    framingTokens: ["symbolic shot", "metaphorical image", "visual motif"],
    negativeTokens: ["hero panel", "character centered", "realistic action"],
    elementWeights: { character: 5, environment: 40, prop: 90, crowd: 5, action: 10, mood: 80 },
  },
  magic_manifestation: {
    includeBlocks: [
      { blockType: "props_description", priority: "critical" },
      { blockType: "lighting_mood", priority: "critical" },
      { blockType: "framing_instruction", priority: "high" },
      { blockType: "environment_description", priority: "medium" },
    ],
    excludeBlocks: [],
    framingTokens: ["magical effect", "energy manifestation", "supernatural glow"],
    negativeTokens: ["mundane", "ordinary lighting"],
    elementWeights: { character: 40, environment: 50, prop: 85, crowd: 10, action: 60, mood: 80 },
  },
  dialogue_anchor: {
    includeBlocks: [
      { blockType: "character_description", priority: "critical" },
      { blockType: "framing_instruction", priority: "high" },
      { blockType: "composition_guide", priority: "medium" },
    ],
    excludeBlocks: [],
    framingTokens: ["speaker visible", "dialogue framing", "conversation shot"],
    negativeTokens: ["action shot", "wide establishing"],
    elementWeights: { character: 80, environment: 30, prop: 20, crowd: 15, action: 20, mood: 50 },
  },
};

// ────────────────────────────────────────────────────────────────────────────
// Framing tokens par catégorie
// ────────────────────────────────────────────────────────────────────────────

const FRAMING_CATEGORY_TOKENS: Record<FramingCategory, string[]> = {
  portrait: ["portrait shot", "face centered", "head and shoulders"],
  closeup: ["close-up", "tight framing", "detailed view"],
  medium: ["medium shot", "waist up", "balanced composition"],
  wide: ["wide shot", "full scene visible", "environmental context"],
  establishing: ["establishing shot", "location reveal", "panoramic view"],
  insert: ["insert shot", "detail focus", "object centered"],
  over_shoulder: ["over the shoulder", "POV adjacent", "conversational framing"],
  splash: ["splash page", "dramatic full page", "impact moment"],
};

// ────────────────────────────────────────────────────────────────────────────
// Builder
// ────────────────────────────────────────────────────────────────────────────

export function buildPromptRecipe(intent: PanelGenerationIntent): PromptRecipe {
  const template = RECIPE_TEMPLATES[intent.intentType];

  const baseRecipe: PromptRecipe = {
    intentType: intent.intentType,
    dominantSubject: intent.dominantSubject,
    includeBlocks: template?.includeBlocks ?? [],
    excludeBlocks: template?.excludeBlocks ?? [],
    blockOverrides: [],
    framingTokens: [
      ...(template?.framingTokens ?? []),
      ...FRAMING_CATEGORY_TOKENS[intent.cameraIntent] ?? [],
    ],
    negativeTokens: [
      ...(template?.negativeTokens ?? []),
      ...intent.forbiddenPromptTokens,
    ],
    elementWeights: template?.elementWeights ?? {
      character: 50,
      environment: 50,
      prop: 50,
      crowd: 50,
      action: 50,
      mood: 50,
    },
    recipeVersion: "1.0.0",
    generatedFrom: `intent:${intent.panelId}`,
  };

  // Ajouter les overrides basés sur la hiérarchie visuelle
  if (intent.visualHierarchy.foreground.length > 0) {
    baseRecipe.blockOverrides.push({
      blockType: "composition_guide",
      action: "prepend",
      value: `foreground: ${intent.visualHierarchy.foreground.join(", ")}`,
    });
  }
  if (intent.visualHierarchy.background.some((s) => s.includes("silhouette"))) {
    baseRecipe.blockOverrides.push({
      blockType: "character_description",
      action: "suppress_keywords",
      value: "detailed face, prominent features, centered",
    });
  }

  // Ajouter les exclusions des entités supprimées
  for (const suppressed of intent.suppressedEntities) {
    if (suppressed.entityType === "clause") {
      baseRecipe.blockOverrides.push({
        blockType: "subject_lock",
        action: "suppress_keywords",
        value: suppressed.label,
      });
    }
  }

  return baseRecipe;
}

export function validatePromptRecipe(recipe: PromptRecipe): {
  valid: boolean;
  warnings: string[];
  errors: string[];
} {
  const warnings: string[] = [];
  const errors: string[] = [];

  // Vérifier cohérence include vs exclude
  const includedTypes = new Set(recipe.includeBlocks.map((b) => b.blockType));
  const excludedTypes = new Set(recipe.excludeBlocks.map((b) => b.blockType));

  for (const type of includedTypes) {
    if (excludedTypes.has(type)) {
      errors.push(`Block '${type}' is both included and excluded`);
    }
  }

  // Vérifier que les poids sont dans la plage valide
  for (const [key, value] of Object.entries(recipe.elementWeights)) {
    if (value < 0 || value > 100) {
      warnings.push(`Weight '${key}' is out of range (0-100): ${value}`);
    }
  }

  // Vérifier la cohérence des tokens négatifs vs positifs
  for (const negToken of recipe.negativeTokens) {
    for (const posToken of recipe.framingTokens) {
      if (negToken.toLowerCase().includes(posToken.toLowerCase()) ||
          posToken.toLowerCase().includes(negToken.toLowerCase())) {
        warnings.push(`Potential conflict: negative '${negToken}' vs framing '${posToken}'`);
      }
    }
  }

  // Vérifier que les panels non-hero n'ont pas de subject_lock
  if (recipe.dominantSubject !== "hero" && recipe.dominantSubject !== "duo") {
    const hasSubjectLock = recipe.includeBlocks.some((b) => b.blockType === "subject_lock");
    const isExcluded = recipe.excludeBlocks.some((b) => b.blockType === "subject_lock");
    if (hasSubjectLock && !isExcluded) {
      warnings.push(`Non-hero panel (${recipe.dominantSubject}) has subject_lock included`);
    }
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
  };
}

export function getRecipeDebugInfo(recipe: PromptRecipe): string {
  const lines: string[] = [
    `Recipe for ${recipe.intentType} (dominant: ${recipe.dominantSubject})`,
    `Include: ${recipe.includeBlocks.map((b) => b.blockType).join(", ")}`,
    `Exclude: ${recipe.excludeBlocks.map((b) => b.blockType).join(", ")}`,
    `Framing: ${recipe.framingTokens.slice(0, 3).join(", ")}...`,
    `Negative: ${recipe.negativeTokens.slice(0, 3).join(", ")}...`,
    `Weights: char=${recipe.elementWeights.character} env=${recipe.elementWeights.environment} prop=${recipe.elementWeights.prop}`,
  ];
  return lines.join("\n");
}
