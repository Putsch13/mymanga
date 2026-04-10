-- CreateEnum
CREATE TYPE "MediaAssetType" AS ENUM ('character_ref', 'face_crop', 'action_ref', 'npc_ref', 'scene_keyframe', 'panel_output', 'training_zip', 'lora_weights', 'lora_config', 'trace_payload', 'trace_response', 'other');

-- CreateEnum
CREATE TYPE "MediaAssetOrigin" AS ENUM ('user_upload', 'generated', 'fal_upload', 'fal_output', 'derived_crop', 'system');

-- CreateEnum
CREATE TYPE "FalMode" AS ENUM ('text2img', 'img2img', 'lora_training');

-- CreateEnum
CREATE TYPE "FalTraceStatus" AS ENUM ('submitted', 'running', 'completed', 'failed', 'timeout', 'canceled');

-- CreateEnum
CREATE TYPE "NpcImportanceLevel" AS ENUM ('generic', 'recurring', 'important');

-- CreateEnum
CREATE TYPE "NpcPromotionStatus" AS ENUM ('candidate', 'promoted', 'locked');

-- AlterTable
ALTER TABLE "CharacterVisualRef" ADD COLUMN     "mediaAssetId" TEXT,
ADD COLUMN     "sourceVisualLockId" TEXT;

-- AlterTable
ALTER TABLE "LoraModel" ADD COLUMN     "configAssetId" TEXT,
ADD COLUMN     "weightsAssetId" TEXT;

-- AlterTable
ALTER TABLE "SceneImage" ADD COLUMN     "mediaAssetId" TEXT,
ADD COLUMN     "sceneKeyframeId" TEXT;

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "chapterId" TEXT,
    "sceneId" TEXT,
    "characterId" TEXT,
    "type" "MediaAssetType" NOT NULL,
    "origin" "MediaAssetOrigin" NOT NULL,
    "ownerType" TEXT,
    "ownerId" TEXT,
    "storageProvider" TEXT NOT NULL DEFAULT 'supabase',
    "bucket" TEXT,
    "storageKey" TEXT,
    "publicUrl" TEXT,
    "signedUrl" TEXT,
    "falCdnUrl" TEXT,
    "sha256" TEXT,
    "mimeType" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "bytes" INTEGER,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterVisualLock" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "displayName" TEXT NOT NULL,
    "shortVisualCore" TEXT NOT NULL,
    "triggerWord" TEXT,
    "loraModelId" TEXT,
    "loraAssetId" TEXT,
    "faceCloseupAssetId" TEXT,
    "actionRefAssetId" TEXT,
    "canonicalRefUrls" JSONB NOT NULL DEFAULT '[]',
    "defaultOutfit" TEXT,
    "altOutfits" JSONB NOT NULL DEFAULT '[]',
    "currentState" JSONB NOT NULL DEFAULT '{}',
    "injuryState" JSONB NOT NULL DEFAULT '{}',
    "ageVariant" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterVisualLock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NpcVisualProfile" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sceneId" TEXT,
    "locationId" TEXT,
    "characterId" TEXT,
    "stableNpcId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "shortVisualCore" TEXT NOT NULL,
    "outfitSignature" TEXT,
    "silhouetteSignature" TEXT,
    "accessoryMarker" TEXT,
    "relationToLocation" TEXT,
    "importanceLevel" "NpcImportanceLevel" NOT NULL DEFAULT 'generic',
    "promotionStatus" "NpcPromotionStatus" NOT NULL DEFAULT 'candidate',
    "appearanceCount" INTEGER NOT NULL DEFAULT 1,
    "canonicalRefAssetId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NpcVisualProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SceneKeyframe" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "sceneId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "selected" BOOLEAN NOT NULL DEFAULT true,
    "imageAssetId" TEXT,
    "imageUrl" TEXT,
    "involvedCharacterIds" JSONB NOT NULL DEFAULT '[]',
    "environmentLock" JSONB NOT NULL DEFAULT '{}',
    "lightingLock" TEXT,
    "timeOfDay" TEXT,
    "compositionArchetype" TEXT,
    "emotionalTone" TEXT,
    "combatMode" BOOLEAN NOT NULL DEFAULT false,
    "referenceCropAssetIds" JSONB NOT NULL DEFAULT '[]',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SceneKeyframe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FalTrace" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "chapterId" TEXT,
    "sceneId" TEXT,
    "panelId" TEXT,
    "characterId" TEXT,
    "npcVisualProfileId" TEXT,
    "sceneKeyframeId" TEXT,
    "visualLockId" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "mode" "FalMode" NOT NULL,
    "status" "FalTraceStatus" NOT NULL DEFAULT 'submitted',
    "requestId" TEXT,
    "jobId" TEXT,
    "requestAssetId" TEXT,
    "responseAssetId" TEXT,
    "requestPayload" JSONB NOT NULL DEFAULT '{}',
    "responsePayload" JSONB NOT NULL DEFAULT '{}',
    "refsUsed" JSONB NOT NULL DEFAULT '[]',
    "lorasUsed" JSONB NOT NULL DEFAULT '[]',
    "timings" JSONB NOT NULL DEFAULT '{}',
    "error" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FalTrace_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MediaAsset_projectId_type_idx" ON "MediaAsset"("projectId", "type");

