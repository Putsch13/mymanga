-- I02: create EntityCanonCache table with Project relation
CREATE TABLE IF NOT EXISTS "EntityCanonCache" (
  "id"                  TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "projectId"           TEXT NOT NULL,
  "canonicalName"       TEXT NOT NULL,
  "entityKind"          TEXT NOT NULL,
  "speciesLabel"        TEXT,
  "dialogueMode"        TEXT NOT NULL DEFAULT 'spoken',
  "recurrencePolicy"    TEXT NOT NULL DEFAULT 'recurring',
  "typicalAppearance"   TEXT NOT NULL DEFAULT '',
  "canonicalVisualCore" TEXT NOT NULL DEFAULT '',
  "confidence"          DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "source"              TEXT NOT NULL DEFAULT 'llm',
  "appearanceCount"     INTEGER NOT NULL DEFAULT 1,
  "firstSeenChapterId"  TEXT,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EntityCanonCache_pkey" PRIMARY KEY ("id")
);

-- FK to Project (cascade delete)
ALTER TABLE "EntityCanonCache"
  ADD CONSTRAINT "EntityCanonCache_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Unique index and search index
CREATE UNIQUE INDEX IF NOT EXISTS "EntityCanonCache_projectId_canonicalName_key"
  ON "EntityCanonCache"("projectId", "canonicalName");

CREATE INDEX IF NOT EXISTS "EntityCanonCache_projectId_idx"
  ON "EntityCanonCache"("projectId");
