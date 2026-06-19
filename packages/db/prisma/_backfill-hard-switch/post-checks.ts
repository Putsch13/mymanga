/**
 * Vérifications post-backfill : on s'assure qu'aucun "déchet" ne traîne
 * (refs sans MediaAsset, doubles locks actifs, scènes orphelines, etc.).
 */
import { prisma, Prisma } from "../../src/index";
import type { CliOptions } from "./types";

export type PostChecks = {
  missingMediaAssetRefs: number;
  missingActiveLocks: number;
  scenesWithoutKeyframe: number;
  orphanPanelsWithoutSceneKeyframe: number;
  completedPanelsWithoutTrace: number;
  charactersWithMultipleActiveLocks: number;
  scenesWithMultipleSelectedKeyframes: number;
};

export async function buildPostChecks(options: CliOptions): Promise<PostChecks> {
  const projectFilter = options.onlyProject ?? undefined;

  const [
    missingMediaAssetRefs,
    missingActiveLocks,
    scenesWithoutKeyframe,
    orphanPanelsWithoutSceneKeyframe,
    completedPanelsWithoutTrace,
    charactersWithMultipleActiveLocks,
    scenesWithMultipleSelectedKeyframes,
  ] = await Promise.all([
    prisma.characterVisualRef.count({
      where: {
        mediaAssetId: null,
        character: projectFilter ? { projectId: projectFilter } : undefined,
      },
    }),
    prisma.character.count({
      where: {
        projectId: projectFilter,
        visualRefs: { some: {} },
        visualLocks: { none: { isActive: true } },
      },
    }),
    prisma.chapterScene.count({
      where: {
        chapter: projectFilter ? { projectId: projectFilter } : undefined,
        keyframes: { none: {} },
      },
    }),
    prisma.sceneImage.count({
      where: {
        sceneKeyframeId: null,
        scene: {
          chapter: projectFilter ? { projectId: projectFilter } : undefined,
          keyframes: { some: {} },
        },
      },
    }),
    prisma.sceneImage.count({
      where: {
        status: "completed",
        scene: projectFilter ? { chapter: { projectId: projectFilter } } : undefined,
        falTraces: { none: {} },
      },
    }),
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM (
        SELECT "characterId"
        FROM "CharacterVisualLock"
        WHERE "isActive" = true
        ${projectFilter ? Prisma.sql`AND "projectId" = ${projectFilter}` : Prisma.empty}
        GROUP BY "characterId"
        HAVING COUNT(*) > 1
      ) duplicate_active_locks
    `,
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM (
        SELECT "sceneId"
        FROM "SceneKeyframe"
        WHERE "selected" = true
        ${projectFilter ? Prisma.sql`AND "projectId" = ${projectFilter}` : Prisma.empty}
        GROUP BY "sceneId"
        HAVING COUNT(*) > 1
      ) duplicate_selected_keyframes
    `,
  ]);

  return {
    missingMediaAssetRefs,
    missingActiveLocks,
    scenesWithoutKeyframe,
    orphanPanelsWithoutSceneKeyframe,
    completedPanelsWithoutTrace,
    charactersWithMultipleActiveLocks: Number(
      charactersWithMultipleActiveLocks[0]?.count ?? 0n,
    ),
    scenesWithMultipleSelectedKeyframes: Number(
      scenesWithMultipleSelectedKeyframes[0]?.count ?? 0n,
    ),
  };
}
