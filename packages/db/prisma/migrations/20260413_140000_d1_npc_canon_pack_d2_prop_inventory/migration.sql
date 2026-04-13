-- D1 — NPC Canon Pack : cohérence visuelle des PNJ récurrents entre chapitres
CREATE TABLE IF NOT EXISTS "NpcCanonPack" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "npcSlug" TEXT NOT NULL,
  "npcDisplayName" TEXT NOT NULL,
  "visualSignatureText" TEXT,
  "hairColor" TEXT,
  "eyeColor" TEXT,
  "outfitDefault" TEXT,
  "speciesLabel" TEXT,
  "firstSeenChapterId" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NpcCanonPack_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "NpcCanonPack_projectId_npcSlug_key" ON "NpcCanonPack"("projectId", "npcSlug");
CREATE INDEX IF NOT EXISTS "NpcCanonPack_projectId_idx" ON "NpcCanonPack"("projectId");

ALTER TABLE "NpcCanonPack" ADD CONSTRAINT "NpcCanonPack_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- D2 — Character Prop Inventory : props acquis par les personnages (persistance cross-chapitres)
CREATE TABLE IF NOT EXISTS "CharacterPropInventory" (
  "id" TEXT NOT NULL,
  "characterId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "propCanonicalName" TEXT NOT NULL,
  "propCategory" TEXT NOT NULL,
  "propNarrativeRole" TEXT,
  "visualDescription" TEXT,
  "acquiredAtChapterId" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CharacterPropInventory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CharacterPropInventory_characterId_isActive_idx" ON "CharacterPropInventory"("characterId", "isActive");
CREATE INDEX IF NOT EXISTS "CharacterPropInventory_projectId_idx" ON "CharacterPropInventory"("projectId");

ALTER TABLE "CharacterPropInventory" ADD CONSTRAINT "CharacterPropInventory_characterId_fkey"
  FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CharacterPropInventory" ADD CONSTRAINT "CharacterPropInventory_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
