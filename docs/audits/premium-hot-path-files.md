# Fichiers du hot path premium (MYMANGA)

Trace attendue :

`UI studio → POST .../chapters/estimate → approved outline → POST .../chapters/[chapterId]/launch → Inngest / job → run-premium-v3-pipeline → contrat / blueprints enrichis → storyboard → render-pass → prompt → FAL → URL stable → Vision QA → SceneImage → reader`

| Fichier | Lit | Écrit | Modèles DB | Outline | productionPlan | SceneImage | FAL | Bypass guards | Legacy / canon |
|--------|-----|------|------------|---------|------------------|------------|-----|---------------|----------------|
| `apps/web/components/studio/*` | snapshot studio | autosave outline | Chapter | oui (brouillon) | oui | non | non | UI | n/a |
| `apps/web/app/api/projects/[id]/chapters/estimate/route.ts` | projet, contexte | réponse JSON (pas DB directe) | — | non | preview | non | non | non | fusion `mergeRawBlueprintsWithCanonicalRhythm` |
| `apps/web/app/api/projects/[id]/chapters/[chapterId]/approved-outline/route.ts` | chapitre | outline / studio | Chapter | oui | oui | non | non | non | premium contract |
| `apps/web/app/api/projects/[id]/chapters/[chapterId]/launch/route.ts` | snapshot | job + chapter status | Chapter, Job | non | validé | non | non | non si flags | garde readiness + canon |
| `packages/workflow/src/run-full-chapter-pipeline.ts` | job | dispatche v3 | Job, Chapter | via job | via job | via render | via pipeline | non | v3 |
| `packages/workflow/src/run-premium-v3-pipeline.ts` | plan, persos, lieux | storyboard, render, QA logs | via passes | résolu | oui | via persist v3 | si FAL on | premium-only throws | merge rythme + riches |
| `packages/ai/src/services/premium-chapter-contract-builder.ts` | outline | plan + blueprints | — | source | sortie | non | non | non | merge rythme |
| `packages/core/src/production/merge-raw-blueprints-with-canonical-rhythm.ts` | brut + canon | — | — | non | non | non | non | non | cœur P0.2 |
| `packages/workflow/src/passes/render-pass.ts` | storyboard, memory | render summary + SceneImage | SceneImage… | non | non | oui | oui | non | stable URL avant QA si `projectId` |
| `packages/workflow/src/persistence/v3-scene-image-persistence.ts` | storyboard | SceneImage, scènes | SceneImage | non | non | oui | non | non | v3 |
| `apps/web/components/manga/reader/*` | SceneImage / outline | — | — | non | non | lecture | non | non | reader |

*Ce document est une carte de lecture ; les audits détaillés complètent `docs/audits/full-premium-chapter-build-trace.md`.*
