-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('user', 'admin');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('draft', 'active', 'archived');

-- CreateEnum
CREATE TYPE "ContentRating" AS ENUM ('GENERAL', 'TEEN', 'MATURE', 'ADULT_RESTRICTED');

-- CreateEnum
CREATE TYPE "ContentIntensityLayer" AS ENUM ('GENERAL_SAFE', 'TEEN', 'MATURE_DRAMA', 'MATURE_VISUAL', 'RESTRICTED_BLOCKED_VISUAL', 'ADULT_EXPLICIT');

-- CreateEnum
CREATE TYPE "RenderFamily" AS ENUM ('manga', 'anime', 'semi_realistic', 'gothic', 'horror', 'western');

-- CreateEnum
CREATE TYPE "LineWeight" AS ENUM ('fine', 'medium', 'heavy');

-- CreateEnum
CREATE TYPE "ShadingMode" AS ENUM ('cel_shading', 'ink_bw', 'hatching', 'painterly');

-- CreateEnum
CREATE TYPE "ContrastProfile" AS ENUM ('soft', 'dramatic', 'brutal');

-- CreateEnum
CREATE TYPE "AnatomyBias" AS ENUM ('stylized', 'grounded', 'realistic');

-- CreateEnum
CREATE TYPE "BackgroundDensity" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "CameraLanguage" AS ENUM ('cinematic', 'manga_dynamic', 'intimate', 'horror_claustrophobic');

-- CreateEnum
CREATE TYPE "RenderingMode" AS ENUM ('CHARACTER_SHEET', 'CHARACTER_EXPRESSION_SET', 'OUTFIT_VARIATION', 'LOCATION_KEYFRAME', 'PANEL_DRAFT', 'PANEL_FINAL', 'COVER_ART', 'INPAINT_FIX', 'POSE_LOCK_VARIATION', 'STYLE_TRANSFER_VARIATION', 'SCENE_KEYFRAME', 'STYLE_FRAME');

-- CreateEnum
CREATE TYPE "CanonPackSlot" AS ENUM ('face_portrait', 'full_body_front', 'full_body_three_quarter', 'side_profile', 'expression_1', 'expression_2', 'expression_3', 'expression_4', 'expression_5', 'expression_6', 'pose_1', 'pose_2', 'pose_3', 'outfit_standard', 'outfit_variant');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('BUILD_PROJECT_CONTEXT', 'GENERATE_CHARACTER_PROFILE', 'GENERATE_CHARACTER_VISUAL', 'GENERATE_STYLE_PACK_ASSETS', 'GENERATE_CHARACTER_CANON_PACK', 'GENERATE_CHAPTER_OUTLINE', 'GENERATE_CHAPTER_SCRIPT', 'GENERATE_DIALOGUES', 'GENERATE_STORYBOARD', 'GENERATE_SCENE_KEY_ART', 'RENDER_PANEL_DRAFT', 'RENDER_PANEL_FINAL', 'IMAGE_INPAINT_FIX', 'IMAGE_UPSCALE', 'GENERATE_SCENE_IMAGES', 'UPDATE_MEMORY', 'RUN_CANON_VALIDATION', 'COMPUTE_CONSISTENCY_SCORE', 'EXPORT_PDF');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('queued', 'running', 'waiting_external', 'partial_success', 'completed', 'failed', 'canceled', 'refunded');

