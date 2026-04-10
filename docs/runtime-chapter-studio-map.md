# Runtime Chapter Studio Map

## Parcours réel branché

- Création projet: `apps/web/app/(app)/projects/new/page.tsx` -> `apps/web/app/api/projects/route.ts`
- Hub projet: `apps/web/app/(app)/projects/[id]/page.tsx`
- Liste chapitres: `apps/web/app/(app)/projects/[id]/chapters/page.tsx`
- Studio chapitre:
  - `apps/web/app/(app)/projects/[id]/chapters/new/page.tsx`
  - `apps/web/app/(app)/projects/[id]/chapters/[chapterId]/edit/page.tsx`
  - `apps/web/app/(app)/projects/[id]/chapters/[chapterId]/generate/page.tsx`
  - `apps/web/app/(app)/projects/[id]/chapters/[chapterId]/review/page.tsx`
  - `apps/web/app/(app)/projects/[id]/chapters/[chapterId]/read/page.tsx`

## APIs runtime utilisées

- Création et listing chapitres: `apps/web/app/api/projects/[id]/chapters/route.ts`
- Estimate narrative + outlines: `apps/web/app/api/projects/[id]/chapters/estimate/route.ts`
- Studio chapitre: `apps/web/app/api/projects/[id]/chapters/[chapterId]/studio/route.ts`
- Readiness gate: `apps/web/app/api/projects/[id]/chapters/[chapterId]/readiness/route.ts`
- Launch generation: `apps/web/app/api/projects/[id]/chapters/[chapterId]/launch/route.ts`
- Legacy launch encore branché mais désormais gardé par la readiness studio: `apps/web/app/api/projects/[id]/pipeline/route.ts`
- QA report: `apps/web/app/api/projects/[id]/chapters/[chapterId]/qa-report/route.ts`
- Complete review: `apps/web/app/api/projects/[id]/chapters/[chapterId]/review/complete/route.ts`
- Legacy approved outline bridge: `apps/web/app/api/projects/[id]/chapters/[chapterId]/approved-outline/route.ts`
- Reader payload: `apps/web/app/api/projects/[id]/chapters/[chapterId]/route.ts`
- Retry panel: `apps/web/app/api/scene-images/[sceneImageId]/retry/route.ts`

## Packages réellement impliqués

- `packages/core`: types studio, canon, readiness, QA, adapters legacy
- `packages/ai`: prompt composer hiérarchique, lock policy FAL
- `packages/workflow`: pipeline de génération complet
- `packages/continuity`: continuité et canon persistants
- `packages/memory`: contexte projet et mémoire chapitre
- `packages/world`: blueprint scène, ontologies
- `packages/db`: schéma Prisma, jobs, images, assets
- `packages/db/prisma/backfill-chapter-studio.ts`: backfill logique des anciens chapitres vers `outline.studio`

## Source de vérité runtime

- `chapter.outline.studio` reste la source de vérité studio-first pour le wizard, la readiness, la review détaillée et le debug bundle.
- `Chapter.studioStatus`, `Chapter.studioCurrentStep`, `Chapter.studioUpdatedAt`, `Chapter.minimumImages`, `Chapter.generatedImages`, `Chapter.acceptedImages`, `Chapter.rejectedImages`, `Chapter.missingImages`, `Chapter.criticalPanelsCount`, `Chapter.criticalPanelsBlocked`, `Chapter.criticalPanelsMissingQa`, `Chapter.reviewBlockedReason` sont désormais persistés en colonnes runtime réellement lues/écrites.
- `chapter.outline.approvedOutline` reste un bridge de compatibilité pour le pipeline historique tant que la cible relationnelle complète n’existe pas.
- Le pipeline choisit désormais sa source outline en priorité depuis le studio (`productionOutline` -> bridge legacy) et trace `outlineSource`, `fallbackUsed`, `legacyBridgeUsed` dans les payloads persistés.

## QA critique obligatoire

- La criticité panel est centralisée via `packages/core/src/chapter-runtime.ts`.
- Tout panel critique doit exposer `qaWasRequired`, `qaWasExecuted`, `qaFailureReason`, `qaBypassReason`, `panelCriticality`.
- Si l’analyzer visuel est indisponible sur un panel critique:
  - le pipeline marque le panel `blocked`
  - le retry manuel marque le panel `blocked`
  - `qa-report` remonte `criticalPanelsMissingQA`
  - `review/complete` refuse la clôture

## Garantie runtime des 55 images

- Les compteurs passent par un agrégateur partagé `aggregateChapterImageCounts()`.
- Tant que `acceptedImages < minimumImages`, le runtime reste non terminal (`GENERATION_PARTIAL` / `review_required`).
- `qa-report`, `review/complete`, la review UI et `generationRunSummary` exposent `minimumImages`, `acceptedImages`, `missingImages`.
- Les compteurs structurés sur `Chapter` sont rechargés dans les layouts/pages studio avant rendu, avec backfill pour l’existant.

## Choke points encore vivants

- `packages/workflow/src/run-full-chapter-pipeline.ts` reste l’orchestrateur principal.
- `Chapter.outline/script/storyboard` restent les blobs JSON de compatibilité pour le snapshot studio complet, l’historique détaillé et les structures panel/page encore non normalisées.
- Le reader legacy `read` reste branché pour la lecture finale et les rerolls panel.
- Une suite Playwright minimale existe désormais sur les pages réelles `edit/generate/review`, avec fixture DB et interaction navigateur.
