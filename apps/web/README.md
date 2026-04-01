# `apps/web` — Site web Next.js

Ce dossier contient l'interface **Manga AI Studio** (App Router) et les **Route Handlers** sous `app/api/`.

## Documentation complète

Toute la documentation du monorepo (architecture, IA, services, déploiement) se trouve à la **racine du dépôt** :

**[../../README.md](../../README.md)**

## Lancer uniquement ce site

Depuis la **racine** du monorepo (recommandé) :

```bash
pnpm install
pnpm db:generate
pnpm dev
```

Depuis `apps/web` :

```bash
pnpm dev
```

Le site écoute par défaut sur [http://localhost:3000](http://localhost:3000).

## Variables d'environnement

Place un fichier `.env.local` ici (ou à la racine selon ta config) en t'inspirant de **`../../.env.example`**.

## Structure utile

| Chemin | Rôle |
|--------|------|
| `app/(app)/` | Pages authentifiées (dashboard, projets, liste chapitres, **lecture** `/projects/[id]/chapters/[chapterId]/read`, wallet…) |
| `app/(auth)/` | Connexion magic link |
| `app/auth/` | Callback OAuth / sign-out |
| `app/api/` | API REST |
| `components/` | UI (boutons, cartes, header…) |
| `components/manga/` | Lecteur manga (double page, suite chapitre) |
| `lib/auth/` | Session utilisateur Prisma + Supabase |
| `lib/supabase/` | Clients SSR / middleware |
| `middleware.ts` | Rafraîchissement session Supabase |

Pour le build production : `pnpm build` à la racine avec le filtre workspace, ou `pnpm exec next build` depuis ce dossier après `pnpm install` à la racine.
