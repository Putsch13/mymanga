import { Prisma, prisma } from "../src/index";

function pickCount(rows: Array<{ count: bigint }>) {
  return Number(rows[0]?.count ?? 0n);
}

async function main() {
  const [
    missingMediaAssetRefs,
    missingActiveLocks,
    scenesWithoutKeyframe,
    orphanPanelsWithoutSceneKeyframe,
    completedPanelsWithoutTrace,
    duplicateMediaAssetMatches,
    duplicateActiveLocks,
    duplicateLockVersions,
    duplicateSelectedKeyframes,
    duplicateKeyframeVersions,
  ] = await Promise.all([
    prisma.characterVisualRef.count({ where: { mediaAssetId: null } }),
    prisma.character.count({
      where: {
        visualRefs: { some: {} },
        visualLocks: { none: { isActive: true } },
      },
    }),
    prisma.chapterScene.count({ where: { keyframes: { none: {} } } }),
    prisma.sceneImage.count({
      where: {
        sceneKeyframeId: null,
        scene: { keyframes: { some: {} } },
      },
    }),
    prisma.sceneImage.count({
      where: {
        status: "completed",
        falTraces: { none: {} },
      },
    }),
    prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS count
      FROM (
        SELECT "projectId", "ownerType", "ownerId"
        FROM "MediaAsset"
        WHERE "ownerType" = 'character_visual_ref'
        GROUP BY "projectId", "ownerType", "ownerId"
        HAVING COUNT(*) > 1
      ) duplicate_media_assets
    `),
    prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS count
      FROM (
        SELECT "characterId"
        FROM "CharacterVisualLock"
        WHERE "isActive" = true
        GROUP BY "characterId"
        HAVING COUNT(*) > 1
      ) duplicate_active_locks
    `),
    prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS count
      FROM (
        SELECT "characterId", "version"
        FROM "CharacterVisualLock"
        GROUP BY "characterId", "version"
        HAVING COUNT(*) > 1
      ) duplicate_lock_versions
    `),
    prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS count
      FROM (
        SELECT "sceneId"
        FROM "SceneKeyframe"
        WHERE "selected" = true
        GROUP BY "sceneId"
        HAVING COUNT(*) > 1
      ) duplicate_selected_keyframes
    `),
    prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS count
      FROM (
        SELECT "sceneId", "version"
        FROM "SceneKeyframe"
        GROUP BY "sceneId", "version"
        HAVING COUNT(*) > 1
      ) duplicate_keyframe_versions
    `),
  ]);

  console.log(
    JSON.stringify(
      {
        missingMediaAssetRefs,
        missingActiveLocks,
        scenesWithoutKeyframe,
        orphanPanelsWithoutSceneKeyframe,
        completedPanelsWithoutTrace,
        duplicateMediaAssetMatches: pickCount(duplicateMediaAssetMatches),
        duplicateActiveLocks: pickCount(duplicateActiveLocks),
        duplicateLockVersions: pickCount(duplicateLockVersions),
        duplicateSelectedKeyframes: pickCount(duplicateSelectedKeyframes),
        duplicateKeyframeVersions: pickCount(duplicateKeyframeVersions),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error("[hard-switch-postchecks] failed", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