-- CreateIndex
CREATE INDEX "MediaAsset_chapterId_idx" ON "MediaAsset"("chapterId");

-- CreateIndex
CREATE INDEX "MediaAsset_sceneId_idx" ON "MediaAsset"("sceneId");

-- CreateIndex
CREATE INDEX "MediaAsset_characterId_idx" ON "MediaAsset"("characterId");

-- CreateIndex
CREATE INDEX "MediaAsset_projectId_type_ownerType_ownerId_idx" ON "MediaAsset"("projectId", "type", "ownerType", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_projectId_sha256_key" ON "MediaAsset"("projectId", "sha256");

-- CreateIndex
CREATE INDEX "CharacterVisualLock_projectId_characterId_isActive_idx" ON "CharacterVisualLock"("projectId", "characterId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "CharacterVisualLock_characterId_version_key" ON "CharacterVisualLock"("characterId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "CharacterVisualLock_one_active_per_character_idx" ON "CharacterVisualLock"("characterId") WHERE "isActive" = true;

-- CreateIndex
CREATE UNIQUE INDEX "NpcVisualProfile_stableNpcId_key" ON "NpcVisualProfile"("stableNpcId");

-- CreateIndex
CREATE INDEX "NpcVisualProfile_projectId_importanceLevel_idx" ON "NpcVisualProfile"("projectId", "importanceLevel");

-- CreateIndex
CREATE INDEX "NpcVisualProfile_sceneId_idx" ON "NpcVisualProfile"("sceneId");

-- CreateIndex
CREATE INDEX "NpcVisualProfile_locationId_idx" ON "NpcVisualProfile"("locationId");

-- CreateIndex
CREATE INDEX "NpcVisualProfile_characterId_idx" ON "NpcVisualProfile"("characterId");

-- CreateIndex
CREATE INDEX "SceneKeyframe_projectId_chapterId_sceneId_selected_idx" ON "SceneKeyframe"("projectId", "chapterId", "sceneId", "selected");

-- CreateIndex
CREATE UNIQUE INDEX "SceneKeyframe_sceneId_version_key" ON "SceneKeyframe"("sceneId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "SceneKeyframe_one_selected_per_scene_idx" ON "SceneKeyframe"("sceneId") WHERE "selected" = true;

-- CreateIndex
CREATE INDEX "FalTrace_projectId_chapterId_sceneId_idx" ON "FalTrace"("projectId", "chapterId", "sceneId");

-- CreateIndex
CREATE INDEX "FalTrace_panelId_idx" ON "FalTrace"("panelId");

-- CreateIndex
CREATE INDEX "FalTrace_sceneKeyframeId_idx" ON "FalTrace"("sceneKeyframeId");

-- CreateIndex
CREATE INDEX "FalTrace_characterId_idx" ON "FalTrace"("characterId");

-- CreateIndex
CREATE INDEX "FalTrace_status_createdAt_idx" ON "FalTrace"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "CharacterVisualRef" ADD CONSTRAINT "CharacterVisualRef_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterVisualRef" ADD CONSTRAINT "CharacterVisualRef_sourceVisualLockId_fkey" FOREIGN KEY ("sourceVisualLockId") REFERENCES "CharacterVisualLock"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoraModel" ADD CONSTRAINT "LoraModel_weightsAssetId_fkey" FOREIGN KEY ("weightsAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoraModel" ADD CONSTRAINT "LoraModel_configAssetId_fkey" FOREIGN KEY ("configAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SceneImage" ADD CONSTRAINT "SceneImage_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SceneImage" ADD CONSTRAINT "SceneImage_sceneKeyframeId_fkey" FOREIGN KEY ("sceneKeyframeId") REFERENCES "SceneKeyframe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "ChapterScene"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterVisualLock" ADD CONSTRAINT "CharacterVisualLock_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterVisualLock" ADD CONSTRAINT "CharacterVisualLock_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterVisualLock" ADD CONSTRAINT "CharacterVisualLock_loraModelId_fkey" FOREIGN KEY ("loraModelId") REFERENCES "LoraModel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterVisualLock" ADD CONSTRAINT "CharacterVisualLock_loraAssetId_fkey" FOREIGN KEY ("loraAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterVisualLock" ADD CONSTRAINT "CharacterVisualLock_faceCloseupAssetId_fkey" FOREIGN KEY ("faceCloseupAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterVisualLock" ADD CONSTRAINT "CharacterVisualLock_actionRefAssetId_fkey" FOREIGN KEY ("actionRefAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NpcVisualProfile" ADD CONSTRAINT "NpcVisualProfile_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NpcVisualProfile" ADD CONSTRAINT "NpcVisualProfile_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "ChapterScene"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NpcVisualProfile" ADD CONSTRAINT "NpcVisualProfile_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NpcVisualProfile" ADD CONSTRAINT "NpcVisualProfile_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NpcVisualProfile" ADD CONSTRAINT "NpcVisualProfile_canonicalRefAssetId_fkey" FOREIGN KEY ("canonicalRefAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SceneKeyframe" ADD CONSTRAINT "SceneKeyframe_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SceneKeyframe" ADD CONSTRAINT "SceneKeyframe_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SceneKeyframe" ADD CONSTRAINT "SceneKeyframe_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "ChapterScene"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SceneKeyframe" ADD CONSTRAINT "SceneKeyframe_imageAssetId_fkey" FOREIGN KEY ("imageAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Column documentation
COMMENT ON COLUMN "SceneKeyframe"."imageAssetId" IS 'Primary source of truth for the persisted keyframe binary asset when available.';
COMMENT ON COLUMN "SceneKeyframe"."imageUrl" IS 'Legacy and compatibility fallback URL. Allowed when no MediaAsset exists yet; not the preferred source of truth.';

-- AddForeignKey
ALTER TABLE "FalTrace" ADD CONSTRAINT "FalTrace_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FalTrace" ADD CONSTRAINT "FalTrace_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FalTrace" ADD CONSTRAINT "FalTrace_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "ChapterScene"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FalTrace" ADD CONSTRAINT "FalTrace_panelId_fkey" FOREIGN KEY ("panelId") REFERENCES "SceneImage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FalTrace" ADD CONSTRAINT "FalTrace_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FalTrace" ADD CONSTRAINT "FalTrace_npcVisualProfileId_fkey" FOREIGN KEY ("npcVisualProfileId") REFERENCES "NpcVisualProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FalTrace" ADD CONSTRAINT "FalTrace_sceneKeyframeId_fkey" FOREIGN KEY ("sceneKeyframeId") REFERENCES "SceneKeyframe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FalTrace" ADD CONSTRAINT "FalTrace_visualLockId_fkey" FOREIGN KEY ("visualLockId") REFERENCES "CharacterVisualLock"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FalTrace" ADD CONSTRAINT "FalTrace_requestAssetId_fkey" FOREIGN KEY ("requestAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FalTrace" ADD CONSTRAINT "FalTrace_responseAssetId_fkey" FOREIGN KEY ("responseAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
