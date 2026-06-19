-- Location slug canonicalization: backfill null slugs from name then enforce
-- project-scoped uniqueness on slug. Without this, two chapters that refer to
-- "Le Marché Noir" and "marché-noir" create two distinct Location rows and
-- NpcVisualProfile ends up split across them (break cross-chapter continuity).

-- 1. Backfill null slugs from the name using the same normalization rules as
--    packages/memory/src/scene-extras-registry.ts#normalizeLocationKey.
--    On passe par translate() pour désaccentuer sans dépendre de l'extension
--    `unaccent` (qui n'est pas activée sur toutes les bases de prod).
UPDATE "Location"
SET "slug" = regexp_replace(
  regexp_replace(
    lower(
      translate(
        "name",
        'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖØòóôõöøÙÚÛÜùúûüÇçÑñÿŸ',
        'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOOooooooUUUUuuuuCcNnyY'
      )
    ),
    '[^a-z0-9]+', '-', 'g'
  ),
  '(^-|-$)', '', 'g'
)
WHERE "slug" IS NULL AND "name" IS NOT NULL;

-- 2. Déduplique les lignes qui partagent (projectId, slug) en suffixant par id.
--    Garantit que l'index unique ci-dessous ne casse pas sur des bases déjà
--    polluées par des doublons historiques.
WITH dupes AS (
  SELECT
    id,
    "projectId",
    slug,
    ROW_NUMBER() OVER (PARTITION BY "projectId", slug ORDER BY "id") AS rn
  FROM "Location"
  WHERE slug IS NOT NULL
)
UPDATE "Location" l
SET slug = l.slug || '-' || substring(l.id, 1, 6)
FROM dupes d
WHERE l.id = d.id AND d.rn > 1;

-- 3. Index unique partiel (on laisse NULL libre pour compat rétro)
CREATE UNIQUE INDEX IF NOT EXISTS "Location_projectId_slug_key"
  ON "Location" ("projectId", slug)
  WHERE slug IS NOT NULL;
