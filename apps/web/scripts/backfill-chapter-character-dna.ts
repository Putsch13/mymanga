#!/usr/bin/env tsx
/**
 * Backfill `characterVisualDna` sur les panelBlueprints d'un chapitre (snapshot studio).
 *
 * Usage :
 *   pnpm exec tsx apps/web/scripts/backfill-chapter-character-dna.ts [chapterId]
 *
 * Défaut chapterId : cmoi8r3l30001pi2944d8ib11
 */

import {
  hydrateBlueprintsWithCharacterDna,
  type CharacterCanon,
  type PanelBlueprintPremium,
  computePanelContinuityPreflights,
  continuityPreflightBlockingReasons,
  isPipelineV3PremiumOnlyEnabled,
} from "@manga-ai-studio/core";
import { prisma, type Prisma } from "@manga-ai-studio/db";
import { readChapterStudioSnapshotFromOutline, patchChapterStudioSnapshot } from "../lib/chapter-studio/snapshot";

const DEFAULT_CHAPTER_ID = "cmoi8r3l30001pi2944d8ib11";

async function main() {
  const chapterId = process.argv[2]?.trim() || DEFAULT_CHAPTER_ID;
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    include: {
      project: {
        include: {
          characters: {
            select: {
              id: true,
              name: true,
              hairColor: true,
              eyeColor: true,
              appearance: true,
              outfitDefault: true,
            },
          },
        },
      },
    },
  });
  if (!chapter) {
    console.error(`[backfill] chapter not found: ${chapterId}`);
    process.exit(1);
  }

  const snapshot = readChapterStudioSnapshotFromOutline({
    outline: chapter.outline,
    chapterNumber: chapter.chapterNumber,
    chapterTitle: chapter.title,
  });
  const plan = snapshot.data.productionPlan;
  const bps = plan?.panelBlueprints;
  if (!Array.isArray(bps) || bps.length === 0) {
    console.error(`[backfill] no panelBlueprints on chapter ${chapterId}`);
    process.exit(1);
  }

  const canons = snapshot.data.characterCanons ?? [];
  const characterCanonsById = new Map<string, CharacterCanon>(
    canons.map((c) => [c.characterId, c] as const),
  );

  const hydrated = hydrateBlueprintsWithCharacterDna({
    blueprints: bps as PanelBlueprintPremium[],
    characters: chapter.project.characters,
    characterCanonsById,
  });

  if (isPipelineV3PremiumOnlyEnabled()) {
    const preflights = computePanelContinuityPreflights(hydrated);
    const blockers = continuityPreflightBlockingReasons(preflights);
    console.log(
      `[backfill] continuity_preflight panels=${preflights.length} blockers=${blockers.length}`,
    );
    if (blockers.length > 0) {
      console.warn(`[backfill] continuity_blockers sample=${JSON.stringify(blockers.slice(0, 5))}`);
    }
  }

  const nextStudio = patchChapterStudioSnapshot(
    chapter.outline,
    {
      productionPlan: {
        ...(plan as Record<string, unknown>),
        panelBlueprints: hydrated,
      },
    },
    {
      chapterNumber: chapter.chapterNumber,
      chapterTitle: chapter.title,
    },
  );

  const outlineRec = (chapter.outline ?? {}) as Record<string, unknown>;

  await prisma.chapter.update({
    where: { id: chapterId },
    data: {
      outline: {
        ...outlineRec,
        studio: nextStudio,
      } as Prisma.InputJsonValue,
    },
  });

  console.log(
    `[backfill] ok chapterId=${chapterId} panels=${hydrated.length} projectId=${chapter.projectId}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
