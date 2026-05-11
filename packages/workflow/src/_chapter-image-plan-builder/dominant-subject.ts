import type { ImageIntentType } from "@manga-ai-studio/core";

export function resolveDominantSubjectForIntent(intent: ImageIntentType): string {
  switch (intent) {
    case "hero_focus":
    case "hero_action":
    case "hero_emotion":
    case "hero_reaction":
      return "hero";
    case "hero_duo":
    case "hero_secondary_character":
    case "dialogue_two_shot":
      return "duo";
    case "enemy_focus":
    case "enemy_reveal":
      return "enemy";
    case "ally_focus":
      return "ally";
    case "npc_focus":
    case "secondary_character_focus":
      return "npc";
    case "guard_group_focus":
    case "soldier_patrol":
    case "threat_group_focus":
      return "guard_group";
    case "crowd_presence":
      return "crowd";
    case "group_conflict":
    case "group_presence":
      return "group";
    case "environment_establishing":
    case "environment_transition":
      return "environment";
    case "prop_insert":
    case "symbolic_insert":
      return "prop";
    case "reaction_cutaway":
      return "reaction";
    case "aftermath":
      return "aftermath";
    case "magic_manifestation":
      return "prop";
    case "combat_exchange":
    case "combat_turning_point":
    case "threat_presence":
      return "duo";
    case "dialogue_anchor":
      return "hero";
  }
}
