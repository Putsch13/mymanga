import { NextResponse } from "next/server";

import {
  applyHeroInvariant,
  assertValidChapterCastContract,
  buildChapterCastContract,
  ChapterCastContractError,
  isPipelineV3PremiumOnlyEnabled,
} from "@manga-ai-studio/core";

import type { CastSelectionFromSnapshot } from "./resolve-hero-and-cast";

export interface PersistedCharacterSelection {
  heroCharacterId?: string | null;
  secondaryHeroCharacterId?: string | null;
  coreCastCharacterIds: string[];
  activeCharacterIds: string[];
  lockedCharacterIds: string[];
  speakingCharacterIds: string[];
  evolvingCharacterIds: string[];
  antagonistCharacterIds: string[];
  recurringNpcIds: string[];
}

export function buildPersistedCharacterSelection(
  selection: CastSelectionFromSnapshot,
): PersistedCharacterSelection {
  const raw: PersistedCharacterSelection = {
    heroCharacterId: selection.heroCharacterId ?? undefined,
    secondaryHeroCharacterId: selection.secondaryHeroCharacterId ?? undefined,
    coreCastCharacterIds: selection.coreCastFiltered,
    activeCharacterIds: selection.resolvedActiveCharacterIds,
    lockedCharacterIds: selection.lockedFiltered,
    speakingCharacterIds: selection.speakingFiltered,
    evolvingCharacterIds: selection.evolvingFiltered,
    antagonistCharacterIds: selection.antagonistFiltered,
    recurringNpcIds: selection.recurringNpcFiltered,
  };

  if (!selection.heroCharacterId) return raw;

  return {
    ...raw,
    ...applyHeroInvariant(
      {
        heroCharacterId: raw.heroCharacterId ?? null,
        secondaryHeroCharacterId: raw.secondaryHeroCharacterId ?? null,
        activeCharacterIds: raw.activeCharacterIds,
        coreCastCharacterIds: raw.coreCastCharacterIds,
        lockedCharacterIds: raw.lockedCharacterIds,
      },
      selection.heroCharacterId,
    ),
    speakingCharacterIds: raw.speakingCharacterIds,
    evolvingCharacterIds: raw.evolvingCharacterIds,
    antagonistCharacterIds: raw.antagonistCharacterIds,
    recurringNpcIds: raw.recurringNpcIds,
  };
}

interface ValidateCastContractInput {
  chapterId: string;
  selection: PersistedCharacterSelection;
  projectCharacters: Array<{ id: string; name: string; roleType: string | null }>;
}

/**
 * En mode premium-only, valide que la sélection persistée respecte le contrat
 * de cast. Retourne `null` si valide, sinon une `NextResponse` d'erreur 422.
 */
export function validateCastContractStrict(
  input: ValidateCastContractInput,
): NextResponse | null {
  if (!isPipelineV3PremiumOnlyEnabled()) return null;
  if (typeof input.selection.heroCharacterId !== "string") return null;

  try {
    const contract = buildChapterCastContract({
      chapterId: input.chapterId,
      heroCharacterId: input.selection.heroCharacterId,
      secondaryHeroCharacterId:
        typeof input.selection.secondaryHeroCharacterId === "string"
          ? input.selection.secondaryHeroCharacterId
          : null,
      activeCharacterIds: input.selection.activeCharacterIds,
      characters: input.projectCharacters.map((c) => ({
        id: c.id,
        name: c.name,
        roleType: c.roleType,
      })),
    });
    assertValidChapterCastContract(contract);
    return null;
  } catch (err) {
    if (err instanceof ChapterCastContractError) {
      return NextResponse.json(
        {
          error: "chapter_cast_contract_invalid",
          code: "CAST_CONTRACT_INVALID",
          message: err.message,
          issues: err.issues,
        },
        { status: 422 },
      );
    }
    throw err;
  }
}
