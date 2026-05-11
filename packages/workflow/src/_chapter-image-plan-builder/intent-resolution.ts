import type { ImageIntentType } from "@manga-ai-studio/core";

import type {
  ChapterBeatPlanInput,
  ChapterPanelPlanInput,
} from "./types";

const HERO_ROLE_RE = /hero|protagon|main_hero|h[eé]ros/i;
const ENEMY_ROLE_RE = /antagon|villain|rival|boss|enemy|ennemi/i;

export function hasHero(roles: string[]): boolean {
  return roles.some((r) => HERO_ROLE_RE.test(r));
}

export function hasEnemy(roles: string[]): boolean {
  return roles.some((r) => ENEMY_ROLE_RE.test(r));
}

/**
 * Résout le `imageIntentType` à partir des signaux du panel et du beat.
 * Ordre de priorité :
 *   1. cutawayType explicite (environment / prop / reaction / crowd / aftermath)
 *   2. group / guards / soldiers signals
 *   3. enemy_reveal / enemy_focus si ennemi dominant
 *   4. combat signals (turning_point > exchange)
 *   5. duo (hero + other)
 *   6. dialogue
 *   7. hero_action / hero_emotion / hero_focus par défaut si héros seul
 *   8. fallback = npc_focus si personnage non-héros
 *   9. environment_establishing si rien
 */
export function resolveImageIntent(
  panel: ChapterPanelPlanInput,
  beat: ChapterBeatPlanInput,
): ImageIntentType {
  const cutaway = (panel.cutawayType ?? "").toLowerCase();
  const focus = (panel.subjectFocus ?? "").toLowerCase();
  const roles = panel.panelCharacterRoles ?? [];
  const npcCount =
    (panel.npcPresence?.length ?? 0) + (panel.npcGroupPresence?.length ?? 0);
  const hero = hasHero(roles);
  const enemy = hasEnemy(roles);
  const beatType = (panel.beatType ?? beat.beatType ?? "").toLowerCase();

  if (cutaway === "environment" || cutaway === "environment_establishing") {
    return "environment_establishing";
  }
  if (cutaway === "location_transition") return "environment_transition";
  if (cutaway === "prop_insert" || cutaway === "object_insert") return "prop_insert";
  if (cutaway === "reaction" || cutaway === "reaction_insert") return "reaction_cutaway";
  if (cutaway === "aftermath" || cutaway === "movement_trace") return "aftermath";
  if (cutaway === "crowd") return "crowd_presence";
  if (cutaway === "npc_group" || cutaway === "surveillance") return "guard_group_focus";
  if (cutaway === "threat_insert") return "threat_presence";

  if (focus === "magic" || /magic|spell|sort|rune/.test(beatType)) {
    return "magic_manifestation";
  }
  if (focus === "symbol" || /symbol|omen|pr[ée]sage/.test(beatType)) {
    return "symbolic_insert";
  }

  if (/crowd|foule|audience|masses/.test(focus)) return "crowd_presence";
  if (/guard|soldier|patrol|military/.test(focus)) {
    if (focus.includes("patrol")) return "soldier_patrol";
    return "guard_group_focus";
  }
  if (focus === "group" && npcCount >= 3) return "group_presence";

  if (/turning_point|finisher|climax/.test(beatType) && (hero || enemy)) {
    return "combat_turning_point";
  }
  if (/combat|fight|duel|clash/.test(beatType) && hero && enemy) {
    return "combat_exchange";
  }

  if (focus === "enemy" || focus === "antagonist") {
    if (/reveal|introduction/.test(beatType)) return "enemy_reveal";
    return "enemy_focus";
  }

  if (hero && roles.length >= 2) {
    if (/dialog|talk|conversation|\btalk\b/.test(beatType)) return "dialogue_two_shot";
    return "hero_secondary_character";
  }

  if (focus === "ally") return "ally_focus";

  if (hero && roles.length === 1) {
    if (/action|combat|run|attack/.test(beatType)) return "hero_action";
    if (/emotion|reaction|react/.test(beatType) || panel.shotType === "closeup") {
      return "hero_emotion";
    }
    if (/duo/.test(beatType)) return "hero_duo";
    return "hero_focus";
  }

  if (focus === "npc" || focus === "important_npc") return "npc_focus";
  if (roles.length >= 1 && !hero) return "secondary_character_focus";

  if (/dialog|talk|conversation/.test(beatType)) return "dialogue_anchor";

  return "environment_establishing";
}
