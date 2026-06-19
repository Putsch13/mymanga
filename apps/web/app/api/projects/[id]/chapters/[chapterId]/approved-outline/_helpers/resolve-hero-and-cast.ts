import { NextResponse } from "next/server";

import {
  isHeroRole,
  resolveCharacterRefsToIds,
  type ApprovedChapterOutline,
} from "@manga-ai-studio/core";

import {
  buildUnresolvedCharacterLabelsPayload,
  mapCharacterLabelsToIdsSequential,
} from "@/lib/characters/resolve-character-labels";

import { asRecord, filterStrings } from "./utils";

interface CharacterRefForLabels {
  id: string;
  name: string;
  displayName: string | null;
  roleType: string | null;
}

interface ResolveHeroAndCastInput {
  approvedOutline: ApprovedChapterOutline;
  chapterOutline: unknown;
  chapterId: string;
  projectId: string;
  premiumOnly: boolean;
  projectCharacters: Array<{ id: string; name: string; roleType: string | null }>;
  charRefsForLabels: CharacterRefForLabels[];
}

export interface CastSelectionFromSnapshot {
  heroCharacterId: string | null;
  secondaryHeroCharacterId: string | null;
  snapshotHeroCharacterId: string | null;
  fallbackHeroCharacterId: string | null;
  usedFallbackHeroCharacterId: boolean;
  activeCharacterIds: string[];
  resolvedActiveCharacterIds: string[];
  coreCastFiltered: string[];
  lockedFiltered: string[];
  speakingFiltered: string[];
  evolvingFiltered: string[];
  antagonistFiltered: string[];
  recurringNpcFiltered: string[];
}

export type ResolveHeroResult =
  | { ok: true; selection: CastSelectionFromSnapshot }
  | { ok: false; response: NextResponse };

const UNRESOLVED_LABEL_MESSAGE =
  "Certains personnages du cast sont encore des noms ou des libellés non reliés à un personnage du projet."
  + " Associe-les à un personnage existant avant d’approuver l’outline.";

function readSnapshotHero(characterSelection: Record<string, unknown>): {
  hero: string | null;
  secondary: string | null;
} {
  const hero =
    typeof characterSelection.heroCharacterId === "string"
    && characterSelection.heroCharacterId.length > 0
      ? characterSelection.heroCharacterId
      : null;
  const secondary =
    typeof characterSelection.secondaryHeroCharacterId === "string"
    && characterSelection.secondaryHeroCharacterId.trim().length > 0
      ? characterSelection.secondaryHeroCharacterId.trim()
      : null;
  return { hero, secondary };
}

