# Déploiement V3 — Manga AI Studio

Guide CTO pour **Render**, **Supabase**, **Stripe**, **Inngest** et providers **IA**.

---

## 1. Vue d'ensemble

| Composant | Rôle |
|-----------|------|
| **Render** | Héberge Next.js (`apps/web`), variables d'environnement, HTTPS. |
| **Supabase** | Auth (magic link), optionnellement **PostgreSQL** et **Storage** si tu centralises tout chez eux. |
| **PostgreSQL** | Base Prisma (`DATABASE_URL`) — peut être Supabase ou une base Render/Neon. |
| **Stripe** | Paiement **web** (packs de tokens). Webhooks pour créditer le wallet. |
| **Inngest** | Orchestration des jobs longs (pipeline chapitre manga-first). |
| **fal.ai** | FLUX (ex. `flux/schnell` branché dans le code ; passer en `flux-pro` pour la prod premium). |
| **Runware / BFL / Stability** | Clés optionnelles ; **en prod les mocks sont interdits** (tu verras un échec explicite si une clé manque). |

---

## 2. Supabase

1. Crée un projet sur [supabase.com](https://supabase.com).
2. **Auth → URL de redirection** : ajoute  
   `https://<ton-domaine-render>/auth/callback`  
   et `http://localhost:3000/auth/callback` pour le dev.
3. **Auth → Providers → Email** : active le magic link.
4. Récupère :
   - `NEXT_PUBLIC_SUPABASE_URL` (Settings → API)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (clé anon, safe côté client)
   - `SUPABASE_SERVICE_ROLE_KEY` : **uniquement serveur**. Recommandé si tu veux **stocker** les images (voir plus bas).

### Base de données

- **Option A** : PostgreSQL hébergé par Supabase → copie la **connection string** (mode pooling pour serverless) dans `DATABASE_URL` sur Render.  
- **Option B** : Postgres Render / Neon → même chose, une seule URL pour Prisma.

Sur Render après déploiement :

```bash
pnpm --filter @manga-ai-studio/db exec prisma db push
# ou migrations si tu en ajoutes
pnpm db:seed
```

### Storage (optionnel V3+)

- Crée un bucket `assets` (privé).
- Utilise la service role côté API pour signer des URLs d'upload — le code actuel peut être étendu avec `@supabase/storage-js`.

---

## 3. Render

1. **New → Blueprint** ou **Web Service** en pointant sur ce monorepo.
2. **Root directory** : `.` (racine du repo).
3. **Build command** (aligné `render.yaml`) :

   ```bash
   npm install -g pnpm@10.33.0 && pnpm install --frozen-lockfile && pnpm --filter @manga-ai-studio/db exec prisma generate && pnpm --filter @manga-ai-studio/web build
   ```

4. **Start command** :

   ```bash
   pnpm --filter @manga-ai-studio/web start
   ```

Si Render échoue sur **Corepack key verification**, n'utilise pas `corepack pnpm` : la commande ci-dessus installe `pnpm` directement et contourne ce problème.

5. Définis **toutes** les variables listées dans [`.env.example`](./.env.example) + celles ci-dessous.
6. **`NEXT_PUBLIC_APP_URL`** : URL publique du service (ex. `https://manga-ai-studio-web.onrender.com`) — utilisée pour Stripe redirect.

### Développement local sans Supabase

Dans `.env.local` :

```env
AUTH_DISABLED=true
DATABASE_URL=postgresql://...
```

Ne **jamais** mettre `AUTH_DISABLED=true` en production.

---

## 4. Stripe

1. [Dashboard Stripe](https://dashboard.stripe.com) → développeurs → clés API : `STRIPE_SECRET_KEY`.
2. **Webhooks** : endpoint  
   `https://<ton-domaine>/api/billing/webhooks/stripe`  
   Événement : `checkout.session.completed`.  
   Secret du webhook → `STRIPE_WEBHOOK_SECRET`.
3. Les **packs** (starter, creator, studio, pro_saga) sont définis dans le code ([`packages/billing/src/stripe-checkout.ts`](./packages/billing/src/stripe-checkout.ts)) avec des `price_data` dynamiques ; tu peux les remplacer par de vrais **Price IDs** Stripe pour la compta.
4. Le webhook est maintenant **idempotent** : un même `checkout.session.completed` ne recrédite plus le wallet deux fois.

---

## 5. Inngest

1. Crée un compte sur [inngest.com](https://www.inngest.com).
2. Ajoute le site : URL du serveur Next = `https://<domaine>/api/inngest`.
3. Récupère `INNGEST_EVENT_KEY` et `INNGEST_SIGNING_KEY` (noms exacts selon la doc Inngest pour ton SDK) et mets-les sur Render.
4. Sans `INNGEST_EVENT_KEY`, le bouton « Enqueue pipeline » enregistre un job avec un message *skipped* mais ne casse pas le site.

---

## 6. Providers IA

| Variable | Usage |
|----------|--------|
| `FAL_KEY` | Génération réelle via `https://fal.run/fal-ai/flux/schnell` ([adapter](packages/ai/src/adapters/fal-flux-adapter.ts)). |
| `BFL_API_KEY` | Génération via BFL (URL de livraison courte durée) — **à persister via Storage**. |
| `RUNWARE_API_KEY` | Génération via Runware (retourne une URL). |
| `STABILITY_API_KEY` | Génération via Stability (retourne une **data URL**) — **à persister via Storage**. |
| `OPENAI_API_KEY` | Outline chapitre, pipeline texte fallback-compatible et futures sorties structurées. |
| `POSTHOG_KEY` | Analytics produit (fallback no-op si absent). |
| `SENTRY_DSN` | Observabilité erreur (fallback console si absent). |
| `STORAGE_BUCKET` | Bucket **public** pour persister les images (ex: `mymanga-images`). |
| `SUPABASE_SERVICE_ROLE_KEY` | Requis côté serveur si tu veux uploader dans `STORAGE_BUCKET`. |

**fal** : crée une clé sur [fal.ai](https://fal.ai) → colle dans `FAL_KEY` sur Render.

### Diagnostics rapide (30 secondes)

Ouvre `https://<ton-app>.onrender.com/api/diagnostics/public` :
- si `authDisabled=true` en prod → tu as laissé `AUTH_DISABLED=true`
- si `hasFalKey=false` → les panels échoueront (plus de “mock” silencieux)
- si `hasInngest...=false` → utilise le bouton “Run now (sans Inngest)” dans la page génération

### Storage (recommandé pour multi-provider)

Si tu actives `BFL_API_KEY` ou `STABILITY_API_KEY`, configure aussi :
- `SUPABASE_SERVICE_ROLE_KEY`
- `STORAGE_BUCKET` (bucket **public**)

Le pipeline persiste automatiquement les images “non durables” vers le bucket.

---

## 7. Checklist avant mise en ligne

- [ ] `DATABASE_URL` + `prisma db push` / migrations  
- [ ] Supabase URL + anon key + redirect `/auth/callback`  
- [ ] `NEXT_PUBLIC_APP_URL`  
- [ ] Stripe clé + webhook  
- [ ] Inngest (optionnel mais recommandé pour la V3 « studio »)  
- [ ] `FAL_KEY` (ou autre provider) pour de vraies images  
- [ ] `OPENAI_API_KEY` pour enrichir les outlines et la chaîne texte
- [ ] `POSTHOG_KEY` / `SENTRY_DSN` si tu veux analytics + observabilité
- [ ] Pas de `AUTH_DISABLED` en prod  
- [ ] Logs / Sentry / PostHog (à brancher ensuite selon ta stack observabilité)

---

## 8. Checklist Render exacte (parité local -> prod)

Pour obtenir en prod le même comportement que le local validé sur le pipeline V4/phase 2 :

1. Variables Render minimales :
   - `DATABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_APP_URL`
   - `FAL_KEY`
   - `OPENAI_API_KEY`
2. Variables fortement recommandées :
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `STORAGE_BUCKET=mymanga-images`
   - `INNGEST_EVENT_KEY`
   - `INNGEST_SIGNING_KEY`
3. Ne pas définir :
   - `AUTH_DISABLED`
4. Après déploiement, exécuter :

```bash
pnpm --filter @manga-ai-studio/db exec prisma db push
```

5. Vérifier ensuite :
   - `GET /api/diagnostics/public`
   - `GET /api/diagnostics/admin`
6. Résultat attendu sur les diagnostics :
   - `hasFalKey=true`
   - `hasOpenAI=true`
   - `hasDatabaseUrl=true`
   - `authDisabled=false`
7. Vérification métier minimale :
   - créer un projet
   - configurer au moins 2 personnages
   - configurer le style manga
   - lancer `Estimer`
   - choisir `safe` / `bold` / `shock`
   - créer le brouillon
   - lancer la génération du chapitre
8. Résultat attendu sur le job :
   - étape `build_context`
   - étape `generate_bundle`
   - étape `continuity_pass`
   - étape `persist_chapter`
   - étape `generate_images`
   - étape `update_memory`
9. Si Inngest n’est pas prêt :
   - la route pipeline doit quand même fonctionner en fallback synchrone
10. Si tu actives BFL/Stability :
   - le bucket Supabase public doit être fonctionnel, sinon certaines images non durables ne seront pas conservées

---

## 9. Estimation coût IA par chapitre

Estimation issue du pipeline réellement testé localement :

- **39 panels**
- taille panel : **768x1024**
- provider image principal : **`fal-ai/flux/dev`**
- texte : **`gpt-4o-mini`**
- embeddings RAG : **`text-embedding-3-small`**

Prix confirmés :

- `fal-ai/flux/dev` : **0.025 USD / mégapixel**
- `gpt-4o-mini` : **0.15 USD / 1M tokens input** et **0.60 USD / 1M tokens output**
- `text-embedding-3-small` : **0.02 USD / 1M tokens**

Ordre de grandeur pour **1 chapitre V4 standard** :

| Poste | Hypothèse | Coût approx. |
|------|-----------|--------------|
| Images | 39 panels × 768×1024 | **~0.7668 USD** |
| Outline + dialogue + continuity pass + embeddings | `gpt-4o-mini` + embeddings | **~0.0098 USD** |
| **Total chapitre** | pipeline complet | **~0.7766 USD** |

Lecture produit :

- dans la configuration actuelle, **le coût image domine massivement**
- la partie texte/RAG reste **très faible** par rapport aux panels
- si tu augmentes la résolution, le coût monte presque linéairement côté image
- si tu passes sur un provider plus premium que `flux/dev`, le coût par chapitre peut monter fortement

Formule utile :

```text
coût_images = nb_panels × (largeur × hauteur / 1_000_000) × prix_par_mégapixel
```

---

## 10. Commandes utiles

```bash
pnpm install
pnpm --filter @manga-ai-studio/db exec prisma generate
pnpm db:push
pnpm db:seed
pnpm dev          # depuis la racine → lance apps/web
pnpm test         # tests routage @manga-ai-studio/ai
```

Pour t'imposer comme référence sur le marché : durcir la **modération** sur les payloads assemblés, ajouter **pgvector** + embeddings sur `packages/memory`, et des **tests e2e** sur les flux projet → chapitre → image.
