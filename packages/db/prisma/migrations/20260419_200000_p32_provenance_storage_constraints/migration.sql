-- P3.2 — Contraintes DB : provenance et storageProvider.
--
-- Objectif : empêcher qu'une ligne `MediaAsset` ou `CharacterVisualRef` soit
-- créée avec des valeurs de provenance incohérentes, au niveau DB. Jusqu'ici,
-- ces règles étaient uniquement garanties en TypeScript via
-- `assertStableCanonicalAsset` + `manual-visual-ref-policy`. Une écriture
-- directe (script de backfill, raw SQL, requête ad hoc) pouvait contourner
-- ces invariants silencieusement.
--
-- NB : cette migration N'EST PAS appliquée automatiquement par l'assistant.
-- À appliquer manuellement via `pnpm db:deploy` ou `pnpm prisma migrate deploy`
-- après avoir vérifié qu'aucune ligne existante ne viole les invariants.
--
-- Invariants posés :
--   1. `MediaAsset.storageProvider` ∈ {"supabase", "fal", "external", "other"}.
--      Valeur par défaut déjà "supabase" via schema.prisma.
--   2. Si `MediaAsset.storageProvider = 'supabase'`, alors `storageKey` NOT NULL.
--      Un asset Supabase sans storageKey est irrécupérable (pas de re-sign).
--   3. `CharacterVisualRef` : si `mediaAssetId IS NULL` (ref manuelle), alors
--      `metadata->>'source' = 'manual_import'` et `metadata->>'isCanonical' = 'false'`.
--      Empêche la canonisation silencieuse d'une URL externe.
--   4. Index partiel sur `CharacterVisualRef(characterId, isPrimary)` WHERE
--      archivedAt IS NULL AND isPrimary = true, pour accélérer les lookups
--      "ref primary courante".

-- ──────────────────────────────────────────────────────────────────────────
-- 1. MediaAsset.storageProvider : CHECK enum.
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE "MediaAsset"
  DROP CONSTRAINT IF EXISTS "MediaAsset_storageProvider_check";

ALTER TABLE "MediaAsset"
  ADD CONSTRAINT "MediaAsset_storageProvider_check"
  CHECK ("storageProvider" IN ('supabase', 'fal', 'external', 'other'));

-- ──────────────────────────────────────────────────────────────────────────
-- 2. MediaAsset : storageProvider='supabase' ⇒ storageKey NOT NULL.
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE "MediaAsset"
  DROP CONSTRAINT IF EXISTS "MediaAsset_supabase_requires_storage_key";

ALTER TABLE "MediaAsset"
  ADD CONSTRAINT "MediaAsset_supabase_requires_storage_key"
  CHECK (
    "storageProvider" <> 'supabase'
    OR "storageKey" IS NOT NULL
  );

-- ──────────────────────────────────────────────────────────────────────────
-- 3. CharacterVisualRef : provenance manuelle traçable.
--
-- Si aucune mediaAsset n'est liée (import manuel), la provenance DOIT être
-- explicitement tracée dans metadata. On s'appuie sur `metadata->>'source'`
-- et `metadata->>'isCanonical'`.
--
-- Note : on autorise metadata = '{}' pour les lignes LEGACY déjà persistées,
-- uniquement si mediaAssetId est non-null (ref issue de generate-visual).
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE "CharacterVisualRef"
  DROP CONSTRAINT IF EXISTS "CharacterVisualRef_manual_provenance_check";

ALTER TABLE "CharacterVisualRef"
  ADD CONSTRAINT "CharacterVisualRef_manual_provenance_check"
  CHECK (
    "mediaAssetId" IS NOT NULL
    OR (
      "metadata" ? 'source'
      AND "metadata"->>'source' = 'manual_import'
      AND "metadata" ? 'isCanonical'
      AND "metadata"->>'isCanonical' = 'false'
    )
  );

-- ──────────────────────────────────────────────────────────────────────────
-- 4. CharacterVisualRef : une seule ref primary non-archivée par character.
-- ──────────────────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS "CharacterVisualRef_characterId_primary_active_uniq";

CREATE UNIQUE INDEX IF NOT EXISTS "CharacterVisualRef_characterId_primary_active_uniq"
  ON "CharacterVisualRef" ("characterId")
  WHERE "isPrimary" = true AND "archivedAt" IS NULL;
