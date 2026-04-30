/**
 * P0.1 — ChapterCastContract : contrat de cast unifié pour un chapitre.
 *
 * Ce contrat est la source de vérité pour l'identité des personnages dans
 * le pipeline. Il garantit :
 *   - Un héros principal unique et explicite (heroCharacterId)
 *   - Une distinction claire entre héros, personnages actifs, supports et PNJ
 *   - Le héros est toujours dans activeCharacterIds
 *   - focusCharacterIds ne remplace jamais heroCharacterId
 *   - secondaryHeroCharacterId (optionnel) : co‑protagoniste / héros 2 — reste
 *     « support » dans members (P2.7) mais est priorisé pour l’éditeur storyboard
 *     et les scènes duo.
 *
 * Le pipeline DOIT valider ce contrat AVANT de construire le storyboard.
 * Si le contrat est invalide, le job échoue tôt avec une erreur claire.
 */

import { z } from "zod";
import {
  isHeroRole,
  isAntagonistRole,
  isSupportingRole,
} from "./character-role";

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

/**
 * Codes d'erreur stables pour la validation du cast.
 */
export const CAST_CONTRACT_ERROR_CODES = {
  HERO_MISSING: "E_CAST_HERO_MISSING",
  HERO_NOT_IN_ACTIVE: "E_CAST_HERO_NOT_IN_ACTIVE",
  ACTIVE_EMPTY: "E_CAST_ACTIVE_EMPTY",
  SUPPORT_NOT_IN_ACTIVE: "E_CAST_SUPPORT_NOT_IN_ACTIVE",
  DUPLICATE_HERO: "E_CAST_DUPLICATE_HERO",
  MEMBER_NOT_IN_ACTIVE: "E_CAST_MEMBER_NOT_IN_ACTIVE",
  /** P2.7 — Plusieurs personnages ont le rôle "hero" alors qu'un seul est autorisé */
  MULTIPLE_PROTAGONISTS: "E_CAST_MULTIPLE_PROTAGONISTS",
  /** P2.7 — Le héros officiel a un rôle autre que "hero" dans members */
  HERO_ROLE_MISMATCH: "E_CAST_HERO_ROLE_MISMATCH",
  /** P2.7 — Un personnage non-héros a le rôle "hero" */
  NON_HERO_AS_PROTAGONIST: "E_CAST_NON_HERO_AS_PROTAGONIST",
  /** Héros secondaire identique au héros principal */
  SECONDARY_SAME_AS_HERO: "E_CAST_SECONDARY_SAME_AS_HERO",
  /** Héros secondaire absent des actifs */
  SECONDARY_NOT_IN_ACTIVE: "E_CAST_SECONDARY_NOT_IN_ACTIVE",
  /** Héros secondaire inconnu du cast fourni */
  SECONDARY_UNKNOWN_CHARACTER: "E_CAST_SECONDARY_UNKNOWN_CHARACTER",
} as const;

export type CastContractErrorCode =
  (typeof CAST_CONTRACT_ERROR_CODES)[keyof typeof CAST_CONTRACT_ERROR_CODES];

export interface CastContractValidationIssue {
  code: CastContractErrorCode;
  message: string;
  characterId?: string;
}

export interface CastContractValidationResult {
  ok: boolean;
  issues: CastContractValidationIssue[];
}

/**
 * Valide un ChapterCastContract.
 * Retourne les issues trouvées. Si ok=false, le pipeline doit s'arrêter.
 */
