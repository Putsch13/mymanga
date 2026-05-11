import {
  isAntagonistRole,
  isHeroRole,
  isSupportingRole,
} from "../character-role";

import {
  CAST_CONTRACT_ERROR_CODES,
  ChapterCastContractError,
} from "./error-codes";
import type {
  ChapterCastContract,
  ChapterCastMember,
  ChapterCastRole,
  ChapterNpcGroup,
} from "./schemas";

export interface BuildChapterCastContractInput {
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
}

function resolveHeroId(input: BuildChapterCastContractInput): string {
  const heroId = input.heroCharacterId ?? input.focusCharacterIds?.[0] ?? null;
  if (!heroId) {
    throw new ChapterCastContractError({
      ok: false,
      issues: [
        {
          code: CAST_CONTRACT_ERROR_CODES.HERO_MISSING,
          message:
            "Cannot build cast contract: no heroCharacterId and no focusCharacterIds",
        },
      ],
    });
  }
  return heroId;
}

function buildOrderedActiveIds(
  input: BuildChapterCastContractInput,
  heroId: string,
  charMap: Map<string, BuildChapterCastContractInput["characters"][number]>,
): { activeIds: string[]; secondaryRaw: string | null } {
  let activeIds = input.activeCharacterIds?.length
    ? [...input.activeCharacterIds]
    : input.focusCharacterIds?.length
      ? [...input.focusCharacterIds]
      : [heroId];

  if (!activeIds.includes(heroId)) {
    activeIds.unshift(heroId);
  }

  const secondaryRaw =
    typeof input.secondaryHeroCharacterId === "string"
    && input.secondaryHeroCharacterId.trim().length > 0
      ? input.secondaryHeroCharacterId.trim()
      : null;

  if (!secondaryRaw) return { activeIds, secondaryRaw: null };

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
    activeIds = [
      heroId,
      secondaryRaw,
      ...withoutSecondary.filter((id) => id !== heroId),
    ];
  } else {
    activeIds = [
      ...withoutSecondary.slice(0, heroIndex + 1),
      secondaryRaw,
      ...withoutSecondary.slice(heroIndex + 1),
    ];
  }

  return { activeIds, secondaryRaw };
}

function resolveMemberRole(
  isHero: boolean,
  roleType: string | null | undefined,
  isActive: boolean,
): ChapterCastRole {
  if (isHero) return "hero";
  if (isAntagonistRole(roleType)) return "antagonist";
  // P2.7 — Un personnage avec roleType="hero" qui n'est pas heroCharacterId
  // devient "support", pas "hero" (il peut être héros dans son projet
  // mais support dans CE chapitre).
  if (isSupportingRole(roleType) || isHeroRole(roleType)) return "support";
  if (isActive) return "support";
  return "npc";
}

function buildMembers(
  activeIds: string[],
  heroId: string,
  charMap: Map<string, BuildChapterCastContractInput["characters"][number]>,
): ChapterCastMember[] {
  const members: ChapterCastMember[] = [];
  for (const charId of activeIds) {
    const char = charMap.get(charId);
    if (!char) continue;

    const role = resolveMemberRole(
      charId === heroId,
      char.roleType,
      activeIds.includes(charId),
    );

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
  return members;
}

/**
 * Construit un ChapterCastContract à partir des inputs du pipeline.
 * Utilitaire pour la migration progressive.
 */
export function buildChapterCastContract(
  input: BuildChapterCastContractInput,
): ChapterCastContract {
  const heroId = resolveHeroId(input);
  const charMap = new Map(input.characters.map((c) => [c.id, c]));
  const { activeIds, secondaryRaw } = buildOrderedActiveIds(input, heroId, charMap);

  const members = buildMembers(activeIds, heroId, charMap);

  const supportIds = members
    .filter((m) => m.role === "support")
    .map((m) => m.characterId);
  const antagonistIds = members
    .filter((m) => m.role === "antagonist")
    .map((m) => m.characterId);

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
