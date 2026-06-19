-- AlterTable
ALTER TABLE "Chapter"
ADD COLUMN     "studioStatus" TEXT,
ADD COLUMN     "studioCurrentStep" TEXT,
ADD COLUMN     "studioUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "studioAutosaveVersion" INTEGER,
ADD COLUMN     "minimumImages" INTEGER,
ADD COLUMN     "generatedImages" INTEGER,
ADD COLUMN     "acceptedImages" INTEGER,
ADD COLUMN     "rejectedImages" INTEGER,
ADD COLUMN     "missingImages" INTEGER,
ADD COLUMN     "criticalPanelsCount" INTEGER,
ADD COLUMN     "criticalPanelsBlocked" INTEGER,
ADD COLUMN     "criticalPanelsMissingQa" INTEGER,
ADD COLUMN     "reviewBlockedReason" TEXT;

-- CreateIndex
CREATE INDEX "Chapter_projectId_studioStatus_idx" ON "Chapter"("projectId", "studioStatus");
