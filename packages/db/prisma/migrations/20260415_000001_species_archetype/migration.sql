-- Ajouter speciesLabel à NpcVisualProfile
ALTER TABLE "NpcVisualProfile" ADD COLUMN IF NOT EXISTS "speciesLabel" TEXT;

CREATE TABLE "SpeciesArchetype" (
  "id"                TEXT NOT NULL PRIMARY KEY,
  "projectId"         TEXT NOT NULL,
  "label"             TEXT NOT NULL,
  "labelNormalized"   TEXT NOT NULL,
  "baseVisualTraits"  JSONB NOT NULL DEFAULT '{}',
  "promptFragment"    TEXT,
  "generatedByAI"     BOOLEAN NOT NULL DEFAULT true,
  "memberCount"       INTEGER NOT NULL DEFAULT 0,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SpeciesArchetype_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "SpeciesArchetype_projectId_labelNormalized_key"
  ON "SpeciesArchetype"("projectId", "labelNormalized");

CREATE INDEX "SpeciesArchetype_projectId_idx" ON "SpeciesArchetype"("projectId");
