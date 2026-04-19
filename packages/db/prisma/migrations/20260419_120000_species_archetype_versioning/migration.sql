-- P1.2 — Versionnage & traçabilité des archétypes espèce.
--
-- Ajoute 3 colonnes à SpeciesArchetype pour permettre :
--   - `schemaVersion`  : bump quand le shape de baseVisualTraits évolue.
--   - `promptHash`     : SHA-256 du prompt utilisé pour générer les traits,
--                        permet d'invalider / régénérer quand le prompt change.
--   - `sourceModel`    : identifiant du modèle source ("openai:gpt-4o-mini",
--                        "catalog:local", "manual", …) pour audit et
--                        reproductibilité.
--
-- Ces 3 colonnes sont nullables / ont un default safe pour rester compatibles
-- avec les rows existantes (aucune migration de données nécessaire).

ALTER TABLE "SpeciesArchetype"
  ADD COLUMN IF NOT EXISTS "schemaVersion" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "SpeciesArchetype"
  ADD COLUMN IF NOT EXISTS "promptHash" TEXT;

ALTER TABLE "SpeciesArchetype"
  ADD COLUMN IF NOT EXISTS "sourceModel" TEXT;

CREATE INDEX IF NOT EXISTS "SpeciesArchetype_promptHash_idx"
  ON "SpeciesArchetype"("promptHash");
