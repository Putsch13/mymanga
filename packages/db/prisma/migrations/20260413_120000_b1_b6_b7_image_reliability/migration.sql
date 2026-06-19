-- B1-1 : Fiabilité images — failureReason explicite + B1-2 retry par criticité + B1-3 URL persistée
ALTER TABLE "SceneImage"
  ADD COLUMN IF NOT EXISTS "failureReason" TEXT,
  ADD COLUMN IF NOT EXISTS "retryCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "maxRetries" INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS "persistedUrl" TEXT;

-- B7-1 : LoRA training automatique
ALTER TABLE "Character"
  ADD COLUMN IF NOT EXISTS "loraStatus" TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS "loraReadyAt" TIMESTAMP(3);

-- B6-3 : Quality gate warning sur le chapitre
ALTER TABLE "Chapter"
  ADD COLUMN IF NOT EXISTS "qualityGateWarning" BOOLEAN NOT NULL DEFAULT false;
