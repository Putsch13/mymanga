-- DECOR-1 : Ajout des champs d'ancrage visuel cross-chapitres sur Location
ALTER TABLE "Location"
  ADD COLUMN IF NOT EXISTS "establishedVisualBrief" TEXT,
  ADD COLUMN IF NOT EXISTS "firstSeenChapterId" TEXT,
  ADD COLUMN IF NOT EXISTS "canonImageUrl" TEXT;
