/**
 * P5.2 — Charge le cast premium d'un chapitre cible (héros / co-protag /
 * deuteragoniste) + map des `CharacterCanon` pour préparer la hydratation
 * `hydrateBlueprintsWithCharacterDna`. Si pas de chapitre cible (estimate
 * "new_chapter"), on retombe sur les valeurs par défaut.
 */
import type { CharacterCanon } from "@manga-ai-studio/core";
import type { PremiumReadinessCastContext } from "@manga-ai-studio/ai";
import { prisma } from "@manga-ai-studio/db";
import { readChapterStudioSnapshotFromOutline } from "@/lib/chapter-studio";

export interface LoadedEstimateCastContext {
  characterCanonsById: Record<string, CharacterCanon> | undefined;
  coProtagonistCharacterIdsForHydration: readonly string[] | undefined;
  premiumReadinessCast: PremiumReadinessCastContext | undefined;
}

export async function loadEstimateCastContext(args: {
  projectId: string;
  targetChapter: { id: string; chapterNumber: number; title: string | null } | null;
  targetChapterNumber: number;
  estimateChapterTitle: string;
  fallbackHeroCharacterId: string | null;
}): Promise<LoadedEstimateCastContext> {
  const {
    projectId,
    targetChapter,
    targetChapterNumber,
    estimateChapterTitle,
    fallbackHeroCharacterId,
  } = args;

  if (!targetChapter?.id) {
    return {
      characterCanonsById: undefined,
      coProtagonistCharacterIdsForHydration: undefined,
      premiumReadinessCast: undefined,
    };
  }

  const chRec = await prisma.chapter.findFirst({
    where: { id: targetChapter.id, projectId },
    select: { outline: true },
  });
  if (!chRec?.outline) {
    return {
      characterCanonsById: undefined,
      coProtagonistCharacterIdsForHydration: undefined,
      premiumReadinessCast: undefined,
    };
  }

  const snap = readChapterStudioSnapshotFromOutline({
    outline: chRec.outline,
    chapterNumber: targetChapterNumber,
    chapterTitle: estimateChapterTitle,
  });

  let characterCanonsById: Record<string, CharacterCanon> | undefined;
  const list = snap.data.characterCanons ?? [];
  if (list.length > 0) {
    characterCanonsById = {};
    for (const c of list) {
      characterCanonsById[c.characterId] = c;
    }
  }

  const sel = snap.data.characterSelection;
  const secHydrate = sel?.secondaryHeroCharacterId;
  const deutHydrate = sel?.deuteragonistCharacterId;
  const coList = [
    typeof secHydrate === "string" && secHydrate.trim() ? secHydrate.trim() : null,
    typeof deutHydrate === "string" && deutHydrate.trim() ? deutHydrate.trim() : null,
  ].filter((x): x is string => x != null);
  const uniqueCo = [...new Set(coList)];
  const coProtagonistCharacterIdsForHydration = uniqueCo.length > 0 ? uniqueCo : undefined;

  const premiumReadinessCast: PremiumReadinessCastContext = {
    heroCharacterId: sel?.heroCharacterId?.trim() || fallbackHeroCharacterId,
    secondaryHeroCharacterId:
      typeof secHydrate === "string" && secHydrate.trim().length > 0 ? secHydrate.trim() : null,
    deuteragonistCharacterId:
      typeof deutHydrate === "string" && deutHydrate.trim().length > 0 ? deutHydrate.trim() : null,
  };

  return {
    characterCanonsById,
    coProtagonistCharacterIdsForHydration,
    premiumReadinessCast,
  };
}
