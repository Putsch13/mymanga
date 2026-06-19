# Configuration — `getAppConfig()`

> Point d'entrée unique pour lire la configuration d'environnement.
> Introduit en Sprint 2 (`packages/core/src/config/app-config.ts`).

## Pourquoi un singleton ?

Avant Sprint 2, MyManga avait 33+ fichiers qui lisaient directement
`process.env.X ?? "default"`. Inconvénients :
- aucun point central pour valider les types/formats
- pas de garde "this var is required in production"
- tests difficiles à isoler (mocks de `process.env` dispersés)
- defaults dupliqués (chaque fichier choisissait son propre fallback)

`getAppConfig()` résout ces problèmes :
- schéma **Zod** validé une fois au démarrage (cache après premier appel)
- defaults centralisés
- `_resetAppConfigForTests()` exposé pour les tests qui mockent l'env
- crash hard **uniquement** si `NODE_ENV=production` ET
  `DATABASE_URL` est absent

## Stratégie : warn-not-throw

Le projet a beaucoup de fallbacks gracieux (provider FAL absent →
fallback OpenAI ; Supabase absent → mode mémoire ; etc.). Faire
crasher le boot sur l'absence d'`OPENAI_API_KEY` ou de `FAL_KEY`
casserait cette résilience.

Donc :
- les **clés provider** (`OPENAI_API_KEY`, `FAL_KEY`, `RUNWARE_API_KEY`,
  `STRIPE_SECRET_KEY`, `INNGEST_*`, etc.) sont **optionnelles**
- les **modèles OpenAI** ont des **defaults** (`"gpt-4o-mini"`)
- `STORAGE_BUCKET` a un default (`"MyManga"`)
- seul `DATABASE_URL` est strictement requis en production

## Usage

```ts
import { getAppConfig } from "@manga-ai-studio/core";

const cfg = getAppConfig();

const model = cfg.OPENAI_NARRATIVE_MODEL; // "gpt-4o-mini" by default
const apiKey = cfg.OPENAI_API_KEY;        // string | undefined
const bucket = cfg.STORAGE_BUCKET;        // "MyManga" by default

// Cascade fallback métier (préservée explicitement) :
const autofillModel =
  cfg.OPENAI_AUTOFILL_MODEL ?? cfg.OPENAI_NARRATIVE_MODEL;
```

## Tests

```ts
import { _resetAppConfigForTests, getAppConfig } from "@manga-ai-studio/core";

beforeEach(() => {
  _resetAppConfigForTests();   // vide le cache
  process.env = { ...ORIGINAL_ENV };
});
```

## Variables couvertes (May 2026)

| Catégorie | Variables |
|---|---|
| Runtime | `NODE_ENV`, `DATABASE_URL` |
| Supabase | `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STORAGE_BUCKET`, `SUPABASE_STORAGE_BUCKET` |
| OpenAI | `OPENAI_API_KEY`, `OPENAI_NARRATIVE_MODEL`, `OPENAI_DIALOGUE_MODEL`, `OPENAI_AUTOFILL_MODEL`, `OPENAI_MANGA_EDITOR_MODEL`, `OPENAI_CONTINUITY_MODEL`, `STORY_ARCHITECT_MODEL` |
| Image providers | `FAL_KEY`, `FAL_API_KEY`, `RUNWARE_API_KEY`, `STABILITY_API_KEY`, `BFL_API_KEY` |
| Inngest | `INNGEST_SIGNING_KEY`, `INNGEST_EVENT_KEY` |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| Pipeline flags | `PIPELINE_V3_PREMIUM_ONLY`, `PIPELINE_V3_STORYBOARD`, `PIPELINE_V3_RENDER_FAL` |
| Image proxy | `IMAGE_PROXY_BASE_URL`, `IMAGE_PROXY_HMAC_KEY` |
| Logger | `LOG_LEVEL`, `LOG_FORMAT` |

## Variables NON couvertes (et pourquoi)

Certaines variables ne sont **volontairement pas** dans le schéma :
- alias Supabase legacy (`SUPABASE_BUCKET`, `SUPABASE_SERVICE_ROLE`,
  `SUPABASE_SERVICE_KEY`, `SUPABASE_ANON_KEY`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`) → garde la rétrocompatibilité avec
  les déploiements existants ; consommés via `process.env` direct dans
  `resolveSupabaseServerConfig`
- variables `MANGA_*` du pipeline image (testées ad hoc dans
  `image-generation-pass.ts` qui sera refactoré Sprint 4)

## Migration (pour ajouter un nouveau consommateur)

1. Vérifier qu'on n'a pas un helper plus spécifique
   (`resolveSupabaseServerConfig`, `getGenerationStackStatus`, etc.).
2. Si la var n'est pas dans le schéma, l'y ajouter avec son default
   et son type Zod.
3. Remplacer `process.env.X ?? "fallback"` par `getAppConfig().X`.
4. Si la valeur est lue **au top-level d'un module** (vs dans une
   fonction), s'assurer que les tests qui mockent `process.env`
   appellent `_resetAppConfigForTests()` dans leur `beforeEach`.
