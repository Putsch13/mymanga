# Runbook : appliquer une migration Prisma

## TL;DR

| Quand                                       | Commande                                                              | Où                          |
| ------------------------------------------- | --------------------------------------------------------------------- | --------------------------- |
| Tu pushes une migration et déploies sur Render | _Rien_ — `prisma migrate deploy` est dans `render.yaml#buildCommand`. | Auto                        |
| Tu veux appliquer manuellement depuis ta machine | `pnpm --filter @manga-ai-studio/db exec prisma migrate deploy`        | Local, avec `.env` à jour   |
| Tu veux appliquer depuis un shell Render    | Idem, après avoir vérifié que `DIRECT_URL` est défini                 | Render Shell de `mymanga-web` |

## Pré-requis : URLs Supabase correctes

Supabase ne permet plus la connexion directe IPv4 sur les nouveaux projets. Le host `db.<ref>.supabase.co:5432` est inaccessible depuis la plupart des réseaux (résolution DNS partielle ou TCP timeout).

**Solution officielle : utiliser le pooler Supabase pour les deux URLs.**

| Variable       | Port  | Mode        | Utilisation       | Param spécifique                  |
| -------------- | ----- | ----------- | ----------------- | --------------------------------- |
| `DATABASE_URL` | 6543  | Transaction | Runtime app (Next) | `?pgbouncer=true&connection_limit=1&sslmode=require` |
| `DIRECT_URL`   | 5432  | Session     | Migrations Prisma | `?sslmode=require` (sans pgbouncer) |

Format complet (remplacer `<ref>`, `<password>`, `<region>`):

```bash
DATABASE_URL="postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&sslmode=require"
DIRECT_URL="postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require"
```

> ⚠️ Le username DOIT être `postgres.<ref>` (avec le slug du projet en suffixe), PAS juste `postgres`. C'est ce qui permet au pooler de router vers ton projet.

## Méthode 1 : déploiement automatique via Render (recommandé)

Le `render.yaml` exécute déjà `prisma migrate deploy` au build. Tu n'as rien à faire de plus :

1. Push ta migration (`packages/db/prisma/migrations/<timestamp>_<name>/migration.sql`) sur `main`
2. Render redéploie automatiquement
3. Si la migration échoue → le build échoue → ancien container reste up (fail-closed)

Vérifie juste que **`DIRECT_URL` est bien renseigné dans Render** (Settings → Environment).

## Méthode 2 : depuis ta machine locale

```bash
# Vérifier l'état avant
pnpm --filter @manga-ai-studio/db exec prisma migrate status

# Appliquer
pnpm --filter @manga-ai-studio/db exec prisma migrate deploy

# Re-vérifier
pnpm --filter @manga-ai-studio/db exec prisma migrate status
# → "Database schema is up to date!"
```

## Méthode 3 : depuis le Render Shell

Utile si tu veux exécuter une migration sans redéployer (ex: hotfix).

1. Render Dashboard → service `mymanga-web` → **Shell**
2. Lance :
   ```bash
   cd packages/db
   pnpm exec prisma migrate deploy
   ```

## Diagnostiquer une erreur P1001 ("Can't reach database server")

```bash
# Test DNS du host direct (devrait FAIL sur les nouveaux projets Supabase)
nslookup db.<ref>.supabase.co

# Test TCP du pooler en session mode (devrait SUCCEED)
nc -vz aws-0-<region>.pooler.supabase.com 5432
```

Si le pooler répond mais que le host direct timeout : **mets à jour `DIRECT_URL` pour passer par le pooler en port 5432.**

## Créer une nouvelle migration

```bash
# 1. Modifier packages/db/prisma/schema.prisma
# 2. Générer le SQL :
pnpm --filter @manga-ai-studio/db exec prisma migrate dev --name <slug_descriptif> --create-only
# 3. Vérifier le SQL généré dans packages/db/prisma/migrations/<timestamp>_<name>/
# 4. Appliquer :
pnpm --filter @manga-ai-studio/db exec prisma migrate deploy
# 5. Régénérer le client (utile en local) :
pnpm --filter @manga-ai-studio/db exec prisma generate
```

> Note : on n'utilise PAS `prisma db push` en équipe / prod — on veut des migrations versionnées et auditables.
