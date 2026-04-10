-- Read-only checks for the hard-switch rollout.
-- Run before and after the real backfill to quantify and verify impact.

-- Character visual refs still missing a MediaAsset link
SELECT COUNT(*) AS missing_media_asset_refs
FROM "CharacterVisualRef"
WHERE "mediaAssetId" IS NULL;

-- Characters that still have refs but no active visual lock
SELECT COUNT(*) AS missing_active_visual_locks
FROM "Character" c
WHERE EXISTS (
  SELECT 1
  FROM "CharacterVisualRef" r
  WHERE r."characterId" = c."id"
)
AND NOT EXISTS (
  SELECT 1
  FROM "CharacterVisualLock" l
  WHERE l."characterId" = c."id"
    AND l."isActive" = TRUE
);

-- Scenes still missing a selected keyframe
SELECT COUNT(*) AS scenes_without_keyframe
FROM "ChapterScene" s
WHERE NOT EXISTS (
  SELECT 1
  FROM "SceneKeyframe" k
  WHERE k."sceneId" = s."id"
);

-- Panels still orphaned although their scene already has a keyframe
SELECT COUNT(*) AS orphan_panels_without_scene_keyframe
FROM "SceneImage" i
WHERE i."sceneKeyframeId" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "SceneKeyframe" k
    WHERE k."sceneId" = i."sceneId"
  );

-- Completed panels still missing a FalTrace
SELECT COUNT(*) AS completed_panels_without_trace
FROM "SceneImage" i
WHERE i."status" = 'completed'
  AND NOT EXISTS (
    SELECT 1
    FROM "FalTrace" t
    WHERE t."panelId" = i."id"
  );

-- Duplicate candidate check for MediaAsset backfill matching
SELECT "projectId", "ownerType", "ownerId", COUNT(*) AS duplicate_count
FROM "MediaAsset"
WHERE "ownerType" = 'character_visual_ref'
GROUP BY "projectId", "ownerType", "ownerId"
HAVING COUNT(*) > 1;

-- Multiple active locks should never happen after the partial unique is in place
SELECT "characterId", COUNT(*) AS duplicate_count
FROM "CharacterVisualLock"
WHERE "isActive" = TRUE
GROUP BY "characterId"
HAVING COUNT(*) > 1;

-- Duplicate candidate check for versioned character locks
SELECT "characterId", "version", COUNT(*) AS duplicate_count
FROM "CharacterVisualLock"
GROUP BY "characterId", "version"
HAVING COUNT(*) > 1;

-- Multiple selected keyframes should never happen after the partial unique is in place
SELECT "sceneId", COUNT(*) AS duplicate_count
FROM "SceneKeyframe"
WHERE "selected" = TRUE
GROUP BY "sceneId"
HAVING COUNT(*) > 1;

-- Duplicate candidate check for scene keyframe versions
SELECT "sceneId", "version", COUNT(*) AS duplicate_count
FROM "SceneKeyframe"
GROUP BY "sceneId", "version"
HAVING COUNT(*) > 1;