export function validateChapterCastContract(
  contract: ChapterCastContract,
): CastContractValidationResult {
  const issues: CastContractValidationIssue[] = [];

  // Règle 1 : heroCharacterId doit exister
  if (!contract.heroCharacterId?.trim()) {
    issues.push({
      code: CAST_CONTRACT_ERROR_CODES.HERO_MISSING,
      message: "heroCharacterId is required — the chapter must have exactly one hero",
    });
  }

  // Règle 2 : activeCharacterIds ne doit pas être vide
  if (!contract.activeCharacterIds?.length) {
    issues.push({
      code: CAST_CONTRACT_ERROR_CODES.ACTIVE_EMPTY,
      message: "activeCharacterIds must contain at least the hero",
    });
  }

  // Règle 3 : heroCharacterId doit être dans activeCharacterIds
  if (
    contract.heroCharacterId &&
    contract.activeCharacterIds?.length &&
    !contract.activeCharacterIds.includes(contract.heroCharacterId)
  ) {
    issues.push({
      code: CAST_CONTRACT_ERROR_CODES.HERO_NOT_IN_ACTIVE,
      message: `heroCharacterId=${contract.heroCharacterId} must be in activeCharacterIds`,
      characterId: contract.heroCharacterId,
    });
  }

  const secondaryTrimmed = contract.secondaryHeroCharacterId?.trim();
  const activeSet = new Set(contract.activeCharacterIds ?? []);

  if (secondaryTrimmed) {
    if (secondaryTrimmed === contract.heroCharacterId) {
      issues.push({
        code: CAST_CONTRACT_ERROR_CODES.SECONDARY_SAME_AS_HERO,
        message: "secondaryHeroCharacterId must differ from heroCharacterId",
        characterId: secondaryTrimmed,
      });
    }
    if (!activeSet.has(secondaryTrimmed)) {
      issues.push({
        code: CAST_CONTRACT_ERROR_CODES.SECONDARY_NOT_IN_ACTIVE,
        message: `secondaryHeroCharacterId=${secondaryTrimmed} must be in activeCharacterIds`,
        characterId: secondaryTrimmed,
      });
    }
  }

  // Règle 4 : supportCharacterIds doivent être dans activeCharacterIds
  for (const supportId of contract.supportCharacterIds ?? []) {
    if (!activeSet.has(supportId)) {
      issues.push({
        code: CAST_CONTRACT_ERROR_CODES.SUPPORT_NOT_IN_ACTIVE,
        message: `supportCharacterId=${supportId} must be in activeCharacterIds`,
        characterId: supportId,
      });
    }
  }

  // Règle 5 : Il ne doit y avoir qu'un seul héros dans members
  const heroes = (contract.members ?? []).filter((m) => m.role === "hero");
  if (heroes.length > 1) {
    issues.push({
      code: CAST_CONTRACT_ERROR_CODES.DUPLICATE_HERO,
      message: `Found ${heroes.length} heroes in members — only one allowed`,
    });
  }

  // Règle 6 : Chaque member doit être dans activeCharacterIds
  for (const member of contract.members ?? []) {
    if (!activeSet.has(member.characterId)) {
      issues.push({
        code: CAST_CONTRACT_ERROR_CODES.MEMBER_NOT_IN_ACTIVE,
        message: `member ${member.name} (${member.characterId}) not in activeCharacterIds`,
        characterId: member.characterId,
      });
    }
  }

  // P2.7 — Règle 7 : Le héros officiel doit avoir le rôle "hero" dans members
  if (contract.heroCharacterId && contract.members?.length) {
    const heroMember = contract.members.find(
      (m) => m.characterId === contract.heroCharacterId,
    );
    if (heroMember && heroMember.role !== "hero") {
      issues.push({
        code: CAST_CONTRACT_ERROR_CODES.HERO_ROLE_MISMATCH,
        message: `heroCharacterId=${contract.heroCharacterId} has role="${heroMember.role}" but should be "hero"`,
        characterId: contract.heroCharacterId,
      });
    }
  }

  // P2.7 — Règle 8 : Aucun personnage non-héros ne doit avoir le rôle "hero"
  for (const member of contract.members ?? []) {
    if (member.role === "hero" && member.characterId !== contract.heroCharacterId) {
      issues.push({
        code: CAST_CONTRACT_ERROR_CODES.NON_HERO_AS_PROTAGONIST,
        message: `member ${member.name} (${member.characterId}) has role="hero" but is not heroCharacterId`,
        characterId: member.characterId,
      });
    }
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}

/**
 * Assertion : lance une erreur si le contrat est invalide.
 */
export class ChapterCastContractError extends Error {
  code: string = "E_CAST_CONTRACT_INVALID";
  issues: CastContractValidationIssue[];
  constructor(result: CastContractValidationResult) {
    const summary = result.issues.map((i) => `${i.code}: ${i.message}`).join(" | ");
    super(`chapter_cast_contract_invalid: ${summary}`);
    this.name = "ChapterCastContractError";
    this.issues = result.issues;
  }
}

export function assertValidChapterCastContract(contract: ChapterCastContract): void {
  const result = validateChapterCastContract(contract);
  if (!result.ok) {
    throw new ChapterCastContractError(result);
  }
}

/**
 * Construit un ChapterCastContract à partir des inputs du pipeline.
 * Utilitaire pour la migration progressive.
 */
export function buildChapterCastContract(input: {
  chapterId: string;
  heroCharacterId: string | null | undefined;
  /** Héros 2 (studio) — fusionné dans activeCharacterIds après le héros. */
  secondaryHeroCharacterId?: string | null;
  focusCharacterIds?: string[];
  activeCharacterIds?: string[];
  characters: Array<{
    id: string;
    name: string;
    roleType?: string | null;
  }>;
  npcGroups?: Array<{
    id: string;
    label: string;
    visualDescription?: string;
    requiredInBeatIds?: string[];
  }>;
}): ChapterCastContract {
  // Résoudre le héros
  const heroId = input.heroCharacterId ?? input.focusCharacterIds?.[0] ?? null;
  if (!heroId) {
    throw new ChapterCastContractError({
      ok: false,
      issues: [
        {
          code: CAST_CONTRACT_ERROR_CODES.HERO_MISSING,
          message: "Cannot build cast contract: no heroCharacterId and no focusCharacterIds",
        },
      ],
    });
  }

  // Construire activeCharacterIds
  let activeIds = input.activeCharacterIds?.length
    ? [...input.activeCharacterIds]
    : input.focusCharacterIds?.length
      ? [...input.focusCharacterIds]
      : [heroId];

  const charMap = new Map(input.characters.map((c) => [c.id, c]));

  // S'assurer que le héros est dans actifs
  if (!activeIds.includes(heroId)) {
    activeIds.unshift(heroId);
  }

  const secondaryRaw =
    typeof input.secondaryHeroCharacterId === "string" && input.secondaryHeroCharacterId.trim().length > 0
      ? input.secondaryHeroCharacterId.trim()
      : null;
  if (secondaryRaw) {
    if (secondaryRaw === heroId) {
      throw new ChapterCastContractError({
        ok: false,
        issues: [
          {
            code: CAST_CONTRACT_ERROR_CODES.SECONDARY_SAME_AS_HERO,
            message: "secondaryHeroCharacterId cannot equal heroCharacterId",
            characterId: secondaryRaw,
          },
        ],
      });
    }
    if (!charMap.has(secondaryRaw)) {
      throw new ChapterCastContractError({
        ok: false,
        issues: [
          {
            code: CAST_CONTRACT_ERROR_CODES.SECONDARY_UNKNOWN_CHARACTER,
            message: `secondaryHeroCharacterId=${secondaryRaw} is not in the chapter character list`,
            characterId: secondaryRaw,
          },
        ],
      });
    }
    const withoutSecondary = activeIds.filter((id) => id !== secondaryRaw);
    const heroIndex = withoutSecondary.indexOf(heroId);
    if (heroIndex === -1) {
      activeIds = [heroId, secondaryRaw, ...withoutSecondary.filter((id) => id !== heroId)];
    } else {
      activeIds = [
        ...withoutSecondary.slice(0, heroIndex + 1),
        secondaryRaw,
        ...withoutSecondary.slice(heroIndex + 1),
      ];
    }
  }

  // Construire les membres avec rôles
  const members: ChapterCastMember[] = [];

  for (const charId of activeIds) {
    const char = charMap.get(charId);
    if (!char) continue;

    const isCharHero = charId === heroId;

    // P2.7 — Seul heroCharacterId devient "hero"
    // Les autres personnages actifs deviennent "support" ou leur rôle naturel
    // MÊME s'ils ont un roleType de type "héros" (isHeroRole)
    let role: ChapterCastRole = "npc";

    if (isCharHero) {
      // Uniquement le héros officiel a le rôle "hero"
      role = "hero";
    } else if (isAntagonistRole(char.roleType)) {
      role = "antagonist";
    } else if (isSupportingRole(char.roleType) || isHeroRole(char.roleType)) {
      // P2.7 — Un personnage avec roleType="hero" qui n'est pas heroCharacterId
      // devient "support", pas "hero" (il peut être héros dans son projet
      // mais support dans CE chapitre)
      role = "support";
    } else if (activeIds.includes(charId)) {
      // Personnage actif sans rôle spécifique = support
      role = "support";
    }

    members.push({
      characterId: charId,
      name: char.name,
      role,
      allowsCloseup: true,
      canSpeak: true,
      requiredInBeatIds: [],
      forbiddenInBeatIds: [],
    });
  }

  // Construire les supports
  const supportIds = members.filter((m) => m.role === "support").map((m) => m.characterId);
  const antagonistIds = members.filter((m) => m.role === "antagonist").map((m) => m.characterId);

  // Construire les groupes PNJ
  const npcGroups: ChapterNpcGroup[] = (input.npcGroups ?? []).map((g) => ({
    groupId: g.id,
    label: g.label,
    visualDescription: g.visualDescription ?? "",
    memberCountHint: 0,
    requiredInBeatIds: g.requiredInBeatIds ?? [],
    optionalInBeatIds: [],
  }));

  return {
    chapterId: input.chapterId,
    heroCharacterId: heroId,
    secondaryHeroCharacterId: secondaryRaw,
    activeCharacterIds: activeIds,
    supportCharacterIds: supportIds,
    antagonistCharacterIds: antagonistIds,
    npcGroups,
    members,
  };
}

/**
 * Log formaté pour debug/observabilité.
 */
export function formatCastContractLog(contract: ChapterCastContract): string {
  const hero = contract.heroCharacterId;
  const secondary = contract.secondaryHeroCharacterId?.trim();
  const active = contract.activeCharacterIds.join(",");
  const support = contract.supportCharacterIds.join(",") || "none";
  const npcGroups = contract.npcGroups.map((g) => g.label).join(",") || "none";
  const secondaryPart = secondary && secondary.length > 0 ? ` secondary=${secondary}` : "";
  return `[cast-contract] hero=${hero}${secondaryPart} active=${active} support=${support} npcGroups=${npcGroups}`;
}

/**
 * Ordre des IDs passés au manga editor / storyboard : héros, héros 2 si défini,
 * puis le reste des actifs (stable).
 */
export function orderedEditorHeroCharacterIds(contract: ChapterCastContract): string[] {
  const hero = contract.heroCharacterId;
  const sec = contract.secondaryHeroCharacterId?.trim();
  if (sec && sec.length > 0 && sec !== hero) {
    const rest = contract.activeCharacterIds.filter((id) => id !== hero && id !== sec);
    return [hero, sec, ...rest];
  }
  return [...contract.activeCharacterIds];
}

/**
 * Récupère le rôle d'un personnage dans le cast.
 */
export function getCastRole(
  contract: ChapterCastContract,
  characterId: string,
): ChapterCastRole | null {
  if (characterId === contract.heroCharacterId) return "hero";
  const member = contract.members.find((m) => m.characterId === characterId);
  return member?.role ?? null;
}

/**
 * Vérifie si un personnage est le héros.
 */
export function isHeroInCast(contract: ChapterCastContract, characterId: string): boolean {
  return characterId === contract.heroCharacterId;
}

/**
 * Vérifie si un personnage est actif dans ce chapitre.
 */
export function isActiveInCast(contract: ChapterCastContract, characterId: string): boolean {
  return contract.activeCharacterIds.includes(characterId);
}
