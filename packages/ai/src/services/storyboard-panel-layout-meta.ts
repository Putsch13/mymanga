import type { StoryboardRenderMode } from "../contracts/storyboard-plan";

/** Valeurs sémantiques alignées FAL / `resolveDimensionsFromAspectRatio` (workflow). */
export type StoryboardTargetAspectSemantic = "portrait" | "landscape" | "square";

export interface StoryboardPanelLayoutMeta {
  layoutHint: string;
  targetAspectRatio: StoryboardTargetAspectSemantic;
  /** Identifiant de slot éditorial (souvent égal à `renderMode`, ex. `hero_closeup`). */
  slotType: string;
}

const PORTRAIT_MODES = new Set<StoryboardRenderMode>([
  "hero_closeup",
  "reaction_closeup",
  "npc_closeup",
  "enemy_closeup",
  "threat_silhouette",
]);

const LANDSCAPE_MODES = new Set<StoryboardRenderMode>([
  "establishing_environment",
  "silent_transition",
  "creature_reveal",
  "enemy_reveal",
  "surveillance_reveal",
  "group_tension",
  "combat_aftermath",
  "combat_exchange",
]);

/**
 * Déduit cadrage / ratio cible / type de slot à partir du `renderMode` storyboard,
 * avant tout appel FAL (PATCH 8).
 */
export function inferStoryboardPanelLayoutMeta(renderMode: StoryboardRenderMode): StoryboardPanelLayoutMeta {
  if (PORTRAIT_MODES.has(renderMode)) {
    return {
      layoutHint: "vertical_hero_focus",
      targetAspectRatio: "portrait",
      slotType: renderMode,
    };
  }
  if (LANDSCAPE_MODES.has(renderMode)) {
    return {
      layoutHint: "wide_stage",
      targetAspectRatio: "landscape",
      slotType: renderMode,
    };
  }
  if (renderMode === "insert_object") {
    return { layoutHint: "object_square", targetAspectRatio: "square", slotType: "insert_object" };
  }
  if (
    renderMode === "dialogue_two_shot" ||
    renderMode === "dialogue_over_shoulder" ||
    renderMode === "aftermath_dialogue"
  ) {
    return { layoutHint: "dialogue_balance", targetAspectRatio: "square", slotType: renderMode };
  }
  return { layoutHint: "generic_panel", targetAspectRatio: "square", slotType: renderMode };
}
