import type { PanelGenerationIntent } from "../generation-intent-planner";
import { FRAMING_CATEGORY_TOKENS } from "./framing-tokens";
import { RECIPE_TEMPLATES } from "./recipe-templates";
import type { PromptRecipe } from "./types";

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
      ...(FRAMING_CATEGORY_TOKENS[intent.cameraIntent] ?? []),
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
