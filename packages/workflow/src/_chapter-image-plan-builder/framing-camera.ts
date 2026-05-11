import type { ImageIntentType } from "@manga-ai-studio/core";

import type { ChapterPanelPlanInput } from "./types";

export function resolveFramingIntent(
  intent: ImageIntentType,
  panel: ChapterPanelPlanInput,
): string {
  const shot = (panel.shotType ?? "").toLowerCase();
  if (shot === "wide" || shot === "establishing") return "wide";
  if (shot === "extreme_closeup") return "extreme_closeup";
  if (shot === "closeup") return "closeup";
  if (shot === "over_shoulder") return "over_shoulder";
  if (shot === "medium") return "medium";

  if (intent === "environment_establishing") return "wide";
  if (intent === "prop_insert" || intent === "symbolic_insert") return "insert";
  if (intent === "reaction_cutaway" || intent === "hero_emotion") return "closeup";
  if (
    intent === "guard_group_focus"
    || intent === "crowd_presence"
    || intent === "group_conflict"
  ) {
    return "medium";
  }
  if (
    intent === "hero_duo"
    || intent === "hero_secondary_character"
    || intent === "dialogue_two_shot"
  ) {
    return "medium";
  }
  return "medium";
}

export function resolveCameraIntent(
  intent: ImageIntentType,
  panel: ChapterPanelPlanInput,
): string {
  if (panel.cameraAngle) return panel.cameraAngle;
  if (intent === "threat_presence" || intent === "enemy_reveal") return "low_angle";
  if (intent === "environment_establishing") return "high_angle";
  return "eye_level";
}
