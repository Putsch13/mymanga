-- Legacy read-only checks to run before baseline or hard-switch migration.
-- These queries only target the currently deployed production schema.

SELECT COUNT(*) AS character_visual_refs
FROM "CharacterVisualRef";

SELECT COUNT(*) AS characters_with_visual_refs
FROM "Character" c
WHERE EXISTS (
  SELECT 1
  FROM "CharacterVisualRef" r
  WHERE r."characterId" = c."id"
);

SELECT COUNT(*) AS chapter_scenes
FROM "ChapterScene";

SELECT COUNT(*) AS total_scene_images
FROM "SceneImage";

SELECT COUNT(*) AS completed_scene_images
FROM "SceneImage"
WHERE "status" = 'completed';

SELECT COUNT(*) AS lora_models
FROM "LoraModel";