-- CreateEnum
CREATE TYPE "WalletTransactionType" AS ENUM ('purchase', 'debit', 'refund', 'adjustment');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "supabaseAuthId" TEXT,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'user',
    "locale" TEXT NOT NULL DEFAULT 'fr',
    "ageVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPreferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "defaultLanguage" TEXT NOT NULL DEFAULT 'fr',
    "matureContentEnabled" BOOLEAN NOT NULL DEFAULT false,
    "preferredGenres" JSONB NOT NULL DEFAULT '[]',
    "preferredVisualStyle" TEXT,

    CONSTRAINT "UserPreferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "pitch" TEXT,
    "description" TEXT,
    "primaryGenre" TEXT,
    "subGenres" JSONB NOT NULL DEFAULT '[]',
    "tone" TEXT,
    "format" TEXT,
    "contentRating" "ContentRating" NOT NULL DEFAULT 'GENERAL',
    "intensityLayer" "ContentIntensityLayer" NOT NULL DEFAULT 'GENERAL_SAFE',
    "visualStyle" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectSettings" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "violenceLevel" INTEGER NOT NULL DEFAULT 0,
    "romanceLevel" INTEGER NOT NULL DEFAULT 0,
    "sensualityLevel" INTEGER NOT NULL DEFAULT 0,
    "darknessLevel" INTEGER NOT NULL DEFAULT 0,
    "mysteryLevel" INTEGER NOT NULL DEFAULT 0,
    "realismLevel" INTEGER NOT NULL DEFAULT 0,
    "pacingLevel" INTEGER NOT NULL DEFAULT 0,
    "dialogueDensity" INTEGER NOT NULL DEFAULT 0,
    "maxTokensPerJob" INTEGER NOT NULL DEFAULT 10000,
    "canonStrictness" INTEGER NOT NULL DEFAULT 80,

    CONSTRAINT "ProjectSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StylePack" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "renderFamily" "RenderFamily" NOT NULL DEFAULT 'manga',
    "lineWeight" "LineWeight" NOT NULL DEFAULT 'medium',
    "shadingMode" "ShadingMode" NOT NULL DEFAULT 'ink_bw',
    "contrastProfile" "ContrastProfile" NOT NULL DEFAULT 'dramatic',
    "anatomyBias" "AnatomyBias" NOT NULL DEFAULT 'stylized',
    "backgroundDensity" "BackgroundDensity" NOT NULL DEFAULT 'medium',
    "cameraLanguage" "CameraLanguage" NOT NULL DEFAULT 'manga_dynamic',
    "approvedLoraIds" JSONB NOT NULL DEFAULT '[]',
    "negativeConstraints" JSONB NOT NULL DEFAULT '[]',
    "styleRefImageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StylePack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryBible" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "summary" TEXT,
    "worldRules" JSONB NOT NULL DEFAULT '{}',
    "themes" JSONB NOT NULL DEFAULT '[]',
    "lore" JSONB NOT NULL DEFAULT '{}',
    "glossary" JSONB NOT NULL DEFAULT '{}',
    "lockedCanon" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoryBible_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Character" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "roleType" TEXT,
    "age" INTEGER,
    "adultVerified" BOOLEAN NOT NULL DEFAULT false,
    "pronouns" TEXT,
    "biography" TEXT,
    "objective" TEXT,
    "fear" TEXT,
    "trauma" TEXT,
    "personality" JSONB NOT NULL DEFAULT '{}',
    "traits" JSONB NOT NULL DEFAULT '[]',
    "flaws" JSONB NOT NULL DEFAULT '[]',
    "secrets" JSONB NOT NULL DEFAULT '[]',
    "appearance" TEXT,
    "outfitDefault" TEXT,
    "bodyProfile" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'alive',
    "emotionalState" TEXT,
    "canonLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "eyeColor" TEXT,
    "hairColor" TEXT,
    "adultContentProfile" JSONB NOT NULL DEFAULT '{}',
    "bodyState" JSONB NOT NULL DEFAULT '{}',
    "continuityProfile" JSONB NOT NULL DEFAULT '{}',
    "speechProfile" JSONB NOT NULL DEFAULT '{}',
    "visualProfile" JSONB NOT NULL DEFAULT '{}',
    "wardrobeProfile" JSONB NOT NULL DEFAULT '{}',
    "gender" TEXT,
    "autoGenerated" BOOLEAN NOT NULL DEFAULT false,
    "canChangeHair" BOOLEAN NOT NULL DEFAULT false,
    "canChangeOutfitFreely" BOOLEAN NOT NULL DEFAULT true,
    "canChangeSpeechRegister" BOOLEAN NOT NULL DEFAULT false,
    "canChangeVisibleScars" BOOLEAN NOT NULL DEFAULT false,
    "requiresCanonApprovalFor" JSONB NOT NULL DEFAULT '[]',
    "stablePsycheDNA" JSONB NOT NULL DEFAULT '{}',
    "stableSpeechDNA" JSONB NOT NULL DEFAULT '{}',
    "stableVisualDNA" JSONB NOT NULL DEFAULT '{}',
    "voiceAggressionLevel" DOUBLE PRECISION,
    "voiceEmotionalLeak" DOUBLE PRECISION,
    "voiceExamplesCanonical" JSONB NOT NULL DEFAULT '[]',
    "voiceFavoriteExpressions" JSONB NOT NULL DEFAULT '[]',
    "voiceForbiddenExpressions" JSONB NOT NULL DEFAULT '[]',
    "voiceForbiddenPatterns" JSONB NOT NULL DEFAULT '[]',
    "voiceInnerMonologueStyle" TEXT,
    "voiceLieStyle" TEXT,
    "voiceRegister" TEXT,
    "voiceSarcasmLevel" DOUBLE PRECISION,
    "voiceSeductionStyle" TEXT,
    "voiceSentenceLength" TEXT,
    "voiceSilenceFrequency" DOUBLE PRECISION,
    "voiceSpeechRules" JSONB NOT NULL DEFAULT '[]',
    "voiceThreatenStyle" TEXT,
    "voiceVocabularyStyle" TEXT,
    "characterFingerprint" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "Character_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterVisualRef" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "promptSnapshot" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CharacterVisualRef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterCanonPack" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "visualSignatureText" TEXT,
    "forbiddenVisualDrift" JSONB NOT NULL DEFAULT '[]',
    "completenessScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterCanonPack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CanonPackAsset" (
    "id" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "slot" "CanonPackSlot" NOT NULL,
    "imageUrl" TEXT,
    "refId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CanonPackAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoraModel" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "weightsMeta" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoraModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoraAttachment" (
    "id" TEXT NOT NULL,
    "loraId" TEXT NOT NULL,
    "projectId" TEXT,
    "stylePackId" TEXT,
    "characterId" TEXT,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "renderingModeFilter" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoraAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterRelationship" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sourceCharacterId" TEXT NOT NULL,
    "targetCharacterId" TEXT NOT NULL,
    "relationType" TEXT NOT NULL,
    "intensity" INTEGER NOT NULL DEFAULT 50,
    "reciprocityType" TEXT NOT NULL DEFAULT 'bilateral',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "description" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "canonLocked" BOOLEAN NOT NULL DEFAULT false,
    "aliases" JSONB NOT NULL DEFAULT '[]',
    "parentId" TEXT,
    "slug" TEXT,
    "visualBrief" TEXT,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "description" TEXT,
    "ownerCharacterId" TEXT,
    "state" JSONB NOT NULL DEFAULT '{}',
    "canonLocked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Arc" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "summary" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "startChapterNumber" INTEGER,
    "endChapterNumber" INTEGER,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "Arc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chapter" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "chapterNumber" INTEGER NOT NULL,
    "title" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "userIntent" TEXT,
    "outline" JSONB NOT NULL DEFAULT '{}',
    "script" JSONB NOT NULL DEFAULT '{}',
    "storyboard" JSONB NOT NULL DEFAULT '{}',
    "summary" TEXT,
    "cliffhanger" TEXT,
    "tokenEstimate" INTEGER,
    "tokenActual" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "coverImageUrl" TEXT,

    CONSTRAINT "Chapter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChapterScene" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "sceneNumber" INTEGER NOT NULL,
    "title" TEXT,
    "summary" TEXT,
    "locationId" TEXT,
    "beatId" TEXT,
    "script" JSONB NOT NULL DEFAULT '{}',
    "dialogue" JSONB NOT NULL DEFAULT '{}',
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "ChapterScene_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SceneImage" (
    "id" TEXT NOT NULL,
    "sceneId" TEXT NOT NULL,
    "panelNumber" INTEGER NOT NULL,
    "renderingMode" "RenderingMode" NOT NULL DEFAULT 'PANEL_DRAFT',
    "prompt" TEXT,
    "negativePrompt" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "width" INTEGER NOT NULL DEFAULT 1024,
    "height" INTEGER NOT NULL DEFAULT 1024,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "imageUrl" TEXT,
    "moderationStatus" TEXT,
    "routingDecision" JSONB,
    "promptComposerPayload" JSONB,
    "consistencyScore" DOUBLE PRECISION,
    "referenceImageIds" JSONB NOT NULL DEFAULT '[]',
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "SceneImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContinuityEvent" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "chapterId" TEXT,
    "eventType" TEXT NOT NULL,
    "summary" TEXT,
    "entities" JSONB NOT NULL DEFAULT '{}',
    "importance" INTEGER NOT NULL DEFAULT 0,
    "timelineOrder" INTEGER NOT NULL DEFAULT 0,
    "permanent" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContinuityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemorySnapshot" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "chapterId" TEXT,
    "structuredState" JSONB NOT NULL DEFAULT '{}',
    "narrativeSummary" TEXT,
    "embeddingStatus" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "characterSnapshots" JSONB NOT NULL DEFAULT '[]',
    "openLoops" JSONB NOT NULL DEFAULT '[]',
    "relationshipSnapshots" JSONB NOT NULL DEFAULT '[]',
    "visualContinuityWarnings" JSONB NOT NULL DEFAULT '[]',
    "wardrobeSnapshots" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "MemorySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RagDocument" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "embedding" vector,

    CONSTRAINT "RagDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "chapterId" TEXT,
    "type" "JobType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'queued',
    "provider" TEXT,
    "input" JSONB NOT NULL DEFAULT '{}',
    "output" JSONB NOT NULL DEFAULT '{}',
    "error" JSONB,
    "estimatedTokenCost" INTEGER,
    "actualTokenCost" INTEGER,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "lifetimePurchased" INTEGER NOT NULL DEFAULT 0,
    "lifetimeSpent" INTEGER NOT NULL DEFAULT 0,
    "lifetimeRefunded" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletTransaction" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "type" "WalletTransactionType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "balanceBefore" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TokenPricingRule" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "baseCost" INTEGER NOT NULL,
    "costFormula" JSONB NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TokenPricingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StripeOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stripeCheckoutSessionId" TEXT NOT NULL,
    "stripePaymentIntentId" TEXT,
    "packCode" TEXT NOT NULL,
    "amountPaid" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'eur',
    "tokensGranted" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "rawPayload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StripeOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModerationEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "chapterId" TEXT,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "moderationLevel" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "reasons" JSONB NOT NULL DEFAULT '[]',
    "rawScores" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModerationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminFlag" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "type" TEXT NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChapterCanonState" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "chapterNumber" INTEGER NOT NULL,
    "worldState" JSONB NOT NULL DEFAULT '{}',
    "characterStates" JSONB NOT NULL DEFAULT '[]',
    "openThreads" JSONB NOT NULL DEFAULT '[]',
    "resolvedThreads" JSONB NOT NULL DEFAULT '[]',
    "canonEvents" JSONB NOT NULL DEFAULT '[]',
    "narrativeSummary" TEXT,
    "continuityWarnings" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChapterCanonState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SceneState" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "sceneId" TEXT NOT NULL,
    "sceneNumber" INTEGER NOT NULL,
    "location" TEXT NOT NULL,
    "timeOfDay" TEXT,
    "mood" TEXT,
    "dramaticGoal" TEXT,
    "conflictAxis" TEXT,
    "presentCharacterIds" JSONB NOT NULL DEFAULT '[]',
    "characterOverrides" JSONB NOT NULL DEFAULT '[]',
    "continuityAnchors" JSONB NOT NULL DEFAULT '[]',
    "imageReferenceIds" JSONB NOT NULL DEFAULT '[]',
    "textConstraints" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SceneState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CanonTimelineEvent" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "chapterId" TEXT,
    "sceneId" TEXT,
    "chapterNumber" INTEGER NOT NULL,
    "eventType" TEXT NOT NULL,
    "subjectCharacterId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "importance" TEXT NOT NULL DEFAULT 'minor',
    "irreversible" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CanonTimelineEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CanonChangeRequest" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "characterId" TEXT,
    "chapterId" TEXT,
    "type" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CanonChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_supabaseAuthId_key" ON "User"("supabaseAuthId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "UserPreferences_userId_key" ON "UserPreferences"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_slug_key" ON "Project"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectSettings_projectId_key" ON "ProjectSettings"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "StoryBible_projectId_key" ON "StoryBible"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Character_projectId_slug_key" ON "Character"("projectId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "CharacterCanonPack_characterId_key" ON "CharacterCanonPack"("characterId");

-- CreateIndex
CREATE UNIQUE INDEX "CanonPackAsset_packId_slot_key" ON "CanonPackAsset"("packId", "slot");

-- CreateIndex
CREATE UNIQUE INDEX "Chapter_projectId_chapterNumber_key" ON "Chapter"("projectId", "chapterNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_userId_key" ON "Wallet"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TokenPricingRule_key_key" ON "TokenPricingRule"("key");

-- CreateIndex
CREATE UNIQUE INDEX "StripeOrder_stripeCheckoutSessionId_key" ON "StripeOrder"("stripeCheckoutSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "ChapterCanonState_chapterId_key" ON "ChapterCanonState"("chapterId");

-- CreateIndex
CREATE INDEX "ChapterCanonState_projectId_chapterNumber_idx" ON "ChapterCanonState"("projectId", "chapterNumber");

-- CreateIndex
CREATE UNIQUE INDEX "SceneState_sceneId_key" ON "SceneState"("sceneId");

-- CreateIndex
CREATE INDEX "SceneState_chapterId_sceneNumber_idx" ON "SceneState"("chapterId", "sceneNumber");

-- CreateIndex
CREATE INDEX "CanonTimelineEvent_projectId_chapterNumber_idx" ON "CanonTimelineEvent"("projectId", "chapterNumber");

-- CreateIndex
CREATE INDEX "CanonTimelineEvent_subjectCharacterId_idx" ON "CanonTimelineEvent"("subjectCharacterId");

-- CreateIndex
CREATE INDEX "CanonChangeRequest_projectId_status_idx" ON "CanonChangeRequest"("projectId", "status");

-- CreateIndex
CREATE INDEX "CanonChangeRequest_characterId_status_idx" ON "CanonChangeRequest"("characterId", "status");

-- AddForeignKey
ALTER TABLE "UserPreferences" ADD CONSTRAINT "UserPreferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectSettings" ADD CONSTRAINT "ProjectSettings_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StylePack" ADD CONSTRAINT "StylePack_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryBible" ADD CONSTRAINT "StoryBible_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Character" ADD CONSTRAINT "Character_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterVisualRef" ADD CONSTRAINT "CharacterVisualRef_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterCanonPack" ADD CONSTRAINT "CharacterCanonPack_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanonPackAsset" ADD CONSTRAINT "CanonPackAsset_packId_fkey" FOREIGN KEY ("packId") REFERENCES "CharacterCanonPack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoraModel" ADD CONSTRAINT "LoraModel_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoraAttachment" ADD CONSTRAINT "LoraAttachment_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoraAttachment" ADD CONSTRAINT "LoraAttachment_loraId_fkey" FOREIGN KEY ("loraId") REFERENCES "LoraModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoraAttachment" ADD CONSTRAINT "LoraAttachment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoraAttachment" ADD CONSTRAINT "LoraAttachment_stylePackId_fkey" FOREIGN KEY ("stylePackId") REFERENCES "StylePack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterRelationship" ADD CONSTRAINT "CharacterRelationship_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterRelationship" ADD CONSTRAINT "CharacterRelationship_sourceCharacterId_fkey" FOREIGN KEY ("sourceCharacterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterRelationship" ADD CONSTRAINT "CharacterRelationship_targetCharacterId_fkey" FOREIGN KEY ("targetCharacterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_ownerCharacterId_fkey" FOREIGN KEY ("ownerCharacterId") REFERENCES "Character"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Arc" ADD CONSTRAINT "Arc_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chapter" ADD CONSTRAINT "Chapter_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterScene" ADD CONSTRAINT "ChapterScene_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SceneImage" ADD CONSTRAINT "SceneImage_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "ChapterScene"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContinuityEvent" ADD CONSTRAINT "ContinuityEvent_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContinuityEvent" ADD CONSTRAINT "ContinuityEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemorySnapshot" ADD CONSTRAINT "MemorySnapshot_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemorySnapshot" ADD CONSTRAINT "MemorySnapshot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RagDocument" ADD CONSTRAINT "RagDocument_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StripeOrder" ADD CONSTRAINT "StripeOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationEvent" ADD CONSTRAINT "ModerationEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminFlag" ADD CONSTRAINT "AdminFlag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterCanonState" ADD CONSTRAINT "ChapterCanonState_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterCanonState" ADD CONSTRAINT "ChapterCanonState_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SceneState" ADD CONSTRAINT "SceneState_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SceneState" ADD CONSTRAINT "SceneState_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SceneState" ADD CONSTRAINT "SceneState_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "ChapterScene"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanonTimelineEvent" ADD CONSTRAINT "CanonTimelineEvent_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanonTimelineEvent" ADD CONSTRAINT "CanonTimelineEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanonChangeRequest" ADD CONSTRAINT "CanonChangeRequest_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanonChangeRequest" ADD CONSTRAINT "CanonChangeRequest_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanonChangeRequest" ADD CONSTRAINT "CanonChangeRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

