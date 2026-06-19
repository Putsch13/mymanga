import type { ImageIntentType } from "@manga-ai-studio/core";

export interface IntentPriorities {
  environment: number;
  character: number;
  npc: number;
  prop: number;
  group: number;
}

/** Hiérarchie visuelle (0–100) appliquée à chaque intent. */
export function prioritiesForIntent(intent: ImageIntentType): IntentPriorities {
  if (
    intent === "environment_establishing"
    || intent === "environment_transition"
  ) {
    return { environment: 90, character: 20, npc: 10, prop: 25, group: 5 };
  }
  if (intent === "prop_insert" || intent === "symbolic_insert") {
    return { environment: 40, character: 5, npc: 5, prop: 95, group: 0 };
  }
  if (intent === "magic_manifestation") {
    return { environment: 55, character: 35, npc: 5, prop: 85, group: 0 };
  }
  if (intent === "aftermath") {
    return { environment: 85, character: 20, npc: 20, prop: 40, group: 20 };
  }
  if (intent === "reaction_cutaway") {
    return { environment: 25, character: 70, npc: 40, prop: 15, group: 0 };
  }
  if (
    intent === "guard_group_focus"
    || intent === "soldier_patrol"
    || intent === "threat_group_focus"
  ) {
    return { environment: 45, character: 15, npc: 25, prop: 35, group: 90 };
  }
  if (intent === "crowd_presence" || intent === "group_presence") {
    return { environment: 55, character: 15, npc: 25, prop: 15, group: 85 };
  }
  if (intent === "group_conflict") {
    return { environment: 40, character: 40, npc: 25, prop: 30, group: 80 };
  }
  if (intent === "enemy_focus" || intent === "enemy_reveal") {
    return { environment: 40, character: 85, npc: 5, prop: 20, group: 5 };
  }
  if (intent === "npc_focus" || intent === "secondary_character_focus") {
    return { environment: 40, character: 80, npc: 70, prop: 20, group: 5 };
  }
  if (
    intent === "hero_duo"
    || intent === "hero_secondary_character"
    || intent === "dialogue_two_shot"
  ) {
    return { environment: 35, character: 85, npc: 40, prop: 15, group: 5 };
  }
  if (intent === "combat_exchange" || intent === "combat_turning_point") {
    return { environment: 35, character: 80, npc: 15, prop: 40, group: 25 };
  }
  if (intent === "threat_presence") {
    return { environment: 40, character: 65, npc: 25, prop: 30, group: 40 };
  }
  if (intent === "dialogue_anchor") {
    return { environment: 35, character: 80, npc: 30, prop: 15, group: 5 };
  }
  if (intent === "ally_focus") {
    return { environment: 35, character: 85, npc: 55, prop: 15, group: 5 };
  }
  // Hero-centric default
  return { environment: 35, character: 90, npc: 15, prop: 20, group: 5 };
}