export function resolveHeroAndCast(
  input: ResolveHeroAndCastInput,
): ResolveHeroResult {
  const {
    approvedOutline,
    chapterOutline,
    chapterId,
    projectId,
    premiumOnly,
    projectCharacters,
    charRefsForLabels,
  } = input;

  const existingOutline = asRecord(chapterOutline);
  const studio = asRecord(existingOutline.studio);
  const studioData = asRecord(studio.data);
  const characterSelection = asRecord(studioData.characterSelection);

  const { hero: snapshotHeroCharacterId, secondary: snapshotSecondaryHeroCharacterId } =
    readSnapshotHero(characterSelection);

  if (!snapshotHeroCharacterId) {
    console.warn(
      `[approved-outline] missing chapter heroCharacterId chapterId=${chapterId}`,
    );
  }

  const activeCharacterIds = filterStrings(characterSelection.activeCharacterIds);

  if (
    snapshotHeroCharacterId
    && activeCharacterIds.length > 0
    && !activeCharacterIds.includes(snapshotHeroCharacterId)
  ) {
    console.error(
      `[approved-outline] HERO_NOT_IN_ACTIVE_CAST chapterId=${chapterId} projectId=${projectId} `
      + `heroCharacterId=${snapshotHeroCharacterId} `
      + `activeCharacterIds=${JSON.stringify(activeCharacterIds)} `
      + "— le snapshot chapitre désigne un héros absent du cast actif ; corrigez la sélection studio.",
    );
  }

  const fallbackHeroCharacterId =
    projectCharacters.find((c) => isHeroRole(c.roleType))?.id ?? null;
  let heroCharacterId: string | null =
    snapshotHeroCharacterId ?? fallbackHeroCharacterId;
  let secondaryHeroCharacterId: string | null = snapshotSecondaryHeroCharacterId;

  if (premiumOnly) {
    const unresolvedCollector: string[] = [];

    if (snapshotHeroCharacterId) {
      const rH = resolveCharacterRefsToIds(
        [snapshotHeroCharacterId],
        charRefsForLabels,
      );
      if (rH.unresolved.length > 0) unresolvedCollector.push(...rH.unresolved);
      else if (rH.ids.length > 0) heroCharacterId = rH.ids[0]!;
    }

    if (secondaryHeroCharacterId) {
      const rS = resolveCharacterRefsToIds(
        [secondaryHeroCharacterId],
        charRefsForLabels,
      );
      if (rS.unresolved.length > 0) unresolvedCollector.push(...rS.unresolved);
      else if (rS.ids.length > 0) secondaryHeroCharacterId = rS.ids[0]!;
    }

    const uniqueUnresolvedHeroes = [...new Set(unresolvedCollector)];
    if (uniqueUnresolvedHeroes.length > 0) {
      const { suggestions } = buildUnresolvedCharacterLabelsPayload(
        uniqueUnresolvedHeroes,
        charRefsForLabels,
      );
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: "character_labels_unresolved",
            code: "CHARACTER_LABELS_UNRESOLVED",
            message: UNRESOLVED_LABEL_MESSAGE,
            unresolvedLabels: uniqueUnresolvedHeroes,
            suggestions,
          },
          { status: 422 },
        ),
      };
    }
  }

  const usedFallbackHeroCharacterId =
    snapshotHeroCharacterId === null
    && fallbackHeroCharacterId !== null
    && heroCharacterId === fallbackHeroCharacterId;

  let resolvedActiveCharacterIds =
    activeCharacterIds.length > 0
      ? [...activeCharacterIds]
      : [
          ...new Set(
            approvedOutline.beats.flatMap((b) => b.characters ?? []),
          ),
        ].filter((id): id is string => typeof id === "string" && id.length > 0);

  let coreCastFiltered = filterStrings(characterSelection.coreCastCharacterIds);
  let lockedFiltered = filterStrings(characterSelection.lockedCharacterIds);
  let speakingFiltered = filterStrings(characterSelection.speakingCharacterIds);
  let evolvingFiltered = filterStrings(characterSelection.evolvingCharacterIds);
  let antagonistFiltered = filterStrings(characterSelection.antagonistCharacterIds);
  let recurringNpcFiltered = filterStrings(characterSelection.recurringNpcIds);

  if (premiumOnly) {
    const unresolvedCollector: string[] = [];
    const collect = (san: { unresolvedLabels: string[] }) => {
      unresolvedCollector.push(...san.unresolvedLabels);
    };

    const sanitizeList = (list: string[]): string[] => {
      const san = mapCharacterLabelsToIdsSequential(list, charRefsForLabels);
      collect(san);
      return san.sanitizedIds;
    };

    resolvedActiveCharacterIds = sanitizeList(resolvedActiveCharacterIds);
    coreCastFiltered = sanitizeList(coreCastFiltered);
    lockedFiltered = sanitizeList(lockedFiltered);
    speakingFiltered = sanitizeList(speakingFiltered);
    evolvingFiltered = sanitizeList(evolvingFiltered);
    antagonistFiltered = sanitizeList(antagonistFiltered);
    recurringNpcFiltered = sanitizeList(recurringNpcFiltered);

    const uniqueUnresolved = [...new Set(unresolvedCollector)];
    if (uniqueUnresolved.length > 0) {
      const { suggestions } = buildUnresolvedCharacterLabelsPayload(
        uniqueUnresolved,
        charRefsForLabels,
      );
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: "character_labels_unresolved",
            code: "CHARACTER_LABELS_UNRESOLVED",
            message: UNRESOLVED_LABEL_MESSAGE,
            unresolvedLabels: uniqueUnresolved,
            suggestions,
          },
          { status: 422 },
        ),
      };
    }
  }

  return {
    ok: true,
    selection: {
      heroCharacterId,
      secondaryHeroCharacterId,
      snapshotHeroCharacterId,
      fallbackHeroCharacterId,
      usedFallbackHeroCharacterId,
      activeCharacterIds,
      resolvedActiveCharacterIds,
      coreCastFiltered,
      lockedFiltered,
      speakingFiltered,
      evolvingFiltered,
      antagonistFiltered,
      recurringNpcFiltered,
    },
  };
}
