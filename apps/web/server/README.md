# `apps/web/server/`

Code serveur (Node) **réutilisable** : usecases, repositories, services, preflight.
Aucun composant React, aucun import de Next côté UI ne doit vivre ici.

## Sous-dossiers (P2.2)

- `usecases/` — orchestration métier exposée comme `Usecase<Input, Output>`. Voir `usecases/README.md`.
- `repositories/` — accès Prisma typés (lecture/écriture) **sans logique métier**. Une fonction = une intention de DB.
- `ai/` — wrappers fins autour des packages `@manga-ai-studio/ai`, `core`, `workflow` quand on doit injecter du contexte serveur (logger, retry policy, telemetry).
- `preflight/` — gardes "go/no-go" composées (canon, readiness, contracts) : retour synchrone, jamais d’écriture DB.
- `errors/` — erreurs serveur typées (catalogue P2.3 + variantes serveur).

## Règle d’or

Une route API (`apps/web/app/api/**/route.ts`) doit être un **wrapper fin** :

```ts
const usecase = preflightChapterGenerationUsecase;
const out = await usecase.execute(...);
return NextResponse.json(out);
```

La logique vit dans un usecase, pas dans la route.
