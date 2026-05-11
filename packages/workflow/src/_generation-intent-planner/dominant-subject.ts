import type { DominantSubjectType, PanelIntentType, PanelPlanInput } from "./types";

export function resolveDominantSubject(
  intentType: PanelIntentType,
  panel: PanelPlanInput,
): DominantSubjectType {
  switch (intentType) {
    case "hero_portrait":
    case "hero_action":
    case "hero_reaction":
      return "hero";
    case "hero_duo":
      return "duo";
    case "enemy_focus":
    case "enemy_reveal":
      return "enemy";
    case "ally_focus":
      return "ally";
    case "npc_focus":
    case "dialogue_anchor":
      return "npc";
    case "group_conflict":
    case "group_presence":
      return "group";
    case "guard_presence":
      return "guard_group";
    case "crowd_cutaway":
      return "crowd";
    case "prop_insert":
    case "symbolic_insert":
    case "magic_manifestation":
      return "prop";
    case "aftermath":
      return "aftermath";
    case "environment_establishing":
    case "environment_transition":
      return "environment";
    case "reaction_cutaway":
      return panel.heroCenterAllowed ? "hero" : "npc";
    default:
      return "environment";
  }
}
