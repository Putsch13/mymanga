import type { PromptRecipe } from "./types";

export function validatePromptRecipe(recipe: PromptRecipe): {
  valid: boolean;
  warnings: string[];
  errors: string[];
} {
  const warnings: string[] = [];
  const errors: string[] = [];

  const includedTypes = new Set(recipe.includeBlocks.map((b) => b.blockType));
  const excludedTypes = new Set(recipe.excludeBlocks.map((b) => b.blockType));

  for (const type of includedTypes) {
    if (excludedTypes.has(type)) {
      errors.push(`Block '${type}' is both included and excluded`);
    }
  }

  for (const [key, value] of Object.entries(recipe.elementWeights)) {
    if (value < 0 || value > 100) {
      warnings.push(`Weight '${key}' is out of range (0-100): ${value}`);
    }
  }

  for (const negToken of recipe.negativeTokens) {
    for (const posToken of recipe.framingTokens) {
      if (
        negToken.toLowerCase().includes(posToken.toLowerCase()) ||
        posToken.toLowerCase().includes(negToken.toLowerCase())
      ) {
        warnings.push(
          `Potential conflict: negative '${negToken}' vs framing '${posToken}'`,
        );
      }
    }
  }

  if (recipe.dominantSubject !== "hero" && recipe.dominantSubject !== "duo") {
    const hasSubjectLock = recipe.includeBlocks.some(
      (b) => b.blockType === "subject_lock",
    );
    const isExcluded = recipe.excludeBlocks.some(
      (b) => b.blockType === "subject_lock",
    );
    if (hasSubjectLock && !isExcluded) {
      warnings.push(
        `Non-hero panel (${recipe.dominantSubject}) has subject_lock included`,
      );
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
