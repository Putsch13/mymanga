-- CTO hardening plan P0 + P1 : 3 nouvelles colonnes.
-- NB : cette migration N'EST PAS appliquée automatiquement par l'assistant.
-- À appliquer manuellement via `pnpm db:deploy` ou `pnpm prisma migrate deploy`
-- (ou `pnpm db:push` en dev) avant d'exécuter les backfills associés.

-- P0.8 — Chapter.narrativeCommitId : verrou transactionnel narrative-pass.
-- Nullable pour rester backward-compatible avec les chapters legacy.
ALTER TABLE "Chapter" ADD COLUMN IF NOT EXISTS "narrativeCommitId" TEXT;

-- P0.6 — CharacterVisualRef.archivedAt : soft-delete côté PATCH visualRefs.
ALTER TABLE "CharacterVisualRef" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);

-- P1.3 — Location.visualRefs : refs visuelles canoniques d'un lieu.
-- Stocke un array JSON de { url, type, capturedFromChapterId, capturedAt }.
ALTER TABLE "Location" ADD COLUMN IF NOT EXISTS "visualRefs" JSONB NOT NULL DEFAULT '[]';
