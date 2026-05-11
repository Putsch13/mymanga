/**
 * chapter-studio-world-schemas.ts
 *
 * Schémas Zod du « Monde vivant » du chapitre :
 * entity registry (NPC, créatures, props, véhicules, factions).
 *
 * Extrait de `chapter-studio.ts` (audit-v9, < 500 lignes/fichier).
 */

import { z } from "zod";

export const chapterEntityKindSchema = z.enum([
  "named_story_npc",
  "recurring_supporting",
  "functional_unnamed",
  "background_extra",
  "crowd_group",
]);

export type ChapterEntityKind = z.infer<typeof chapterEntityKindSchema>;

export const chapterEntityEntrySchema = z.object({
  name: z.string(),
  kind: chapterEntityKindSchema,
  introductionReason: z.string().optional().nullable(),
  allowedRecurrence: z.enum(["single_chapter", "recurring", "story_locked"]).default("single_chapter"),
  promotionStatus: z.enum(["temporary", "pending_review", "promoted"]).default("temporary"),
  dramaticFunction: z.string().optional().nullable(),
});

export type ChapterEntityEntry = z.infer<typeof chapterEntityEntrySchema>;

export const crowdGroupSchema = z.object({
  label: z.string(),
  size: z.enum(["small", "medium", "large"]).default("small"),
});

export const chapterEntityRegistrySchema = z.object({
  namedEntities: z.array(chapterEntityEntrySchema).default([]),
  temporaryEntities: z.array(chapterEntityEntrySchema).default([]),
  backgroundExtras: z.array(chapterEntityEntrySchema).default([]),
  crowdGroups: z.array(crowdGroupSchema).default([]),
});

export type ChapterEntityRegistry = z.infer<typeof chapterEntityRegistrySchema>;

/** P0.9 — PNJ / foule (wizard « monde vivant »), mappé vers `VisualWorldContract.npcGroups`. */
export const chapterWorldNpcContractSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  narrativeRole: z.string().optional().nullable(),
  appearance: z.string().optional().nullable(),
  behavior: z.string().optional().nullable(),
  panelMoments: z.array(z.string()).default([]),
  recurrence: z.enum(["one_shot", "recurring"]).default("one_shot"),
});

export type ChapterWorldNpcContract = z.infer<typeof chapterWorldNpcContractSchema>;

/** P0.9 — Créature / monstre → `VisualWorldContract.creatures`. */
export const chapterWorldCreatureContractSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  species: z.string().optional().nullable(),
  sizeLabel: z.string().optional().nullable(),
  silhouette: z.string().optional().nullable(),
  powers: z.string().optional().nullable(),
  behavior: z.string().optional().nullable(),
  threatLevel: z.enum(["none", "low", "medium", "high"]).default("medium"),
  revealMoment: z.string().optional().nullable(),
  recurrence: z.enum(["unique", "recurring"]).default("unique"),
});

export type ChapterWorldCreatureContract = z.infer<typeof chapterWorldCreatureContractSchema>;

/** P0.9 — Objet important → `VisualWorldContract.props`. */
export const chapterWorldPropContractSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  ownerCharacterId: z.string().optional().nullable(),
  ownerLabel: z.string().optional().nullable(),
  visualDescription: z.string().optional().nullable(),
  narrativeFunction: z.string().optional().nullable(),
  momentHints: z.array(z.string()).default([]),
  continuityRules: z.array(z.string()).default([]),
});

export type ChapterWorldPropContract = z.infer<typeof chapterWorldPropContractSchema>;

/** P0.9 — Véhicule → `VisualWorldContract.vehicles`. */
export const chapterWorldVehicleContractSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  type: z.string().optional().nullable(),
  design: z.string().optional().nullable(),
  ownerLabel: z.string().optional().nullable(),
  condition: z.string().optional().nullable(),
  sceneFunction: z.string().optional().nullable(),
});

export type ChapterWorldVehicleContract = z.infer<typeof chapterWorldVehicleContractSchema>;

/** P0.9 — Faction / clan → `VisualWorldContract.factions`. */
export const chapterWorldFactionContractSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  symbol: z.string().optional().nullable(),
  uniform: z.string().optional().nullable(),
  colors: z.array(z.string()).default([]),
  storyRole: z.string().optional().nullable(),
  visibleMembersNote: z.string().optional().nullable(),
});

export type ChapterWorldFactionContract = z.infer<typeof chapterWorldFactionContractSchema>;

export const chapterEntitiesSchema = z.object({
  npcs: z.array(chapterWorldNpcContractSchema).default([]),
  creatures: z.array(chapterWorldCreatureContractSchema).default([]),
  props: z.array(chapterWorldPropContractSchema).default([]),
  vehicles: z.array(chapterWorldVehicleContractSchema).default([]),
  factions: z.array(chapterWorldFactionContractSchema).default([]),
});

export type ChapterEntities = z.infer<typeof chapterEntitiesSchema>;
