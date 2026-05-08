# Logging — Conventions

> Trois loggers structurés coexistent. Choisis le bon en fonction du
> contexte. Sprint 2 a uniformisé l'adoption de `logPipeline` côté
> backend pipeline.

## Les 3 loggers

### 1. `createLogger(scope)` — générique
**Localisation** : `packages/core/src/logger.ts`

Logger scope-based avec API `info/warn/error/debug/child`. Sortie JSON
si `LOG_FORMAT=json`, sinon `[scope] LEVEL message {fields}`. Niveau
contrôlé par `LOG_LEVEL` (`debug|info|warn|error`).

```ts
import { createLogger } from "@manga-ai-studio/core";

const log = createLogger("api:characters");
log.info("character created", { characterId, projectId });
log.error("dna generation failed", { characterId, error: err.message });
```

### 2. `logNarrative(...)` — domaine narratif
**Localisation** : `packages/core/src/logger-narrative.ts`

Logs **métier narratifs** ("quel bout d'histoire est manquant ?" plutôt
que "quel code a planté ?"). Domaines : `intent-contract`, `outline`,
`visual-world`, `dialogue`, `preflight`, `canon-pack`, `cutaway-plan`.

Utilisé par les passes IA pour tracer la fidélité au contrat narratif.

```ts
import { logIntentContract, logOutlineCoverage } from "@manga-ai-studio/core";

logIntentContract({
  requiredEvents: 5,
  requiredNpcGroups: 2,
  requiredLocations: 3,
});
```

### 3. `logPipeline*(...)` — pipeline backend
**Localisation** : `packages/workflow/src/lib/pipeline-logger.ts`

Logger event-based avec **safe-serialize** (gère cycles, BigInt, valeurs
non-JSON), namespace + contexte (`jobId`, `chapterId`, `projectId`).
**À privilégier pour tout ce qui tourne dans le worker pipeline** —
output JSON par ligne, idéal pour grep/Datadog (`event=…` au lieu de
regex sur des préfixes texte).

```ts
import { logPipelineInfo, logPipelineWarn, logPipelineError } from "../lib/pipeline-logger";

logPipelineInfo(
  "recovery.start",
  { missingCount, attempted },
  { ns: "pipeline:recovery", jobId, chapterId, projectId },
);

logPipelineWarn(
  "persist.bucket_failed",
  { bucket: "MyManga", reason },
  { ns: "pipeline:persist" },
);
```

## Quel logger choisir ?

| Contexte | Logger |
|---|---|
| Route API (`apps/web/app/api/...`) | `createLogger` |
| Pipeline worker (`packages/workflow/src/...`) | **`logPipeline*`** |
| Pass narrative qui parle d'arc/dialogue/canon | `logNarrative` (en plus du logger pipeline) |
| Lib partagée non spécifique | `createLogger` |

## Conventions de nommage

### Events (`logPipeline*`)
Format : `<area>.<action>` en `snake_case`.
- `recovery.start`, `recovery.done`, `recovery.shot_failed`
- `persist.ok`, `persist.bucket_upload_failed`, `persist.all_buckets_failed`
- `pre_render_qa.repeated_prompts_detected`

### Namespaces (`ns`)
Format : `pipeline:<area>` ou `pipeline:<area>:<sub>`.
- `pipeline:recovery`, `pipeline:persist`, `pipeline:cover`
- `pipeline:v3:pre-render-qa`, `pipeline:v3:pre-render-premium-qa`

### Scopes (`createLogger`)
Format : `<surface>:<feature>` en `kebab-case`.
- `api:characters`, `api:chapters:dialogue-draft`
- `lib:rate-limit`, `lib:supabase:server`

## Migration : `console.*` → `logPipeline*`

Pattern à remplacer côté `packages/workflow/` :

```ts
// AVANT
console.warn(`[pipeline:persist] bucket=${bucket} failed: ${err.message}`);

// APRÈS
logPipelineWarn(
  "persist.bucket_upload_failed",
  { bucket, message: err.message },
  { ns: "pipeline:persist" },
);
```

Ne migre **pas** :
- `console.error` dans des `catch` qui sont déjà ré-throw plus haut
  (le caller logguera proprement avec contexte)
- `console.log` dans des CLI scripts (`packages/db/prisma/*.ts`)
- les tests

## État de l'adoption (May 2026)

| Surface | Adoption |
|---|---|
| `pre-render-premium-qa.ts` | ✅ migré (Sprint 2) |
| `pipeline-image-persistence.ts` | ✅ migré (Sprint 2) |
| `image-generation/recovery-pass.ts` | ✅ migré (Sprint 2) |
| `image-generation/coverage-report.ts` | ✅ migré (Sprint 2) |
| `image-generation/chapter-cover.ts` | ✅ migré (Sprint 2) |
| `run-premium-v3-pipeline.ts` (70 console) | ⏳ Sprint 4 (avec le découpage) |
| `narrative-pass.ts` (26 console) | ⏳ Sprint 4 (avec le découpage) |
| `image-generation-pass.ts` (30 console) | ⏳ Sprint 4 (avec le découpage) |
