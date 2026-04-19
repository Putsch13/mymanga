-- P3.2 preflight fix — MediaAsset supabase sans storageKey (legacy)
--
-- Contexte :
-- La migration `20260419_200000_p32_provenance_storage_constraints` ajoute la
-- contrainte CHECK :
--   storageProvider='supabase' ⇒ storageKey IS NOT NULL
-- Sur des DB legacy, certains `MediaAsset` ont `storageProvider='supabase'`
-- (valeur par défaut) mais `storageKey` NULL, ce qui fait échouer la migration
-- (Postgres 23514).
--
-- Ce script :
--   1) tente de déduire `bucket` + `storageKey` depuis `publicUrl`/`signedUrl`
--      quand l'URL correspond à un chemin Supabase object storage,
--   2) re-classifie en 'fal'/'external'/'other' les lignes restantes, plutôt que
--      de mentir en 'supabase' sans storageKey.
--
-- À exécuter AVANT `prisma migrate deploy` sur l'environnement cible.
-- Exemple :
--   pnpm --filter @manga-ai-studio/db exec prisma db execute \
--     --file prisma/p32-fix-mediaasset-supabase-storagekey.sql \
--     --schema prisma/schema.prisma

BEGIN;

-- 1) Dérive bucket/key depuis les URLs Supabase quand c'est possible.
UPDATE "MediaAsset"
SET
  "bucket" = COALESCE(
    "bucket",
    regexp_replace(
      COALESCE("publicUrl", "signedUrl"),
      '^.*?/storage/v1/object/(?:public|sign)/([^/]+)/.*$',
      '\1'
    )
  ),
  "storageKey" = regexp_replace(
    COALESCE("publicUrl", "signedUrl"),
    '^.*?/storage/v1/object/(?:public|sign)/[^/]+/([^?]+).*$',
    '\1'
  )
WHERE
  "storageProvider" = 'supabase'
  AND "storageKey" IS NULL
  AND COALESCE("publicUrl", "signedUrl") ~ '/storage/v1/object/(public|sign)/';

-- 2) Re-classifie le reste : supabase sans storageKey n'est pas re-signable.
UPDATE "MediaAsset"
SET "storageProvider" = CASE
  WHEN "falCdnUrl" IS NOT NULL THEN 'fal'
  WHEN "publicUrl" IS NOT NULL AND "publicUrl" NOT LIKE '%/storage/v1/object/%' THEN 'external'
  WHEN "signedUrl" IS NOT NULL AND "signedUrl" NOT LIKE '%/storage/v1/object/%' THEN 'external'
  ELSE 'other'
END
WHERE
  "storageProvider" = 'supabase'
  AND "storageKey" IS NULL;

COMMIT;

