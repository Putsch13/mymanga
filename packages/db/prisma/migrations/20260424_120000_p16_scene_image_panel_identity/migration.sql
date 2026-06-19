-- P1.6 — Identité stable du panel pour éviter corruption userValidatedAt
-- externalPanelId = panelId du StoryboardPanel (stable même si panelNumber change)
-- panelBlueprintId = ID du blueprint source si approved_plan_driven

ALTER TABLE "SceneImage"
  ADD COLUMN IF NOT EXISTS "externalPanelId" TEXT,
  ADD COLUMN IF NOT EXISTS "panelBlueprintId" TEXT;

CREATE INDEX IF NOT EXISTS "SceneImage_externalPanelId_idx"
  ON "SceneImage"("externalPanelId");

CREATE INDEX IF NOT EXISTS "SceneImage_panelBlueprintId_idx"
  ON "SceneImage"("panelBlueprintId");
