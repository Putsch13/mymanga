import type { HeroPresenceMode, ImageIntentType } from "@manga-ai-studio/core";

export interface HeroPresenceResult {
  mode: HeroPresenceMode;
  weight: number;
}

export function resolveHeroPresence(
  intent: ImageIntentType,
  hasHeroInPanel: boolean,
): HeroPresenceResult {
  if (!hasHeroInPanel) return { mode: "absent", weight: 0 };

  if (
    intent === "hero_focus"
    || intent === "hero_action"
    || intent === "hero_emotion"
    || intent === "hero_reaction"
  ) {
    return { mode: "primary", weight: 0.9 };
  }
  if (
    intent === "hero_duo"
    || intent === "hero_secondary_character"
    || intent === "dialogue_two_shot"
    || intent === "combat_exchange"
    || intent === "combat_turning_point"
  ) {
    return { mode: "primary", weight: 0.5 };
  }
  if (
    intent === "environment_establishing"
    || intent === "environment_transition"
  ) {
    return { mode: "silhouette", weight: 0.15 };
  }
  if (
    intent === "prop_insert"
    || intent === "symbolic_insert"
    || intent === "aftermath"
  ) {
    return { mode: "absent", weight: 0 };
  }
  if (
    intent === "guard_group_focus"
    || intent === "soldier_patrol"
    || intent === "crowd_presence"
    || intent === "enemy_focus"
    || intent === "enemy_reveal"
    || intent === "npc_focus"
    || intent === "secondary_character_focus"
    || intent === "threat_presence"
  ) {
    return { mode: "secondary", weight: 0.3 };
  }
  return { mode: "primary", weight: 0.7 };
}
