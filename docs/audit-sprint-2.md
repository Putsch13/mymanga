# Sprint 2 — Config singleton + Logger structuré · Bilan

> Sprint exécuté le 2026-05-08, dans la continuité de l'audit CTO v5.
> Mode "machine de guerre" : un commit par étape, type-check + tests
> verts à chaque commit, aucun doublon créé, aucune régression.

## Bilan chiffré

| Métrique | Avant | Après | Delta |
|---|---|---|---|
| Singletons de configuration | 0 (33+ `process.env.*` éparpillés) | 1 (`getAppConfig`) | +1 |
| Consommateurs migrés vers `getAppConfig` | 0 | 9 | +9 |
| Loggers structurés disponibles | 3 (createLogger, logNarrative, logPipeline) | 3 (réutilisés) | 0 doublon créé |
| Fichiers backend `console.*` → `logPipeline` | 0 | 5 | +5 |
| Tests préexistants réparés | — | 4 (3 TS + 1 obsolète) | +4 |

Commits : `7fd2a1d`, `4706d28`, `c633c8e`, `51aa6d4`.

## Découvertes lors de la phase de validation (sécurité)

L'audit CTO v5 sous-entendait qu'il fallait **créer** un logger structuré.
La phase de validation a révélé qu'il en existe déjà **trois**, chacun
avec une responsabilité distincte :

| Logger | Localisation | Responsabilité |
|---|---|---|
| `createLogger(scope)` | `packages/core/src/logger.ts` | Logger générique JSON-via-`LOG_FORMAT`, scope/child API |
| `logNarrative(...)` | `packages/core/src/logger-narrative.ts` | Logs narratifs (intent, outline, dialogue, preflight) |
| `logPipeline*(...)` | `packages/workflow/src/lib/pipeline-logger.ts` | Logs pipeline avec safe-serialize + ns/jobId/chapterId |

