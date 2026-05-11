import type {
  PanelIntentType,
  DominantSubjectType,
} from "../generation-intent-planner";

export interface PromptRecipe {
  intentType: PanelIntentType;
  dominantSubject: DominantSubjectType;
  includeBlocks: PromptBlockInstruction[];
  excludeBlocks: PromptBlockExclusion[];
  blockOverrides: PromptBlockOverride[];
  framingTokens: string[];
  negativeTokens: string[];
  elementWeights: ElementWeights;
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
