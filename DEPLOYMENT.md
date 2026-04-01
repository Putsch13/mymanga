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
| **Runware / BFL / Stability** | Clés optionnelles ; adapters mock si absentes. |

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
   - `SUPABASE_SERVICE_ROLE_KEY` : **uniquement serveur** si tu fais des opérations admin (pas obligatoire pour ce repo tel quel).

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
   corepack enable && pnpm install && pnpm --filter @manga-ai-studio/db exec prisma generate && pnpm --filter @manga-ai-studio/web build
   ```

4. **Start command** :

   ```bash
   pnpm --filter @manga-ai-studio/web start
   ```

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
| `BFL_API_KEY` | À brancher sur l'API BFL officielle dans l'adapter. |
| `RUNWARE_API_KEY` | Workflows / LoRA — adapter à compléter. |
| `STABILITY_API_KEY` | Stable Image Ultra — adapter à compléter. |
| `OPENAI_API_KEY` | Pour futurs agents texte / structured outputs (PromptComposer v2 LLM). |

**fal** : crée une clé sur [fal.ai](https://fal.ai) → colle dans `FAL_KEY` sur Render. Sans clé, l'UI utilise des **placeholders** (mock).

---

## 7. Checklist avant mise en ligne

- [ ] `DATABASE_URL` + `prisma db push` / migrations  
- [ ] Supabase URL + anon key + redirect `/auth/callback`  
- [ ] `NEXT_PUBLIC_APP_URL`  
- [ ] Stripe clé + webhook  
- [ ] Inngest (optionnel mais recommandé pour la V3 « studio »)  
- [ ] `FAL_KEY` (ou autre provider) pour de vraies images  
- [ ] Pas de `AUTH_DISABLED` en prod  
- [ ] Logs / Sentry / PostHog (à brancher ensuite selon ta stack observabilité)

---

## 8. Commandes utiles

```bash
pnpm install
pnpm --filter @manga-ai-studio/db exec prisma generate
pnpm db:push
pnpm db:seed
pnpm dev          # depuis la racine → lance apps/web
pnpm test         # tests routage @manga-ai-studio/ai
```

Pour t'imposer comme référence sur le marché : durcir la **modération** sur les payloads assemblés, ajouter **pgvector** + embeddings sur `packages/memory`, et des **tests e2e** sur les flux projet → chapitre → image.
