import type { CharacterCastInfo, PanelIntentType, PanelPlanInput } from "./types";

export function resolveIntentType(
  panel: PanelPlanInput,
  heroCharacterId: string | null,
  castMap: Map<string, CharacterCastInfo>,
): PanelIntentType {
  const { subjectFocus, cutawayType, characterIds, shotType, npcGroupPresence, creaturePresence } = panel;

  if (cutawayType === "environment" || cutawayType === "environment_establishing") {
    return "environment_establishing";
  }
  if (cutawayType === "location_transition") return "environment_transition";
  if (cutawayType === "prop_insert" || cutawayType === "object_insert") return "prop_insert";
  if (cutawayType === "aftermath" || cutawayType === "movement_trace") return "aftermath";
  if (cutawayType === "reaction" || cutawayType === "reaction_insert") return "reaction_cutaway";
  if (cutawayType === "crowd") return "crowd_cutaway";
  if (cutawayType === "npc_group" || cutawayType === "surveillance") return "guard_presence";
  if (cutawayType === "enemy" || cutawayType === "enemy_reveal") return "enemy_reveal";

  if (subjectFocus === "environment" || subjectFocus === "aftermath") return "environment_establishing";
  if (subjectFocus === "prop") return "prop_insert";
  if (subjectFocus === "reaction") return "reaction_cutaway";
  if (subjectFocus === "enemy" || subjectFocus === "antagonist") {
    return shotType === "closeup" || shotType === "extreme_closeup" ? "enemy_focus" : "enemy_reveal";
  }
  if (subjectFocus === "npc" || subjectFocus === "important_npc") return "npc_focus";
  if (subjectFocus === "group") {
    if (npcGroupPresence.length > 0 || /guard|soldier|patrol/i.test(panel.caption)) {
      return "guard_presence";
    }
    return "group_presence";
  }

  const heroInCast = heroCharacterId && characterIds.includes(heroCharacterId);
  const nonHeroCount = characterIds.filter((id) => id !== heroCharacterId).length;

  if (subjectFocus === "hero" || (heroInCast && characterIds.length === 1)) {
    if (shotType === "closeup" || shotType === "extreme_closeup") return "hero_portrait";
    if (/action|combat|fight/i.test(panel.beatType)) return "hero_action";
    return "hero_portrait";
  }

  if (heroInCast && nonHeroCount === 1) {
    const otherId = characterIds.find((id) => id !== heroCharacterId);
    const otherChar = otherId ? castMap.get(otherId) : null;
    if (otherChar?.role === "antagonist") return "hero_duo";
    if (otherChar?.role === "ally" || otherChar?.role === "deuteragonist") return "hero_duo";
    return "hero_duo";
  }

  if (heroInCast && nonHeroCount > 1) return "group_conflict";

  if (characterIds.length === 1) {
    const char = castMap.get(characterIds[0]!);
    if (char?.role === "antagonist") return "enemy_focus";
    return "npc_focus";
  }

  if (characterIds.length > 1) return "group_presence";

  if (npcGroupPresence.length > 0) return "guard_presence";
  if (creaturePresence.length > 0) return "crowd_cutaway";

  return "environment_establishing";
}
