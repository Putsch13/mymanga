# Manga AI Studio

> **Studio éditorial premium pour générer des chapitres de manga / webtoon de bout en bout — depuis une simple conversation avec l'IA jusqu'à des images cohérentes panel par panel.**

Manga AI Studio n'est pas un « générateur d'images ». C'est un **pipeline éditorial** qui transforme une intention narrative en **contrats vérifiables successifs**, chacun gardé par une QA structurelle (cast, monde visuel, dialogue, plan de production), et n'autorise le rendu image qu'une fois tous les contrats validés. **Fail-closed by design.**

Depuis la refonte UX (juin 2026), la configuration d'un chapitre passe par un **studio conversationnel** : l'auteur configure ses personnages, puis discute avec une IA qui pose des questions ciblées (que se passe-t-il, époque, décors, PNJ, créatures…) et alimente **toute la configuration en back** automatiquement.

---

## Sommaire

1. [Pitch produit](#pitch-produit)
2. [Le studio conversationnel](#le-studio-conversationnel)
3. [Pipeline IA détaillé](#pipeline-ia-détaillé)
4. [Cohérence des personnages](#cohérence-des-personnages)
5. [Coût d'un chapitre (tarifs réels 2026)](#coût-dun-chapitre-tarifs-réels-2026)
6. [Architecture technique](#architecture-technique)
7. [Contrats clés (fail-closed)](#contrats-clés-fail-closed)
8. [Setup développeur](#setup-développeur)
9. [Variables d'environnement](#variables-denvironnement)
10. [Déploiement Render + Supabase](#déploiement-render--supabase)
11. [Tests et qualité](#tests-et-qualité)
12. [Runbooks](#runbooks)

---

## Pitch produit

### Ce que ça résout

L'IA générative produit des images magnifiques mais incohérentes : un personnage change de tête entre deux cases, un décor disparaît, un dialogue est attribué à quelqu'un qui n'est pas dans le panel, un château médiéval se retrouve avec des néons. Pour un manga de 10 pages (≈ 70 panels), cette incohérence rend l'output inutilisable.

**Manga AI Studio impose des contrats narratifs et visuels en amont** : si le système ne sait pas qui parle, où, à quelle époque, avec quel canon, il bloque la génération. Pas de « à peu près ».

### Pour qui

| Profil | Cas d'usage |
|---|---|
| **Auteur indépendant** | Prototyper un chapitre en 10 minutes au lieu de 2 semaines |
| **Studio éditorial** | Itérer sur le pitch, le casting et le découpage avant rendu |
| **Webtoon / scanlation** | Générer des chapitres réguliers avec un univers cohérent |
| **Plateforme IA** | Brique « studio premium » intégrable sur sa propre stack |

### Ce qu'on garantit

- **Cast cohérent** : héros, héros secondaires et PNJ sont nommés, ancrés, reconnus par le LLM dialoguiste. Si aucun héros n'est sélectionné, le studio en dérive un automatiquement.
- **Époque ancrée** : `era` / `setting` du chapitre conditionnent **réellement** les décors, costumes et props (pas d'anachronisme : pas de néon en médiéval, pas de torche en station orbitale).
- **Canon visuel** : chaque personnage a un `CharacterCanonPack` avec score de complétude (0-100%).
- **Dialogue ancré** : chaque réplique a un speaker visible dans le panel (interdit « dialogue flottant »).
- **Plan canonique unique** : 70 à 75 panels (cible 72), validés via QA structure.
- **Style manga garanti** : ancrage manga permanent au prompt + photoréalisme / 3D bannis au négatif.
- **Anti-régression** : ~2 100 tests automatisés sur le monorepo (Vitest).

---

## Le studio conversationnel

Depuis la refonte UX, la page d'édition d'un chapitre ouvre par défaut le **Studio conversationnel** (`ChapterInterviewStudio`). L'ancien wizard 7 étapes reste accessible via `?mode=advanced` (filet le temps de valider le conversationnel).

### Le parcours

```mermaid
flowchart LR
    A[Configurer les personnages] --> B[Discuter avec l'IA]
    B --> C[IA pose 1-3 questions ciblées]
    C --> D[Auteur répond en langage libre]
    D --> E[/interview : compile intention + persiste tout]
    E --> F{Questions critiques traitées ?}
    F -->|Non| C
    F -->|Oui| G[Bouton « Générer »]
    G --> H[estimate → launch → pipeline v3]
```

### Comment ça marche

1. **L'auteur configure ses personnages** (création de fiches, canon visuel).
2. **Il discute** : l'endpoint `POST /interview` (re)compile l'intention à chaque tour via `compileChapterIntentUsecase`.
3. **L'IA pose les bonnes questions** : un planificateur **déterministe** (`chapter-interview-planner`) lit les `ambiguityFlags` et les tableaux `required*` vides du `ChapterIntentContract`, et génère des questions ciblées (critical / recommended / optional) avec suggestions cliquables.
4. **L'IA alimente le back correctement** : à chaque tour, `apply-compiled-intent` persiste le `chapterIntentContract` + `intentNarrativeContract` dans le snapshot studio, et `extractWorldEntitiesFromIntent` + `upsertWorldEntities` créent les PNJ / props (pattern **USER-WINS** : jamais d'écrasement d'une saisie utilisateur).
5. **Un canevas de config live** se remplit en temps réel (personnages, époque, décors, lieux, PNJ, créatures, objets, action, émotion) avec une barre de complétion.
6. **Quand les questions critiques sont traitées**, le bouton « Générer » enchaîne `estimate` (plan canonique) → `launch` (pipeline v3). Si une sélection de cast manque, elle est auto-dérivée (héros = 1er perso au rôle héros, cast actif = tous).

> **Pourquoi conversationnel ?** Le mode Express auto-remplit déjà décors / monde / plan depuis l'intention. Un interviewer qui maîtrise *intention + époque + PNJ* + l'auto-fill = couverture complète du parcours, sans formulaires.

---

## Pipeline IA détaillé

### Un seul pipeline : premium v3

Le pipeline legacy a été **entièrement supprimé** (juin 2026). `run-full-chapter-pipeline` ne route plus que vers le **premium v3** et échoue dur si le rendu v3 n'aboutit pas (plus de fallback silencieux).

```mermaid
flowchart TB
    JOB[Job Inngest<br/>chapter-pipeline] --> RUNNER[run-full-chapter-pipeline.ts<br/><i>orchestrateur mince</i>]
    RUNNER --> PREMIUM[run-premium-v3-pipeline.ts<br/><i>LE pipeline</i>]
    PREMIUM --> P1[story-pass<br/>IA1 Story Architect]
    PREMIUM --> P2[storyboard-pass<br/>IA2 Manga Editor]
    PREMIUM --> P3[render-pass<br/>FAL v3]
    PREMIUM --> P4[QA passes]
```

### Vue macro : 4 cerveaux IA + N validateurs

```mermaid
flowchart TB
    subgraph "Phase 1: Compréhension (studio conversationnel)"
      INPUT[Conversation auteur] --> IC[IA-Intent Compiler<br/>gpt-4o-mini]
      IC --> CIC[ChapterIntentContract<br/>+ era/setting + confidence]
      CIC --> WE[IA-World Extractor<br/>gpt-4o-mini]
      WE --> NPC[NpcGroups + WorldProps<br/>persistés DB USER-WINS]
    end

    subgraph "Phase 2: Architecture narrative"
      CIC --> SA[IA1: Story Architect<br/>gpt-4o-mini<br/>+ ANCRE époque/cadre]
      SA --> ARC[StoryArc:<br/>6-10 beats + cliffhanger]
    end

    subgraph "Phase 3: Découpage éditorial"
      ARC --> VW[IA-Visual World Composer<br/>gpt-4o-mini<br/>+ ANCRE temporelle stricte]
      VW --> CCP[Plan canonique 70-75 panels]
      CCP --> ME[IA2: Manga Editor<br/>gpt-4o-mini]
      ME --> SP[StoryboardPlan]
    end

    subgraph "Phase 4: Dialogue + QA"
      SP --> DSW[IA-Dialogue Scene Writer<br/>gpt-4o-mini<br/>1 appel par beat]
      DSW --> DC[DialogueContract<br/>speakers ancrés]
    end

    subgraph "Phase 5: Rendu image"
      DC --> RSB[RenderSpec Builder<br/>+ minimal prompt EN]
      RSB --> ROUTE[FAL Route v3<br/>par renderMode]
      ROUTE --> FAL[Fal.ai<br/>Flux dev / schnell / lora / redux]
      FAL --> VQA[IA-Vision QA<br/>gpt-4o-mini<br/>optionnel]
    end
```

### Le studio de prompt

Un **seul** builder de prompt panel est sur le chemin critique : `buildMinimalPanelPromptStrict` (dossier `minimal-panel-prompt/`). Il produit directement un prompt anglais court (700-1200 chars), structuré en blocs SUBJECT / ENVIRONMENT / SHOT / ACTION / STYLE + bloc négatif, avec :

- modes « character-first » (le décor passe en arrière-plan sur un two-shot, pas en sujet obligatoire) ;
- ancre manga permanente dans le bloc STYLE ;
- trigger words LoRA injectés **une seule fois** (en tête, meilleure adhérence Flux LoRA) ;
- détecteurs stricts : refus des prompts contradictoires, des négations dans le positif, des hard-locks sans référence.

### Inventaire des appels LLM

Pour un chapitre premium standard (72 panels, sans reroll) :

| Étape | Service | Modèle | Appels |
|---|---|---|---|
| Compile intent (par tour de chat) | `compile-chapter-intent.ts` | `gpt-4o-mini` | 1 par tour |
| Extract world entities | `extract-world-entities-from-intent.ts` | `gpt-4o-mini` | 1 par tour |
| NPC resolve (optionnel) | `npc-resolve/route.ts` | `gpt-4o-mini` | à la demande |
| Story architect | `story-architect-agent-llm.ts` | `gpt-4o-mini` | 1 |
| Visual world composer | `visual-world-composer.ts` | `gpt-4o-mini` | 1 |
| Manga editor (storyboard) | `manga-editor-agent-llm.ts` | `gpt-4o-mini` | 1 |
| Dialogue scene writer | `dialogue-scene-writer.ts` | `gpt-4o-mini` | **1 par beat** (≈ 8) |
| Extract chapter visual contract | `extract-chapter-visual-contract.ts` | `gpt-4o-mini` | 1 |
| Vision QA panel (optionnel) | `panel-vision-analyzer.ts` | `gpt-4o-mini` (vision) | échantillon |

**Total LLM moyen** : ~20-25 appels OpenAI / chapitre, ~40k tokens input + ~22k tokens output.

### Inventaire des appels image (Fal.ai)

| Modèle Fal | Usage |
|---|---|
| `fal-ai/flux/dev` | Panels narratifs critiques, character locks (référence forte) |
| `fal-ai/flux/schnell` | Panels rapides (cutaways, inserts d'objets) |
| `fal-ai/flux-lora` | Personnage avec LoRA entraînée (cohérence maximale) |
| `fal-ai/flux/dev/redux` | Conditionnement par image de référence (IP-adapter, character locks) |
| `fal-ai/flux-realism` | Scènes hyper-réalistes (rare) |

Routage déterministe via `fal-render-route-v3.ts` (`renderMode` → modèle optimal) puis sélection finale dans `fal-adapter-shared.ts` (LoRA vs Redux vs texte selon la `referencePolicy` et la catégorie de panel).

---

## Cohérence des personnages

Le point le plus dur du manga IA (même tête à chaque case) est traité par une **stack à 3 niveaux**, du plus fort au plus faible :

1. **LoRA entraînée** (`fal-ai/flux-lora`) — identité figée par fine-tuning, trigger word en tête de prompt. Entraînement auto déclenché quand un perso a assez de références (`pipeline-lora`).
2. **Flux Redux IP-adapter** (`fal-ai/flux/dev/redux`) — conditionnement par **jusqu'à 4 images de référence** (canon + closeup + action). Activé sur les `CHARACTER_LOCK` avec `referencePolicy = STRONG` et référence validée.
3. **Visual DNA texte** — description canon riche (visage, yeux, cheveux, silhouette, marqueurs permanents) injectée dans le bloc SUBJECT, en dernier recours.

Garde-fous : `isValidCharacterReference` refuse les URLs non-perso avant d'activer Redux ; `visual-drift-detector` et `visual-consistency` scorent la dérive.

---

## Coût d'un chapitre (tarifs réels 2026)

### Hypothèses

- **Chapitre cible** : 72 panels
- **OpenAI** : `gpt-4o-mini` partout (**$0.15 / 1M tokens input**, **$0.60 / 1M tokens output**)
- **Fal.ai** : mix réaliste ~60% `flux/dev` (~$0.025/MP) + ~30% `flux/schnell` (~$0.003/MP) + ~10% `flux-lora` / `redux` (~$0.035/MP)

### Synthèse

| Poste | Coût ($) |
|---|---|
| **Texte total** (~40k in + ~22k out, ~25 appels) | **~$0.020** |
| 43 panels `flux/dev` (60%) | $1.075 |
| 22 panels `flux/schnell` (30%) | $0.066 |
| 7 panels `flux-lora`/`redux` (10%) | $0.245 |
| Cover (optionnel) | $0.025 |
| **Image total** (~73 images) | **~$1.41** |
| **TOTAL chapitre standard** | **~$1.43** |

### Par scénario

| Scénario | Coût estimé |
|---|---|
| **Chapitre rapide (100% schnell)** | ~$0.24 |
| **Chapitre standard (mix)** | **~$1.43** |
| **Chapitre premium (100% flux/dev + vision QA)** | ~$2.20 |
| **+ rerolls fréquents (30%)** | +$0.40 |
| **+ LoRA personnage entraînée** | +$2-5 (one-shot, amorti sur tout un manga) |

### À retenir

- **Le coût texte est négligeable** (~1% du total). C'est le rendu image qui fait 99% de la facture.
- **Optimisation clé** : router plus de panels vers `flux/schnell` (cutaways, inserts) et réserver `flux/dev` / `redux` aux panels critiques. Le routeur le fait déjà via `renderMode` et `panelCriticality`.

> Tarifs indicatifs — recalculer lors d'un changement de grille. Logique interne : `packages/billing/src/pricing.ts`.

---

## Architecture technique

### Stack

| Couche | Technologie |
|---|---|
| **Frontend** | Next.js 15 (App Router) · React 19 · Tailwind v4 · shadcn/ui · Radix UI |
| **Backend** | Route handlers Next.js · packages TypeScript · Inngest pour les jobs longs |
| **Database** | PostgreSQL (Supabase) · Prisma 6 · pgvector pour embeddings |
| **Auth + Storage** | Supabase (cookies SSR) · Bucket privé pour les images générées |
| **LLM** | OpenAI (`gpt-4o-mini` partout, `gpt-4o` en option pour passes critiques) |
| **Image** | Fal.ai (Flux dev / schnell / lora / redux / realism) ; adaptateurs BFL / Runware / Stability disponibles |
| **Paiement** | Stripe (wallet en tokens internes) |
| **Rate-limit** | Upstash Redis (optionnel) |
| **Hosting** | Render.com (build + migrations Prisma auto) |

### Monorepo

```
MYMANGA/
├── apps/
│   └── web/                     # Next.js (UI + API routes)
│       ├── components/studio/   # Studio conversationnel + wizard avancé
│       │   └── chapter-interview-studio.tsx   # NOUVELLE vue par défaut
│       ├── features/studio/     # Wizard panels (mode avancé)
│       ├── lib/chapter-studio/  # Helpers (apply-compiled-intent, snapshot, sync-*)
│       └── app/api/.../interview/  # Endpoint de l'interviewer IA
├── packages/
│   ├── ai/                      # Services LLM, agents, prompt builders, Fal adapter
│   │   └── src/services/chapter-interview-planner.ts  # Planificateur de questions (pur)
│   ├── core/                    # Types Zod, contrats, règles produit (PRODUCTION_RULES)
│   ├── workflow/                # Orchestration pipeline v3, passes, jobs Inngest
│   ├── db/                      # Prisma 6 + migrations
│   ├── billing/                 # Tarification, wallet, Stripe
│   ├── memory/                  # Embeddings, snapshots mémoire
│   ├── continuity/              # Kernel & continuité narrative
│   ├── world/                   # Univers (ontologies, résolveur NPC)
│   ├── moderation/              # Garde-fous contenu
│   ├── visual-consistency/      # Scoring cohérence visuelle
│   ├── exports/                 # Export PDF/CBZ + polices manga
│   ├── ui/                      # Composants partagés
│   └── config/                  # Schémas env partagés
├── tests/contracts/             # Tests de contrat cross-package
├── scripts/                     # Audit imports, audit bundle
├── docs/                        # Architecture + runbooks
└── render.yaml                  # Blueprint déploiement Render
```

### Les 2 fichiers cœur

- `packages/workflow/src/run-full-chapter-pipeline.ts` — point d'entrée Inngest, finalise après v3 (échec dur sinon).
- `packages/workflow/src/run-premium-v3-pipeline.ts` — orchestration premium complète (contrats, storyboard, render v3).

---

## Contrats clés (fail-closed)

Chaque contrat est un **schéma Zod strict** dans `packages/core/src/types/`. Si un contrat échoue, le pipeline s'arrête avec un code d'erreur stable.

| Contrat | Rôle | Fichier |
|---|---|---|
| `ChapterIntentContract` | Intention compilée : pitch, **era/setting**, required*, `ambiguityFlags`, `confidenceScore` | `chapter-intent-contract.ts` |
| `IntentNarrativeContract` | Décompose l'intention en événements/entités vérifiables (sans LLM) | `intent/intent-narrative-contract.ts` |
| `ChapterCastContract` | Héros, héros secondaires, NPC groups validés avant pipeline | `chapter-cast-contract.ts` |
| `CharacterCanonPack` | Identité visuelle complète d'un personnage (score 0-100%) | `chapter-studio.ts` |
| `VisualWorldContract` | Lieux, NPC, créatures, props structurés (auto-reconstruit) | `visual-world/visual-world-contract.ts` |
| `CanonicalChapterProductionPlan` | Plan officiel 70-75 panels, source unique estimate + launch | `production/canonical-production-plan.ts` |
| `StoryboardPlan` | Pages, panels, layouts, renderMode | `packages/ai/src/contracts/storyboard-plan.ts` |
| `PanelRenderSpec` | Spec stricte de rendu d'une case (refs, locks, LoRA, contraintes) | `packages/ai/src/contracts/panel-render-spec.ts` |
| `DialogueContract` | Lignes ancrées avec speakers visibles dans le panel | `dialogue-contract.ts` |

### Codes d'erreur pipeline (extraits)

40+ codes stables dans `apps/web/shared/errors/generation-errors.ts` :

- `INTENT_CONTRACT_REQUIRED`, `INTENT_CONFIDENCE_TOO_LOW` : intention absente ou trop vague
- `VISUAL_WORLD_CONTRACT_FAILED` : décors / entités manquants
- `DIALOGUE_SPEAKER_UNKNOWN` : speaker non résolu
- `INCOMPLETE_PLAN`, `SHOT_PLAN_UNRELIABLE` : plan incomplet ou déséquilibré
- `CAST_CONTRACT_INVALID`, `CHARACTER_LABELS_UNRESOLVED` : cast invalide
- `premium_v3_render_failed` : le rendu v3 n'a pas abouti (plus de fallback legacy)

---

## Setup développeur

### Prérequis

- Node.js ≥ 20
- pnpm 10.33.0
- PostgreSQL local OU compte Supabase
- Compte OpenAI (clé API)
- Compte Fal.ai (clé API) — optionnel pour le développement texte uniquement

### Installation

```bash
git clone https://github.com/Putsch13/mymanga.git
cd MYMANGA
pnpm install
cp .env.example .env
# Éditer .env avec tes clés (DATABASE_URL, DIRECT_URL, OPENAI_API_KEY, FAL_KEY...)
pnpm db:generate
pnpm --filter @manga-ai-studio/db exec prisma migrate deploy
pnpm dev
```

L'app est sur `http://localhost:3000`.

### Commandes utiles

| Commande | Rôle |
|---|---|
| `pnpm dev` | Lance Next.js en dev |
| `pnpm build` | Build prod |
| `pnpm typecheck` | Typecheck tous les packages |
| `pnpm lint` | Lint tous les packages |
| `pnpm test` | Tous les tests |
| `pnpm --filter @manga-ai-studio/web test` | Tests app web uniquement |
| `pnpm --filter @manga-ai-studio/db exec prisma migrate dev` | Créer une migration |
| `pnpm --filter @manga-ai-studio/db exec prisma studio` | Ouvrir Prisma Studio |

---

## Variables d'environnement

### Critiques (production)

```env
# ─── Database (Supabase pooler — voir docs/runbooks/database-migrations.md) ───
# Runtime app : pooler TRANSACTION mode, port 6543, avec pgbouncer
DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&sslmode=require
# Migrations Prisma : pooler SESSION mode, port 5432 (PAS de pgbouncer param)
DIRECT_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require

# ─── Supabase ───
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
STORAGE_BUCKET=manga-assets

# ─── App ───
NEXT_PUBLIC_APP_URL=https://your-app.onrender.com

# ─── IA (obligatoires pour générer) ───
OPENAI_API_KEY=sk-...
FAL_KEY=...

# ─── Pipeline ───
PIPELINE_V3_PREMIUM_ONLY=true

# ─── Stripe (paiement) ───
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# ─── Inngest (jobs longs) ───
INNGEST_EVENT_KEY=...
INNGEST_SIGNING_KEY=signkey_...

# ─── Vision QA (optionnel) ───
VISUAL_PANEL_QA_VISION=1
ENABLE_PREMIUM_VISION_QA=1
PREMIUM_VISUAL_QA_REQUIRED=0

# ─── Rate limit (optionnel, recommandé en prod) ───
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...

# ─── Mocks images (NE PAS activer en prod) ───
# ENABLE_IMAGE_MOCKS=1
```

### Modèles LLM (override, défaut `gpt-4o-mini`)

| Variable | Service |
|---|---|
| `OPENAI_MODEL_INTENT` | compile-chapter-intent |
| `OPENAI_VISUAL_WORLD_MODEL` | visual-world-composer |
| `OPENAI_SCENE_DIALOGUE_MODEL` | dialogue-scene-writer |
| `OPENAI_CHAPTER_VISUAL_CONTRACT_MODEL` | extract-chapter-visual-contract |
| `STORY_ARCHITECT_MODEL` | story-architect-agent-llm |
| `OPENAI_MANGA_EDITOR_MODEL` | manga-editor-agent-llm |
| `OPENAI_VISION_MODEL` | panel-vision-analyzer |
| `OPENAI_OUTLINE_MODEL` | chapter-outline |
| `OPENAI_WORLD_EXTRACTION_MODEL` | extract-world-entities-from-intent |
| `OPENAI_EMBEDDING_MODEL` | embeddings mémoire (défaut `text-embedding-3-small`) |

### Dev local minimal

```env
AUTH_DISABLED=true
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/manga
DIRECT_URL=postgresql://postgres:postgres@localhost:5432/manga
OPENAI_API_KEY=sk-...
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=test
```

**Ne jamais laisser `AUTH_DISABLED=true` en production.**

---

## Déploiement Render + Supabase

### 1. Supabase — ce que tu fais

1. **Créer un projet Supabase.** Note le `<ref>` (l'identifiant du projet) et le mot de passe DB.
2. **Récupérer les chaînes de connexion** (Settings → Database → Connection pooling) :
   - **Runtime app** → `DATABASE_URL` : pooler **Transaction**, port **6543**, ajouter `?pgbouncer=true&connection_limit=1&sslmode=require`
   - **Migrations** → `DIRECT_URL` : pooler **Session**, port **5432**, `?sslmode=require` (⚠️ **pas** de `pgbouncer`)
   - ⚠️ Le host direct `db.<ref>.supabase.co` n'est plus joignable en IPv4 sur Render → **toujours passer par le pooler** (`aws-0-<region>.pooler.supabase.com`) même pour `DIRECT_URL`.
3. **Récupérer les clés API** (Settings → API) : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
4. **Créer un bucket de storage privé** (Storage → New bucket) nommé selon `STORAGE_BUCKET` (ex. `manga-assets`), **non public**.
5. Les migrations Prisma sont appliquées **automatiquement** au build Render (`prisma migrate deploy`) — tu n'as **rien à lancer manuellement** dans Supabase pour le schéma.

> **« Qu'est-ce que je fous dans le run ? »** → Rien à la main côté Supabase pour le schéma : le `buildCommand` Render exécute `prisma migrate deploy` qui crée/maj toutes les tables. Tu dois seulement (a) avoir créé le bucket de storage, (b) renseigné les variables d'env Render ci-dessous. Le `startCommand` lance juste le serveur Next.js.

### 2. Render — ce que tu mets dans l'env

Le `render.yaml` est déjà fourni (build + migrations + start auto). Toutes les variables sont en `sync: false` → **tu les renseignes dans le dashboard Render** (Environment).

**À renseigner obligatoirement :**

| Variable | Valeur |
|---|---|
| `DATABASE_URL` | pooler **6543** + `pgbouncer=true&connection_limit=1&sslmode=require` |
| `DIRECT_URL` | pooler **5432** + `sslmode=require` (pas de pgbouncer) |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | clé anon Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | clé service_role Supabase |
| `STORAGE_BUCKET` | nom du bucket (ex. `manga-assets`) |
| `OPENAI_API_KEY` | clé OpenAI |
| `FAL_KEY` | clé Fal.ai |
| `NEXT_PUBLIC_APP_URL` | URL Render finale (ex. `https://mymanga-web.onrender.com`) |
| `PIPELINE_V3_PREMIUM_ONLY` | `true` |

**Optionnelles (selon features activées) :**

| Variable | Quand |
|---|---|
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | si paiement |
| `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` | si jobs Inngest distants |
| `VISUAL_PANEL_QA_VISION`, `ENABLE_PREMIUM_VISION_QA`, `PREMIUM_VISUAL_QA_REQUIRED` | tuning vision QA |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | rate-limit prod |
| `ENABLE_IMAGE_MOCKS` | **jamais en prod** (mock images, dev only) |

⚠️ **Ne PAS définir `AUTH_DISABLED`** en production.

### 3. Checklist déploiement

1. Variables critiques renseignées dans Render.
2. `DIRECT_URL` distinct de `DATABASE_URL` (port 5432 vs 6543).
3. `NEXT_PUBLIC_APP_URL` = ton domaine Render.
4. `AUTH_DISABLED` non défini.
5. Bucket de storage privé créé côté Supabase.
6. Le build passe (`prisma migrate deploy` inclus dans le `buildCommand`).
7. Vérifier `GET /api/diagnostics/public` → `hasFalKey=true`, `hasOpenAI=true`, `authDisabled=false`.
8. Lancer un chapitre test de bout en bout via le studio conversationnel.

---

## Tests et qualité

### Métriques

- **~2 100 tests** via `pnpm -r test` sur l'ensemble des packages
- **13 packages** dans le monorepo
- **Tests de contrat** dans `tests/contracts/`
- **E2E Playwright** : `apps/web/tests/e2e/*.spec.ts`

### Run

```bash
# Tout
pnpm test

# Un package
pnpm --filter @manga-ai-studio/core test
pnpm --filter @manga-ai-studio/web test

# Un fichier
pnpm --filter @manga-ai-studio/web exec vitest run tests/chapter-estimate-route.test.ts

# E2E
pnpm --filter @manga-ai-studio/web test:e2e
```

---

## Runbooks

| Runbook | Quand l'utiliser |
|---|---|
| [Database migrations](docs/runbooks/database-migrations.md) | Erreurs Prisma `P1001`, configuration pooler Supabase |
| [Image URLs invariants](docs/architecture/image-urls.md) | Bug d'affichage image, debug Supabase signed URLs |
| [Canonical packet migration](docs/architecture/canonical-packet-migration.md) | Comprendre la convergence des contrats |

### Diagnostic rapide

```bash
# Status pipeline / clés
curl https://your-app.onrender.com/api/diagnostics/public
```

### Codes 4xx / 5xx fréquents

| Code | Action |
|---|---|
| `INTENT_CONTRACT_REQUIRED` | Compiler l'intention (studio conversationnel) |
| `INTENT_CONFIDENCE_TOO_LOW` | Répondre à plus de questions de l'IA |
| `VISUAL_WORLD_CONTRACT_FAILED` | Vérifier décors / entités |
| `INCOMPLETE_PLAN` | Régénérer le plan |
| `CAST_CONTRACT_INVALID` | Vérifier le héros / cast du chapitre |
| `premium_v3_render_failed` | Le rendu v3 a échoué — vérifier FAL_KEY + logs Render |

---

## Licence et contact

Projet propriétaire — tous droits réservés.

**Repo** : [github.com/Putsch13/mymanga](https://github.com/Putsch13/mymanga)
**Stack** : Next.js · TypeScript · Prisma · OpenAI · Fal.ai · Supabase · Render
