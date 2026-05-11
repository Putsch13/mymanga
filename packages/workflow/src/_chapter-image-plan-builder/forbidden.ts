import type { ImageIntentType } from "@manga-ai-studio/core";

const HERO_FOCUS_BLOCKED_INTENTS = new Set<ImageIntentType>([
  "environment_establishing",
  "environment_transition",
  "prop_insert",
  "symbolic_insert",
  "aftermath",
  "reaction_cutaway",
  "guard_group_focus",
  "soldier_patrol",
  "crowd_presence",
  "threat_group_focus",
  "threat_presence",
  "enemy_focus",
  "enemy_reveal",
  "npc_focus",
  "secondary_character_focus",
]);

export function forbiddenFocusForIntent(intent: ImageIntentType): string[] {
  if (HERO_FOCUS_BLOCKED_INTENTS.has(intent)) return ["hero_lock", "hero_portrait"];
  return [];
}

export function forbiddenFramingForIntent(intent: ImageIntentType): string[] {
  if (
    intent === "environment_establishing"
    || intent === "environment_transition"
  ) {
    return ["portrait", "extreme_closeup", "closeup"];
  }
  if (intent === "prop_insert" || intent === "symbolic_insert") {
    return ["portrait", "wide"];
  }
  if (
    intent === "guard_group_focus"
    || intent === "soldier_patrol"
    || intent === "crowd_presence"
    || intent === "group_conflict"
    || intent === "group_presence"
  ) {
    return ["portrait", "extreme_closeup"];
  }
  if (
    intent === "hero_duo"
    || intent === "hero_secondary_character"
    || intent === "dialogue_two_shot"
  ) {
    return ["portrait"];
  }
  return [];
}

export function forbiddenPromptClausesForIntent(
  intent: ImageIntentType,
): string[] {
  const base = ["face filling frame"];
  if (intent === "environment_establishing") {
    return [...base, "hero in foreground", "face close up"];
  }
  if (intent === "prop_insert") {
    return [...base, "hero centered", "full body hero"];
  }
  if (intent === "guard_group_focus" || intent === "soldier_patrol") {
    return [...base, "single hero focus", "hero portrait"];
  }
  if (intent === "crowd_presence") {
    return [...base, "hero as main subject"];
  }
  return base;
}
