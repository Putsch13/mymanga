import type { ShotCategory, ShotPlanDistribution, ShotPlanEntry } from "./types";

export function computeDistribution(entries: ShotPlanEntry[]): ShotPlanDistribution {
  const byCategory: Record<ShotCategory, number> = {
    hero_lead: 0,
    hero_duo: 0,
    enemy_focus: 0,
    ally_focus: 0,
    npc_focus: 0,
    group_or_crowd: 0,
    environment_wide: 0,
    environment_insert: 0,
    prop_insert: 0,
    reaction_cutaway: 0,
    aftermath: 0,
    dialogue_anchor: 0,
    other: 0,
  };
  const shotSet = new Set<string>();
  let cutaways = 0;
  for (const e of entries) {
    byCategory[e.category]++;
    shotSet.add(e.shotType);
    if (
      e.category === "environment_insert" ||
      e.category === "prop_insert" ||
      e.category === "reaction_cutaway" ||
      e.category === "aftermath"
    ) {
      cutaways++;
    }
  }
  const total = entries.length;
  const heroLead = byCategory.hero_lead;
  return {
    totalPanels: total,
    byCategory,
    heroLeadRatio: total === 0 ? 0 : heroLead / total,
    cutawayRatio: total === 0 ? 0 : cutaways / total,
    uniqueShotTypes: shotSet.size,
    environmentPanels: byCategory.environment_wide + byCategory.environment_insert,
    npcPanels: byCategory.npc_focus + byCategory.group_or_crowd,
    propInsertPanels: byCategory.prop_insert,
    reactionPanels: byCategory.reaction_cutaway,
  };
}
