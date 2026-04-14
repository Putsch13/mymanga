-- LAY-3 — Page Layout Engine : stocker le layout décidé dans ChapterScene
ALTER TABLE "ChapterScene" ADD COLUMN IF NOT EXISTS "pageLayoutTemplate" TEXT;
ALTER TABLE "ChapterScene" ADD COLUMN IF NOT EXISTS "dramaticWeight" DOUBLE PRECISION;
ALTER TABLE "ChapterScene" ADD COLUMN IF NOT EXISTS "isDoublePage" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ChapterScene" ADD COLUMN IF NOT EXISTS "isSplashPage" BOOLEAN NOT NULL DEFAULT false;
