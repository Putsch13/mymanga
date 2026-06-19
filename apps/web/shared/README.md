# `apps/web/shared/`

Code **isomorphe** (utilisable côté serveur ET client). Aucun import Prisma, aucun
import `server-only`, aucune dépendance Node spécifique.

## Sous-dossiers

- `errors/` — types d’erreurs publiques (catalogue P2.3 `generation-errors.ts`).
- `dto/` — types de transport API (request/response) partagés entre routes et UI.
- `feature-flags/` — lecture des flags (déjà partagés via `@manga-ai-studio/config`).

## Règle d’or

Si un fichier sous `shared/` importe `prisma`, `next/server`, ou un module Node-only,
c’est qu’il devrait vivre sous `server/` à la place.
