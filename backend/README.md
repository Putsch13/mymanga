# Backend (Domain / Jobs / DB)

Le “backend” de MYMANGA est un ensemble de packages TypeScript (logique métier, DB, workflows) situés ici :

- `packages/ai` : routage providers image + génération + prompt composers
- `packages/workflow` : orchestration jobs Inngest + pipeline chapitre
- `packages/db` : Prisma + schéma + seed
- `packages/memory` : RAG/pgvector + snapshots mémoire
- `packages/billing` : wallet + réservations tokens
- `packages/moderation` : rules + capabilities providers
- `packages/core` : types + rendu manga + règles canon

## Commandes

Depuis la racine :

- `pnpm backend:test` (tests AI)
- `pnpm db:push` / `pnpm db:seed`

