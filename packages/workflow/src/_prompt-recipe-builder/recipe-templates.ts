import type { PanelIntentType } from "../generation-intent-planner";
import type { PromptRecipe } from "./types";

export const RECIPE_TEMPLATES: Record<PanelIntentType, Partial<PromptRecipe>> = {
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
