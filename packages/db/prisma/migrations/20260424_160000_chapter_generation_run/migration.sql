-- P1.13–14 — Run de génération courant + filtrage QA / reader vs historique

ALTER TABLE "Chapter"
  ADD COLUMN IF NOT EXISTS "currentGenerationRunId" TEXT;

ALTER TABLE "SceneImage"
  ADD COLUMN IF NOT EXISTS "generationRunId" TEXT;

CREATE INDEX IF NOT EXISTS "SceneImage_generationRunId_idx"
  ON "SceneImage"("generationRunId");
