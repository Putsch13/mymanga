import { z } from "zod";

export const panelCastRoleSchema = z.enum([
  "protagonist",
  "deuteragonist",
  "antagonist",
  "important_npc",
  "recurring_npc",
  "extra",
]);
export type PanelCastRole = z.infer<typeof panelCastRoleSchema>;

export const panelCastMemberSchema = z.object({
  characterId: z.string(),
  name: z.string(),
  role: panelCastRoleSchema,
  importanceTier: z.enum([
    "MAIN_HERO",
    "SECONDARY_CORE",
    "IMPORTANT_SUPPORTING_CHARACTER",
    "RECURRING_NPC",
    "BACKGROUND_EXTRA",
  ]),
  mustBeVisible: z.boolean(),
  isSpeaker: z.boolean(),
  isFocus: z.boolean(),
  isPropCarrier: z.boolean(),
  anchorRefUrl: z.string().nullable(),
  loraTrigger: z.string().nullable(),
});
export type PanelCastMember = z.infer<typeof panelCastMemberSchema>;

export const panelCastSchema = z.object({
  focus: panelCastMemberSchema.nullable(),
  supporting: z.array(panelCastMemberSchema),
  background: z.array(panelCastMemberSchema),
});
export type PanelCast = z.infer<typeof panelCastSchema>;

const ROLE_TYPE_TO_CAST_ROLE: Record<string, PanelCastRole> = {
  hero: "protagonist",
  protagonist: "protagonist",
  main: "protagonist",
  main_hero: "protagonist",
  deuteragonist: "deuteragonist",
  secondary: "deuteragonist",
  antagonist: "antagonist",
  villain: "antagonist",
  rival: "antagonist",
  important_npc: "important_npc",
  mentor: "important_npc",
  recurring_npc: "recurring_npc",
  extra: "extra",
  background: "extra",
};

export function inferCastRole(roleType: string | null | undefined): PanelCastRole {
  if (!roleType) return "extra";
  const lower = roleType.toLowerCase().trim();
  return ROLE_TYPE_TO_CAST_ROLE[lower]
    ?? (/hero|protagon|main/i.test(lower) ? "protagonist" : undefined)
    ?? (/antagon|villain|rival/i.test(lower) ? "antagonist" : undefined)
    ?? (/deuterag|secondary|support/i.test(lower) ? "deuteragonist" : undefined)
    ?? (/mentor|oracle|guide|sensei/i.test(lower) ? "important_npc" : undefined)
    ?? "recurring_npc";
}

/**
 * Résout le personnage « focus » d'un panel depuis le subjectFocus du blueprint
 * et la liste des membres du cast. Ne retombe JAMAIS sur le héros par défaut.
 */
export function resolvePanelFocus(
  subjectFocus: string | null | undefined,
  castMembers: PanelCastMember[],
): PanelCastMember | null {
  if (!subjectFocus || subjectFocus === "environment" || subjectFocus === "prop" || subjectFocus === "aftermath") {
    return null;
  }

  if (subjectFocus === "hero") {
    return castMembers.find((m) => m.role === "protagonist") ?? null;
  }
  if (subjectFocus === "enemy" || subjectFocus === "antagonist") {
    return castMembers.find((m) => m.role === "antagonist")
      ?? castMembers.find((m) => m.role === "important_npc")
      ?? null;
  }
  // "important_npc" est le vocabulaire du shot-plan — priorité sur recurring_npc puis deuteragonist
  if (subjectFocus === "important_npc") {
    return castMembers.find((m) => m.role === "important_npc")
      ?? castMembers.find((m) => m.role === "recurring_npc")
      ?? castMembers.find((m) => m.role === "deuteragonist")
      ?? null;
  }
  if (subjectFocus === "npc") {
    return castMembers.find((m) => m.role === "important_npc")
      ?? castMembers.find((m) => m.role === "recurring_npc")
      ?? castMembers.find((m) => m.role === "deuteragonist")
      ?? null;
  }
  if (subjectFocus === "group") {
    return null;
  }
  // "reaction" : un panel de réaction cible typiquement un NPC ou l'antagoniste qui réagit
  // à l'action du hero, donc on cherche d'abord un non-protagonist visible, AVANT de se
  // contenter d'un "mustBeVisible" générique (qui retombait systématiquement sur le hero).
  if (subjectFocus === "reaction") {
    return castMembers.find((m) => m.role !== "protagonist" && m.mustBeVisible)
      ?? castMembers.find((m) => m.role === "important_npc")
      ?? castMembers.find((m) => m.role === "recurring_npc")
      ?? castMembers.find((m) => m.role === "antagonist")
      ?? castMembers.find((m) => m.role === "deuteragonist")
      ?? null;
  }

  return null;
}
