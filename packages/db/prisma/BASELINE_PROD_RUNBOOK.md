# Production Baseline Runbook

## Objectif
Établir une baseline Prisma Migrate propre pour la base prod existante avant d'appliquer la migration `hard switch`.

## Artefacts préparés
- schéma prod introspecté : `packages/db/prisma/schema.prod-baseline.prisma`
- migration baseline reviewable : `packages/db/prisma/migrations/20260410_080000_prod_legacy_baseline/migration.sql`
- checks legacy : `packages/db/prisma/manual-checks/legacy-prechecks.sql`
- checks hard switch : `packages/db/prisma/manual-checks/hard-switch-pre-post-checks.sql`
- runner legacy : `packages/db/prisma/run-legacy-prechecks.ts`
- runner hard switch : `packages/db/prisma/run-hard-switch-postchecks.ts`

## Principe
- la baseline représente l'état déjà présent en production
- elle ne doit pas être exécutée sur la base
- elle doit être marquée comme `applied` dans `_prisma_migrations`
- ensuite seulement, `migrate deploy` peut appliquer la migration `hard switch`

## Reconstruction du schéma prod actuel
Source de vérité utilisée :
- introspection read-only de la prod via `prisma db pull --print`

Commande utilisée pour préparer le fichier :
```bash
pnpm --filter @manga-ai-studio/db exec prisma db pull --print --schema prisma/schema.prisma > prisma/schema.prod-baseline.prisma
```

## Génération de la baseline reviewable
Migration proposée :
- `20260410_080000_prod_legacy_baseline`

Commande utilisée pour générer son SQL :
```bash
pnpm --filter @manga-ai-studio/db exec prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prod-baseline.prisma --script > prisma/migrations/20260410_080000_prod_legacy_baseline/migration.sql
```

## Marquage comme appliquée
Commande exacte :
```bash
pnpm --filter @manga-ai-studio/db exec prisma migrate resolve --applied 20260410_080000_prod_legacy_baseline --schema prisma/schema.prisma
```

Effet attendu dans `_prisma_migrations` :
- insertion d'une ligne pour `20260410_080000_prod_legacy_baseline`
- statut appliqué sans exécuter le SQL de baseline contre la base
- `migrate status` doit ensuite montrer la baseline appliquée et le hard switch encore en attente

## Séquence future complète
1. `pnpm --filter @manga-ai-studio/db migrate:status`
2. `pnpm --filter @manga-ai-studio/db checks:legacy`
3. valider humainement `schema.prod-baseline.prisma`
4. valider humainement `migrations/20260410_080000_prod_legacy_baseline/migration.sql`
5. `prisma migrate resolve --applied 20260410_080000_prod_legacy_baseline`
6. `pnpm --filter @manga-ai-studio/db migrate:status`
7. `pnpm --filter @manga-ai-studio/db migrate:deploy`
8. dry-run borné du backfill
9. `pnpm --filter @manga-ai-studio/db checks:hard-switch`
10. backfill réel global
11. post-checks finaux

## Points de vigilance
- la baseline doit être ordonnée avant `20260410_091500_hard_switch_fal_scene_first`
- ne pas exécuter le SQL de baseline sur la base existante
- `legacy-prechecks.sql` doit être utilisé avant baseline/hard switch
- `hard-switch-pre-post-checks.sql` ne doit être utilisé qu'après création des nouvelles tables/colonnes
- les runners `checks:legacy` et `checks:hard-switch` sont les points d'entrée à privilégier pour obtenir un JSON exploitable
