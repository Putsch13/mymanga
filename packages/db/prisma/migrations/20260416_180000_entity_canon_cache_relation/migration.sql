-- I02: add Project relation to EntityCanonCache (if table already exists, just add FK)
ALTER TABLE "EntityCanonCache" ADD COLUMN IF NOT EXISTS "projectId" TEXT;
ALTER TABLE "EntityCanonCache" ADD CONSTRAINT "EntityCanonCache_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
