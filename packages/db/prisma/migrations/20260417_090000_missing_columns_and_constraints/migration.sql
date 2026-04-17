-- Fix: colonnes SceneImage absentes du schéma DB (jamais migrées)
ALTER TABLE "SceneImage" ADD COLUMN IF NOT EXISTS "panelCast" JSONB;
ALTER TABLE "SceneImage" ADD COLUMN IF NOT EXISTS "userValidatedAt" TIMESTAMP(3);

-- Fix: contrainte unique ChapterScene(chapterId, sceneNumber) manquante → upsert() planté
-- Supprime les doublons éventuels en gardant la ligne la plus récente
DELETE FROM "ChapterScene" a
USING "ChapterScene" b
WHERE a."createdAt" < b."createdAt"
  AND a."chapterId" = b."chapterId"
  AND a."sceneNumber" = b."sceneNumber";

CREATE UNIQUE INDEX IF NOT EXISTS "ChapterScene_chapterId_sceneNumber_key"
  ON "ChapterScene"("chapterId", "sceneNumber");

-- Fix: contrainte unique SceneImage(sceneId, panelNumber) manquante → upsert() planté
-- Supprime les doublons éventuels en gardant la ligne la plus récente
DELETE FROM "SceneImage" a
USING "SceneImage" b
WHERE a."createdAt" < b."createdAt"
  AND a."sceneId" = b."sceneId"
  AND a."panelNumber" = b."panelNumber";

CREATE UNIQUE INDEX IF NOT EXISTS "SceneImage_sceneId_panelNumber_key"
  ON "SceneImage"("sceneId", "panelNumber");
