-- T12: pipeline version feature flag
ALTER TABLE "ProjectSettings" ADD COLUMN "pipelineVersion" TEXT NOT NULL DEFAULT 'v1';
ALTER TABLE "Job" ADD COLUMN "pipelineVersion" TEXT NOT NULL DEFAULT 'v1';

-- T13: debug trace per panel
ALTER TABLE "SceneImage" ADD COLUMN "debugTrace" JSONB;
