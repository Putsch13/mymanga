/**
 * P2.1 — Usecase : construire et valider le `ChapterCastContract`.
 *
 * Utilise `applyHeroInvariant` + `buildChapterCastContract` + `validateChapterCastContract`
 * du core. Permet aux routes (estimate, launch, studio) de partager une seule
 * source de vérité au lieu de réimporter 3 fonctions à chaque appel.
 */

import {
  applyHeroInvariant,
  assertValidChapterCastContract,
  buildChapterCastContract,
  type ChapterCastContract,
  type HeroInvariantSelectionInput,
} from "@manga-ai-studio/core";
import type { Usecase } from "./types";
import { UsecaseFailure } from "./types";

export type CastSelectionInput = HeroInvariantSelectionInput & {
  focusCharacterIds?: string[];
};

export type BuildChapterCastContractUsecaseInput = {
  chapterId: string;
  heroCharacterId: string | null;
  secondaryHeroCharacterId?: string | null;
  selection: CastSelectionInput;
  characters: Array<{ id: string; name: string; roleType?: string | null }>;
  npcGroups?: Array<{
    id: string;
    label: string;
    visualDescription?: string;
    requiredInBeatIds?: string[];
  }>;
};

export type BuildChapterCastContractUsecaseOutput = {
  contract: ChapterCastContract;
  /** Sélection studio normalisée (héros forcé dans active/core/locked). */
  normalizedSelection: CastSelectionInput;
};

export const buildChapterCastContractUsecase: Usecase<
  BuildChapterCastContractUsecaseInput,
  BuildChapterCastContractUsecaseOutput
> = {
  name: "buildChapterCastContract",
  async execute(input) {
    const heroId = input.heroCharacterId?.trim();
    if (!heroId) {
      throw new UsecaseFailure({
        code: "CAST_HERO_MISSING",
        message: "Le chapitre n’a pas de héros principal.",
      });
    }

    const normalizedSelection = applyHeroInvariant(
      {
        ...input.selection,
        heroCharacterId: heroId,
        secondaryHeroCharacterId: input.secondaryHeroCharacterId ?? null,
      },
      heroId,
    );

    let contract: ChapterCastContract;
    try {
      contract = buildChapterCastContract({
        chapterId: input.chapterId,
        heroCharacterId: heroId,
        secondaryHeroCharacterId: input.secondaryHeroCharacterId ?? null,
        focusCharacterIds: input.selection.activeCharacterIds
          ? [...input.selection.activeCharacterIds]
          : undefined,
        activeCharacterIds: normalizedSelection.activeCharacterIds
          ? [...normalizedSelection.activeCharacterIds]
          : undefined,
        characters: input.characters,
        npcGroups: input.npcGroups,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new UsecaseFailure({
        code: "CAST_CONTRACT_BUILD_FAILED",
        message: `Construction du cast contract échouée : ${msg}`,
        cause: err,
      });
    }

    try {
      assertValidChapterCastContract(contract);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new UsecaseFailure({
        code: "CAST_CONTRACT_INVALID",
        message: `Cast contract invalide : ${msg}`,
        cause: err,
      });
    }

    return { contract, normalizedSelection };
  },
};
