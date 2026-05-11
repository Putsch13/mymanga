/**
 * Hook qui regroupe les deux mutations centrales du step Cast & Canon :
 * - `updateCharacterSelection` (avec invariant héros)
 * - `updateCanon` (patch partiel sur `chapterCanon`)
 *
 * Le composant parent reste responsable de fournir le `draft` courant et
 * `onUpdateDraft` pour propager le résultat.
 */
"use client";

import { applyHeroInvariant, type ChapterStudioData } from "@manga-ai-studio/core";

export interface UseCastMutationsArgs {
  draft: ChapterStudioData;
  onUpdateDraft: (next: ChapterStudioData, step?: "characters" | "canon") => void;
}

export function useCastMutations({ draft, onUpdateDraft }: UseCastMutationsArgs) {
  function updateCharacterSelection(
    patch: Partial<NonNullable<ChapterStudioData["characterSelection"]>>,
  ): void {
    const merged: NonNullable<ChapterStudioData["characterSelection"]> = {
      heroCharacterId: draft.characterSelection?.heroCharacterId ?? null,
      secondaryHeroCharacterId: draft.characterSelection?.secondaryHeroCharacterId ?? null,
      deuteragonistCharacterId:
        draft.characterSelection?.deuteragonistCharacterId ?? null,
      coreCastCharacterIds: draft.characterSelection?.coreCastCharacterIds ?? [],
      activeCharacterIds: draft.characterSelection?.activeCharacterIds ?? [],
      lockedCharacterIds: draft.characterSelection?.lockedCharacterIds ?? [],
      speakingCharacterIds: draft.characterSelection?.speakingCharacterIds ?? [],
      evolvingCharacterIds: draft.characterSelection?.evolvingCharacterIds ?? [],
      antagonistCharacterIds: draft.characterSelection?.antagonistCharacterIds ?? [],
      recurringNpcIds: draft.characterSelection?.recurringNpcIds ?? [],
      ...patch,
    };
    const hero =
      typeof merged.heroCharacterId === "string" ? merged.heroCharacterId.trim() : "";
    const finalSelection = hero ? applyHeroInvariant(merged, hero) : merged;
    onUpdateDraft(
      {
        ...draft,
        characterSelection: finalSelection,
      },
      "characters",
    );
  }

  function updateCanon(patch: Partial<NonNullable<ChapterStudioData["chapterCanon"]>>): void {
    onUpdateDraft(
      {
        ...draft,
        chapterCanon: {
          heroOutfitId: draft.chapterCanon?.heroOutfitId ?? null,
          activeCharacters: draft.chapterCanon?.activeCharacters ?? [],
          allowedVisualChanges: draft.chapterCanon?.allowedVisualChanges ?? [],
          currentLocation: draft.chapterCanon?.currentLocation ?? null,
          weather: draft.chapterCanon?.weather ?? null,
          timeOfDay: draft.chapterCanon?.timeOfDay ?? null,
          injuries: draft.chapterCanon?.injuries ?? [],
          carriedObjects: draft.chapterCanon?.carriedObjects ?? [],
          continuityNotes: draft.chapterCanon?.continuityNotes ?? [],
          inheritedFromPreviousChapter:
            draft.chapterCanon?.inheritedFromPreviousChapter ?? true,
          universeConstraints: draft.chapterCanon?.universeConstraints ?? [],
          ...patch,
        },
      },
      "canon",
    );
  }

  return { updateCharacterSelection, updateCanon };
}
