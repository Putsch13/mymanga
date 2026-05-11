import type { PanelBlueprintPremium } from "@manga-ai-studio/core";

import type { ShotCategory } from "./types";

export function categorize(bp: PanelBlueprintPremium): ShotCategory {
  if (bp.cutawayType === "prop_insert" || bp.cutawayType === "object_insert") return "prop_insert";
  if (bp.cutawayType === "environment" || bp.cutawayType === "environment_establishing")
    return "environment_insert";
  if (bp.cutawayType === "reaction" || bp.cutawayType === "reaction_insert")
    return "reaction_cutaway";
  if (bp.cutawayType === "crowd" || bp.cutawayType === "npc_group") return "group_or_crowd";
  if (bp.cutawayType === "aftermath") return "aftermath";

  switch (bp.subjectFocus) {
    case "hero":
      return "hero_lead";
    case "duo":
      return "hero_duo";
    case "enemy":
      return "enemy_focus";
    case "ally":
      return "ally_focus";
    case "npc":
      return "npc_focus";
    case "group":
      return "group_or_crowd";
    case "environment":
    case "location":
      return bp.shotType === "wide" ? "environment_wide" : "environment_insert";
    case "prop":
      return "prop_insert";
    case "reaction":
      return "reaction_cutaway";
    case "aftermath":
      return "aftermath";
    case "speaker":
      return "dialogue_anchor";
    default:
      return "other";
  }
}

const CATEGORY_LABEL: Record<ShotCategory, string> = {
  hero_lead: "héros principal",
  hero_duo: "héros + second",
  enemy_focus: "ennemi",
  ally_focus: "allié",
  npc_focus: "PNJ",
  group_or_crowd: "groupe / foule",
  environment_wide: "décor wide",
  environment_insert: "décor coupe",
  prop_insert: "insert objet",
  reaction_cutaway: "coupe réaction",
  aftermath: "aftermath",
  dialogue_anchor: "plan parlé",
  other: "autre",
};

export function buildHeadline(bp: PanelBlueprintPremium, category: ShotCategory): string {
  const shot = bp.shotType || "medium";
  const catLabel = CATEGORY_LABEL[category];
  const purposeTrimmed = (bp.purpose || "").trim();
  const purpose = purposeTrimmed.length > 80 ? purposeTrimmed.slice(0, 77) + "…" : purposeTrimmed;
  const contractualBadge = bp.contractualCritical ? " ★" : "";
  return `${shot} · ${catLabel}${contractualBadge} — ${purpose || "(panel sans intention explicite)"}`;
}
