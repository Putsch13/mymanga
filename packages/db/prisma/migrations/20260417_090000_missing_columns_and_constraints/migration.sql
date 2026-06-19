-- Fix: colonnes SceneImage absentes du schéma DB (jamais migrées)
ALTER TABLE "SceneImage" ADD COLUMN IF NOT EXISTS "panelCast" JSONB;
ALTER TABLE "SceneImage" ADD COLUMN IF NOT EXISTS "userValidatedAt" TIMESTAMP(3);

-- Fix: dédoublonnage ChapterScene avant création contrainte unique
-- Garde la première ligne insérée (MIN ctid) par couple (chapterId, sceneNumber)
DELETE FROM "ChapterScene"
WHERE ctid NOT IN (
  SELECT MIN(ctid)
  FROM "ChapterScene"
  GROUP BY "chapterId", "sceneNumber"
);

CREATE UNIQUE INDEX IF NOT EXISTS "ChapterScene_chapterId_sceneNumber_key"
  ON "ChapterScene"("chapterId", "sceneNumber");

-- Fix: dédoublonnage SceneImage avant création contrainte unique
-- Garde la première ligne insérée (MIN ctid) par couple (sceneId, panelNumber)
DELETE FROM "SceneImage"
WHERE ctid NOT IN (
  SELECT MIN(ctid)
  FROM "SceneImage"
  GROUP BY "sceneId", "panelNumber"
);

CREATE UNIQUE INDEX IF NOT EXISTS "SceneImage_sceneId_panelNumber_key"
  ON "SceneImage"("sceneId", "panelNumber");
