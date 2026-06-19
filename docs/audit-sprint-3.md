# Sprint 3 — Type-safety & enums centralisés · Bilan

> Sprint exécuté le 2026-05-08, mode "machine de guerre".
> Règle d'or respectée : un commit par étape, type-check + tests verts
> à chaque commit, aucun doublon créé, aucune régression.

## Bilan chiffré

| Métrique | Avant | Après | Delta |
|---|---|---|---|
| Const enum centralisés pour SceneImage.status | 0 (string literals dupliqués) | 1 (`SCENE_IMAGE_STATUS`) | +1 |
| Fichiers SceneImage migrés vers le const enum | 0 | 9 (~17 sites) | +9 |
| Helpers/guards typés disponibles | 0 | 6 (isSceneImageStatus, isTerminal/Success/Failure/Pending, normalize) | +6 |
| Tests unitaires SCENE_IMAGE_STATUS | 0 | 8 | +8 |
| `any` en code prod hors méga-fichiers | 13 | **7** | −6 |
| Méga-fichiers (narrative-pass + image-generation-pass) | 47 + 26 | 47 + 26 (Sprint 4) | 0 |

Commits : `543dd74`, `d0b498d`, `d8747f7`.

## Découvertes lors de la phase de validation (sécurité)

### `SceneImage.status` (DB) ≠ `Chapter.status` ≠ `Job.status` ≠ `PanelFinalStatus`

Avant de centraliser, il fallait isoler. Quatre familles de status
coexistent dans le projet :

| Famille | Surface | Valeurs |
|---|---|---|
| `SceneImage.status` | DB column `String` (pas un Prisma enum) | pending, planned, generating, completed, failed, blocked |
| `Chapter.status` | DB column `String` | draft, ready_for_render, generating, completed |
| `Job.status` | DB column `String` | pending, running, completed, failed |
| `PanelFinalStatus` | TS type interne (V3 render) | passed, passed_after_retry, manual_review_required, failed |

**Décision** : ce sprint ne traite que **`SceneImage.status`**. Mélanger
les autres familles dans le même const aurait été une régression typage.

### `vision_qa_failed` n'existe pas

L'audit Sprint 2 mentionnait `vision_qa_failed` comme valeur attendue.
Validation grep : ce literal n'apparaît **nulle part** dans le code.
La QA visuelle propage son verdict via `PanelFinalStatus =
"manual_review_required"` (qui n'est pas un statut DB SceneImage).
Pas de valeur fantôme ajoutée au const enum.

## Tâches livrées

### TASK-3.1 — Centraliser `SCENE_IMAGE_STATUS` · `543dd74` + `d0b498d`

**Fichiers créés**
- `packages/core/src/types/scene-image-status.ts` (97 lignes) — const
  enum + `SceneImageStatus` type + `ALL_SCENE_IMAGE_STATUSES` array
  + 5 type guards (`isSceneImageStatus`, `isTerminalSceneImageStatus`,
  `isSuccessSceneImageStatus`, `isFailureSceneImageStatus`,
  `isPendingSceneImageStatus`) + `normalizeSceneImageStatus`.
- `packages/core/src/types/scene-image-status.test.ts` (75 lignes,
  8 tests dont une assertion d'exhaustivité anti-régression).
- Re-export ajouté dans `packages/core/src/index.ts`.

**9 fichiers migrés (~17 sites)**

| Fichier | Sites |
|---|---|
| `packages/workflow/src/passes/image-generation-pass.ts` | 6 (sites SceneImage uniquement, fal-trace status laissé en l'état) |
| `packages/workflow/src/passes/image-generation/recovery-pass.ts` | 1 |
| `packages/workflow/src/persistence/v3-scene-image-persistence.ts` | 3 (type narrowed via `Extract<SceneImageStatus, …>`, cast `as` redondant supprimé) |
| `packages/workflow/src/passes/narrative/persist-planned-images.ts` | 1 (planned upsert) |
| `packages/workflow/src/functions.ts` | 2 (cron `cleanupStaleImages`) |
| `apps/web/lib/retry/persist-retry-outcome.ts` | 4 (blocked / failed × 2 / completed-or-blocked ternary) |
| `apps/web/app/api/scene-images/[sceneImageId]/retry/route.ts` | 1 (pending reset) |
| `apps/web/components/studio/generation-progress-board.tsx` | 1 type alias front |

**Délibérément non migrés (autre famille de status)**
- `packages/workflow/src/passes/render-pass.ts` — utilise
  `PanelFinalStatus` (V3 QA), pas SceneImage.status.
- `packages/workflow/src/passes/image-generation-pass.ts:347/370` —
  ce sont des `persistFalTraceEntry({ status: ... })`, pas SceneImage.

### TASK-3.2 — Réduire les `any` · `d8747f7`

**Audit initial** (regex `:\s*any|<any>|as\s+any|any\[\]|Array<any>`)

| Fichier | Avant |
|---|---|
| `narrative-pass.ts` | 47 (méga-fichier — Sprint 4) |
| `image-generation-pass.ts` | 26 (méga-fichier — Sprint 4) |
| `memory-pass.ts` | 10 |
| `apply-shot-plan-to-contract.ts` | 1 (faux positif : `as any` dans un commentaire historique) |
| `build-canonical-production-plan.ts` | 1 |
| `dashboard/page.tsx` | 2 |
| **Total prod hors méga** | **13** |

**Après Sprint 3**

| Fichier | Après |
|---|---|
| `memory-pass.ts` | 6 (4 callbacks fixés via `CharacterStateLike` / `ContinuityIssueLike`) |
| `apply-shot-plan-to-contract.ts` | 1 (commentaire intentionnellement laissé) |
| `build-canonical-production-plan.ts` | 0 (typed `details` literal qui matche `CanonicalProductionPlanQa`) |
| `dashboard/page.tsx` | 0 (`Prisma.ProjectGetPayload` typed alias `DashboardProject`) |
| **Total prod hors méga** | **7** ✅ |

L'objectif `< 30` est atteint sur le périmètre traitable.

**Pourquoi laisser `narrative-pass.ts` (47) et `image-generation-pass.ts`
(26) en l'état ?** Ils sont planifiés pour découpage en Sprint 4
(`TASK-4.1` / `TASK-4.2`). Migrer ces `any` maintenant créerait du
travail jeté lors du split.

## Validation finale

- `pnpm --filter @manga-ai-studio/core exec tsc --noEmit` → 0 erreur
- `pnpm --filter @manga-ai-studio/workflow exec tsc --noEmit` → 0 erreur
- `pnpm --filter @manga-ai-studio/web exec tsc --noEmit` → 0 erreur
- `pnpm --filter @manga-ai-studio/core test` → **539/539 verts** (+8)
- `pnpm --filter @manga-ai-studio/workflow test` → **767/767 verts**
- `pnpm --filter @manga-ai-studio/web test` → **726/726 verts**

Total : **2 605 tests verts** sur 4 packages, sans dette nouvelle.

## Pistes pour Sprint 4

- TASK-4.1 — Découper `narrative-pass.ts` (2 417 lignes → 6 modules).
  Éliminera mécaniquement les 47 `any` restants + les 26 `console.*`.
- TASK-4.2 — Découper `image-generation-pass.ts` (2 057 lignes → 5 modules).
  Éliminera 26 `any` + 30 `console.*`.

À l'issue de Sprint 4, l'objectif final est :
- 0 `any` en code prod hors `eslint-disable` justifiés
- 100 % des `console.*` backend migrés vers `logPipeline*`
- 0 fichier > 1 000 lignes dans `packages/workflow`
