-- World entities auto-detected from chapter intent (LLM extraction).
-- USER-WINS persistence: once `userEdited = true`, regenerations never overwrite
-- user-modified fields.

CREATE TABLE "NpcGroup" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "visualProfile" TEXT,
    "outfit" TEXT,
    "silhouette" TEXT,
    "source" TEXT NOT NULL DEFAULT 'intent_compile_llm',
    "userEdited" BOOLEAN NOT NULL DEFAULT false,
    "firstSeenChapterId" TEXT,
    "appearanceCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NpcGroup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NpcGroup_projectId_slug_key" ON "NpcGroup"("projectId", "slug");
CREATE INDEX "NpcGroup_projectId_idx" ON "NpcGroup"("projectId");

ALTER TABLE "NpcGroup" ADD CONSTRAINT "NpcGroup_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;


CREATE TABLE "WorldProp" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "visualDescription" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'other',
    "narrativeWeight" TEXT NOT NULL DEFAULT 'recurring',
    "source" TEXT NOT NULL DEFAULT 'intent_compile_llm',
    "userEdited" BOOLEAN NOT NULL DEFAULT false,
    "firstSeenChapterId" TEXT,
    "appearanceCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorldProp_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorldProp_projectId_slug_key" ON "WorldProp"("projectId", "slug");
CREATE INDEX "WorldProp_projectId_idx" ON "WorldProp"("projectId");
CREATE INDEX "WorldProp_projectId_kind_idx" ON "WorldProp"("projectId", "kind");

ALTER TABLE "WorldProp" ADD CONSTRAINT "WorldProp_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
