## Premium V5 Finalization

- Finalized `PanelContract` with richer environment fields, location signals, story hooks, and non-empty background constraints.
- Added scene-level persistence for `SceneExtrasRegistry` using `ChapterScene.metadata`, plus deterministic scene extras and NPC naming.
- Made `composeEnvironment()` deterministic via seeded selection for ambient creatures and environment flavor.
- Extended routing context with scene complexity hints and added retry handling for transient provider failures.
- Added chapter-level premium quality aggregation and stored `qualityReport` in chapter/job/memory outputs.
- Upgraded admin UI to surface generation stack state, chapter quality, fallback visibility, and recent failed images.
