# `apps/web/server/usecases/`

Convention pour la couche **usecase** (P2.1 du TODO master premium).

## Objectif

Les routes Next (`apps/web/app/api/**`) doivent rester fines : parse + dispatch +
serialize. Toute la logique métier (canon, contrats, persistance, jobs) doit
vivre dans des **usecases** testables hors Next, alimentés par les contrats
de `@manga-ai-studio/core` (ChapterIntentContract, ChapterCastContract,
VisualWorldContract, DialogueContract, PanelTextContract, ChapterGenerationContract).

## Forme attendue d'une route

```ts
// app/api/projects/[id]/chapters/[chapterId]/intent-compile/route.ts
const input = bodySchema.parse(await req.json());
const result = await compileChapterIntentUsecase.execute({
  user, projectId, chapterId, ...input,
});
return NextResponse.json(result);
```

## Forme attendue d'un usecase

```ts
// apps/web/server/usecases/compile-chapter-intent.ts
export const compileChapterIntentUsecase = {
  async execute(input: CompileChapterIntentInput): Promise<CompileChapterIntentResult> {
    // 1. autorisation (ownership)
    // 2. validation contrat (zod)
    // 3. appel service AI / DB
    // 4. retour DTO sérialisable
  },
};
```

## Migration

Les fonctions déjà extraites (ex: `apps/web/lib/chapter-intent/compile-chapter-intent.ts`,
`apps/web/lib/canon/assert-chapter-canon-readiness.ts`,
`apps/web/lib/readiness/build-premium-readiness-dashboard.ts`,
`apps/web/lib/studio/launch-readiness-fix-rows.ts`) sont déjà des **proto-usecases** :
elles n'ont pas de dépendance Next et sont testables. La migration consiste à les
déplacer ici en respectant la convention `*Usecase.execute(input): Promise<output>`.

Statut au sprint courant : couche partiellement extraite côté `lib/`, façade
unique `usecases/` à mettre en place chapitre par chapitre lors du prochain
sprint pour ne pas casser les ~50 routes existantes en une fois.

## Liste prioritaire (ordre recommandé pour P2.1)

1. `compile-chapter-intent` (déjà dans `lib/chapter-intent/`)
2. `build-chapter-cast-contract` (déjà dans `packages/core`)
3. `build-visual-world-contract`
4. `prepare-chapter-plan` (déjà dans `lib/studio/launch-readiness-fix-rows.ts`)
5. `approve-premium-outline` (route `approved-outline`)
6. `build-chapter-generation-contract` (déjà dans `packages/core`)
7. `preflight-chapter-generation` (déjà dans `lib/canon/assert-chapter-canon-readiness.ts`)
8. `launch-chapter-generation` (route `launch`)
9. `generate-character-visual-lock` (route `generate-visual`)
10. `compile-chapter-intent` puis `create-main-hero`, `create-project-with-first-chapter`