**Décision** : ne pas fusionner. Risque > bénéfice. Adoption progressive
de `logPipeline` (le plus mature pour l'observabilité backend).

De même, la phase a confirmé l'absence de tout `app-config` existant et
documenté la présence de `resolveSupabaseServerConfig` et
`stack-readiness` qui consomment beaucoup de `process.env.*` mais
**par design** (pour gérer les fallbacks gracieux quand un provider
manque).

## Tâches livrées

### TASK-2.1 — Singleton `getAppConfig()` · `7fd2a1d` + `4706d28`

**Fichiers créés**
- `packages/core/src/config/app-config.ts` (90 lignes)
- `packages/core/src/config/app-config.test.ts` (62 lignes, 7 tests)
- Export ajouté dans `packages/core/src/index.ts`

**Stratégie sécurité**
- Validation Zod stricte sur les types/formats (URL, etc.)
- Defaults pour les champs où ça a un sens (`STORAGE_BUCKET="MyManga"`,
  `OPENAI_NARRATIVE_MODEL="gpt-4o-mini"`, etc.)
- **Crash hard uniquement si `NODE_ENV=production` ET `DATABASE_URL`
  manquant** — le seul vrai bloqueur de boot
- Toutes les clés provider (`FAL_KEY`, `OPENAI_API_KEY`,
  `STRIPE_SECRET_KEY`, `INNGEST_*`) restent **optionnelles** pour
  préserver la logique de fallback gracieux déjà en place
  (`stack-readiness`, `premium-strict-api-guard`, etc.)
- Cache au premier appel ; `_resetAppConfigForTests()` exposé pour les
  tests qui mockent `process.env`

**9 consommateurs migrés**
- `packages/ai/src/services/dialogue-writer.ts`
- `packages/ai/src/services/chapter-autofill-engine.ts` (2 occurrences)
- `packages/ai/src/services/chapter-continuity-pass.ts`
- `packages/ai/src/services/chapter-narrative-coherence-pass.ts`
- `packages/ai/src/agents/manga-editor-agent-llm.ts`
- `packages/ai/src/agents/story-architect-agent-llm.ts`
- `packages/core/src/logger.ts` (`LOG_LEVEL`, `LOG_FORMAT`)
- `packages/workflow/src/config/resolve-supabase-server-config.ts` (5 alias)

**Préservation des chaînes de fallback métier**
- `OPENAI_AUTOFILL_MODEL ?? OPENAI_NARRATIVE_MODEL` reste géré explicitement
- `OPENAI_CONTINUITY_MODEL ?? OPENAI_DIALOGUE_MODEL` idem
- Les alias Supabase non couverts par le schéma (`SUPABASE_BUCKET`,
  `SUPABASE_SERVICE_ROLE`, `SUPABASE_SERVICE_KEY`, `SUPABASE_ANON_KEY`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`) continuent d'être lus directement
  via `process.env` pour rétrocompatibilité totale

**Bonus : 3 erreurs `tsc` préexistantes corrigées**
- `golden-fixtures.test.ts` : import `PanelBlueprintPremium` corrigé
  vers sa vraie source (`types/narrative-facts`)
- `repair-contractual-focus.test.ts` : 2× `"npc_panel"` → `"npc_group"`
  (mêmes literals invalides corrigés en Sprint 1 dans
  `blueprint-budgets.test.ts`)
- `intent-coverage-qa.test.ts` : ajout du champ `requiredLocationIds: []`
  désormais requis par le contrat ARCH-4

### TASK-2.2 — Promotion de `logPipeline` · `c633c8e`

**5 fichiers backend migrés** (~17 `console.*` remplacés par des
`logPipelineInfo/Warn/Error` avec `event` et `payload` typés)
- `packages/workflow/src/passes/pre-render-premium-qa.ts` (5)
- `packages/workflow/src/pipeline-image-persistence.ts` (5)
- `packages/workflow/src/passes/image-generation/recovery-pass.ts` (4)
- `packages/workflow/src/passes/image-generation/coverage-report.ts` (2)
- `packages/workflow/src/passes/image-generation/chapter-cover.ts` (2)

**Délibérément non migrés** (seront refait Sprint 4 quand on découpera
les fichiers monolithiques) :
- `packages/workflow/src/run-premium-v3-pipeline.ts` (70 `console.*`)
- `packages/workflow/src/passes/narrative-pass.ts` (26)
- `packages/workflow/src/passes/image-generation-pass.ts` (30)

**Mise à jour test contractuel**
- `chapter-recovery-contract.test.ts` : assertion sur le namespace
  `pipeline:recovery` (passé à `{ ns: "pipeline:recovery" }` du logger)
  au lieu du préfixe console `[pipeline:recovery]` historique.

### Sprint 1 follow-up — Test orphelin · `51aa6d4`

`apps/web/tests/pipeline-premium-contract.test.ts` (211 lignes)
importait `app/api/projects/[id]/pipeline/route` supprimée en
TASK-1.1. Couverture redondante avec `launch-premium-contract.test.ts`
sur la nouvelle route survivante. Supprimé.

## Validation finale

- `pnpm --filter @manga-ai-studio/core exec tsc --noEmit` → 0 erreur
- `pnpm --filter @manga-ai-studio/ai exec tsc --noEmit` → 0 erreur
- `pnpm --filter @manga-ai-studio/workflow exec tsc --noEmit` → 0 erreur
- `pnpm --filter @manga-ai-studio/web exec tsc --noEmit` → 0 erreur
- `pnpm --filter @manga-ai-studio/core test` → **531/531 verts**
- `pnpm --filter @manga-ai-studio/ai test` → **573/573 verts**
- `pnpm --filter @manga-ai-studio/workflow test` → **767/767 verts**
- `pnpm --filter @manga-ai-studio/web test` → **726/726 verts**

Total : **2 597 tests verts** sur 4 packages, sans dette nouvelle.

## Pistes pour Sprint 3

- TASK-3.1 — Centraliser `SCENE_IMAGE_STATUS` (const enum partagé) :
  les statuts (`completed`, `failed`, `blocked`, `manual_review_required`,
  `vision_qa_failed`) sont actuellement des string literals dupliqués
  dans la BDD, l'API, le pipeline et le front.
- TASK-3.2 — Réduire les `any` (objectif <30) après audit.
