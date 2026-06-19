import { z } from "zod";

/**
 * Rôle canonique d'un personnage dans le cast du chapitre.
 * Aligné avec CHARACTER_ROLE_CANONICAL de character-role.ts.
 */
export const chapterCastRoleSchema = z.enum([
  "hero",
  "support",
  "antagonist",
  "npc",
  "background",
]);

export type ChapterCastRole = z.infer<typeof chapterCastRoleSchema>;

/**
 * Entrée du cast : un personnage avec son rôle explicite pour ce chapitre.
 */
export const chapterCastMemberSchema = z.object({
  characterId: z.string().min(1),
  name: z.string().min(1),
  role: chapterCastRoleSchema,
  /** Si true, ce personnage peut apparaître en gros plan / closeup. */
  allowsCloseup: z.boolean().default(true),
  /** Si true, ce personnage peut parler (dialogue). */
  canSpeak: z.boolean().default(true),
  /** Beats où ce personnage est obligatoire (vide = optionnel partout). */
  requiredInBeatIds: z.array(z.string()).default([]),
  /** Beats où ce personnage est interdit (ex: pas encore révélé). */
  forbiddenInBeatIds: z.array(z.string()).default([]),
});

export type ChapterCastMember = z.infer<typeof chapterCastMemberSchema>;

/**
 * Groupe de PNJ/ambiance (ex: pêcheurs, foule, passants).
 */
export const chapterNpcGroupSchema = z.object({
  groupId: z.string().min(1),
  label: z.string().min(1),
  /** Description visuelle pour les prompts. */
  visualDescription: z.string().default(""),
  /** Nombre approximatif de membres (0 = indéterminé). */
  memberCountHint: z.number().int().min(0).default(0),
  /** Beats où ce groupe est obligatoire. */
  requiredInBeatIds: z.array(z.string()).default([]),
  /** Beats où ce groupe peut apparaître (optionnel). */
  optionalInBeatIds: z.array(z.string()).default([]),
});

export type ChapterNpcGroup = z.infer<typeof chapterNpcGroupSchema>;

/**
 * ChapterCastContract : le contrat de cast complet pour un chapitre.
 */
export const chapterCastContractSchema = z.object({
  chapterId: z.string().min(1),
  /**
   * ID du héros principal. OBLIGATOIRE.
   * C'est le personnage focal du chapitre — il ne peut pas être remplacé
   * par focusCharacterIds[0] ou mainCharacterIds[0].
   */
  heroCharacterId: z.string().min(1),
  /**
   * Héros secondaire (studio) : même chapitre, rôle « support » dans members,
   * mais présent dans activeCharacterIds et placé juste après le héros pour
   * les passes éditoriales (duo, manga editor).
   */
  secondaryHeroCharacterId: z.string().min(1).nullable().optional(),
  /**
   * IDs des personnages actifs (incluant le héros).
   * Ce sont les personnages qui peuvent apparaître dans les panels.
   */
  activeCharacterIds: z.array(z.string()).min(1),
  /**
   * IDs des personnages de support (sous-ensemble de activeCharacterIds).
   * Personnages importants mais pas le héros.
   */
  supportCharacterIds: z.array(z.string()).default([]),
  /**
   * IDs des antagonistes visibles dans ce chapitre.
   */
  antagonistCharacterIds: z.array(z.string()).default([]),
  /**
   * Groupes de PNJ / ambiance.
   */
  npcGroups: z.array(chapterNpcGroupSchema).default([]),
  /**
   * Cast complet avec rôles explicites.
   */
  members: z.array(chapterCastMemberSchema).default([]),
});

export type ChapterCastContract = z.infer<typeof chapterCastContractSchema>;
