/**
 * P1.3 — Panel Prompt Recipe Builder (façade)
 *
 * Construit une "recette de prompt" à partir d'un `PanelGenerationIntent`.
 * La recette décrit précisément quels blocs de prompt doivent être inclus,
 * exclus, ou modifiés pour ce type de panel.
 *
 * Implémentation découpée en sous-modules `_prompt-recipe-builder/*`.
 */

export type {
  PromptRecipe,
  PromptBlockInstruction,
  PromptBlockExclusion,
  PromptBlockOverride,
  PromptBlockType,
  ElementWeights,
} from "./_prompt-recipe-builder/types";

export { buildPromptRecipe } from "./_prompt-recipe-builder/builder";
export {
  validatePromptRecipe,
  getRecipeDebugInfo,
} from "./_prompt-recipe-builder/validator";
