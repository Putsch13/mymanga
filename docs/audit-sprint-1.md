# Sprint 1 — Élimination · Bilan

> Sprint exécuté le 2026-05-08, en suivant l'audit "Score → 9.0".
> Règle d'or respectée : un commit par tâche, tests verts à chaque étape,
> aucune API publique cassée.

## Bilan chiffré

| Métrique | Avant | Après | Delta |
|---|---|---|---|
| Lignes TS/TSX (apps + packages) | 224 855 | 223 074 | **−1 781** |
| Fichiers supprimés | — | 14 | — |
| Fichiers renommés | — | 2 | — |
| Routes API mortes supprimées | 2 | 0 | −2 |
| Re-exports proxies | 3 | 0 | −3 |
| Fichiers homonymes confusants | 4 (2 paires) | 0 | −4 |
| Tests préexistants réparés | — | 12 | +12 verts |

Commit baseline : `85bfa11` · Commit final Sprint 1 : `9458136`.

## Tâches livrées

### TASK-1.3 — Suppression d'orphelins · `de61473`
- `packages/ai/src/chapter/shared-utils.ts` (12 lignes)
- `packages/workflow/src/passes/assert-rag-contract-premium.ts` (158 lignes)
- Cleanup de l'export `./chapter/shared-utils` dans `packages/ai/package.json`
- Bonus : fix de 7 erreurs `tsc` préexistantes dans deux tests TEST-1
  (`visual-coverage-validator.test.ts`, `blueprint-budgets.test.ts`) qui
  utilisaient des string literals invalides pour les enums
  `StoryboardRenderMode` et `CutawayType`.

### TASK-1.5 — Renommage des homonymes · `8aacd78`
- `packages/core/src/dialogue/panel-text-contract.ts` →
  `packages/core/src/dialogue/panel-script-view.ts` (vue script CTO,
  distincte du contrat persisté `generation/panel-text-contract.ts`).
- `packages/workflow/src/passes/beat-narrative-contract.ts` →
  `packages/workflow/src/passes/validate-beat-narrative-contract.ts`
  (validateur runtime, distinct du type `core/types/beat-narrative-contract.ts`).
- 3 imports internes mis à jour. API publique inchangée.

### TASK-1.4 — Suppression des re-exports proxies · `b85a388`
- `apps/web/lib/canon/resolve-character-visual-canon.ts` (9 lignes)
- `apps/web/lib/canon/resolve-location-visual-canon.ts` (17 lignes)
- `apps/web/lib/canon/character-canon-helpers.ts` (8 lignes)
- 6 consommateurs migrés vers `@manga-ai-studio/core` directement.
- Bonus : ajout du mock manquant `runPremiumPlanContractQa` dans
  `chapter-estimate-route.test.ts` (11 tests rouges → verts).

### TASK-1.1 — Suppression de la route `/pipeline` zombie · `0961381`
- `apps/web/app/api/projects/[id]/pipeline/route.ts` (388 lignes)
- Dossier UI legacy associé :
  - `_legacy/pipeline-client.tsx` (1010 lignes)
  - `_components/pipeline-atoms.tsx`, `pipeline-types.ts`,
    `compute-progress.ts`, `use-pipeline-job-polling.ts`
- `map-launch-error.ts` (utile, testé) **déplacé** vers
  `apps/web/lib/launch/map-launch-error.ts` plutôt que supprimé.
- `page.tsx` simplifié : flag `ENABLE_LEGACY_PIPELINE_PAGE` retiré,
  redirection unique vers le studio chapitre.
- Test `pipeline-launch-error-mapping.test.ts` adapté au nouveau chemin.

### TASK-1.2 — Suppression de la route `/pipeline-version` zombie · `9458136`
- `apps/web/app/api/projects/[id]/pipeline-version/route.ts` (61 lignes)
- Aucun consommateur applicatif (uniquement référencée dans la doc auto-générée).

### TASK-1.6 — Audit final · ce document

## Décisions explicites & dette résiduelle

### Colonne DB `pipelineVersion` conservée

L'audit préconisait également de drop la colonne `ProjectSettings.pipelineVersion`
(et `Job.pipelineVersion`). **Décision contraire** : ces colonnes sont encore
lues activement par :

- `packages/workflow/src/run-full-chapter-pipeline.ts` (route v1/v2)
- `packages/workflow/src/legacy/run-legacy-compatible-chapter-pipeline.ts`
- `packages/workflow/src/audit/job-audit-bundle.ts`
- `packages/workflow/src/pipeline-types.ts` (type)
- 3 tests qui valident leur usage

Drop la colonne casserait ces fichiers. À traiter dans un sprint dédié
"retrait définitif du pipeline legacy v1/v2" — pas dans le scope d'un
sprint "Élimination" qui doit rester chirurgical.

### Tests TS préexistants en rouge — désormais réparés

Deux types d'erreurs préexistantes ont été corrigées de manière opportuniste
parce qu'elles bloquaient les Acceptance Criteria du sprint ("`pnpm build`
passe", "`pnpm test` passe") :

1. Tests TEST-1 du commit précédent qui utilisaient des string literals
   invalides pour des enums (`"object_insert"` au lieu de `"insert_object"`,
   `"wide_establishing"` au lieu de `"establishing_environment"`,
   `"npc_panel"` au lieu de `"npc_group"`, champ inventé `contractKind`).
2. Mock `vi.mock("@manga-ai-studio/ai", ...)` dans
   `chapter-estimate-route.test.ts` qui n'incluait pas le nouvel export
   `runPremiumPlanContractQa`.

Ces deux dettes étaient indépendantes du Sprint 1 mais sont devenues
visibles parce qu'on a touché aux paquets concernés.

### `lib/chapter-studio.ts` conservé

L'audit notait explicitement : "À KEEPER : `apps/web/lib/chapter-studio.ts`
— c'est une vraie façade qui agrège 5 sous-modules." Confirmé, non touché.

## État final des tests

```
apps/web   — 85 fichiers · 732 tests verts
packages/ai — 74 fichiers · 573 tests verts
packages/core — 61 fichiers · 524 tests verts
```

`pnpm exec tsc --noEmit` passe sur tous les paquets touchés.

## Suite

- Sprint 2 — Config singleton + Logger structuré
- Sprint 3 — Const enums + tightening des `any`
- Sprint 4 — Découpage de `narrative-pass.ts` et `image-generation-pass.ts`
- Sprint 5 — Pattern usecases pour les routes `launch` et `estimate`
- Sprint 6 — Découpe des composants studio géants + E2E full pipeline
