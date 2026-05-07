# Manga AI Studio

> **Studio éditorial premium pour générer des chapitres de manga / webtoon de bout en bout, depuis l'intention de l'auteur jusqu'à des images cohérentes panel par panel.**

Manga AI Studio n'est pas un "générateur d'images". C'est un **pipeline éditorial** qui transforme une intention narrative en **contrats vérifiables successifs**, chacun gardé par une QA structurelle (cast, monde visuel, dialogue, plan de production), et n'autorise le rendu image qu'une fois tous les contrats validés. **Fail-closed by design.**

---

## Sommaire

1. [Pitch produit](#pitch-produit)
2. [Comment ça marche — vue d'ensemble](#comment-ça-marche--vue-densemble)
3. [Pipeline IA détaillé](#pipeline-ia-détaillé)
4. [Coût d'un chapitre (tarifs réels 2026)](#coût-dun-chapitre-tarifs-réels-2026)
5. [Architecture technique](#architecture-technique)
6. [Contrats clés (fail-closed)](#contrats-clés-fail-closed)
7. [Setup développeur](#setup-développeur)
8. [Variables d'environnement](#variables-denvironnement)
9. [Déploiement Render + Supabase](#déploiement-render--supabase)
10. [Tests et qualité](#tests-et-qualité)
11. [Runbooks](#runbooks)

---

## Pitch produit

### Ce que ça résout

L'IA générative produit des images magnifiques mais incohérentes : un personnage change de tête entre deux cases, un décor disparaît, un dialogue est attribué à quelqu'un qui n'est pas dans le panel. Pour un manga de 10 pages (≈ 70 panels), cette incohérence rend l'output inutilisable.

**Manga AI Studio impose des contrats narratifs et visuels en amont** : si le système ne sait pas qui parle, où, avec quel canon, il bloque la génération. Pas de "à peu près".

### Pour qui

| Profil | Cas d'usage |
|---|---|
| **Auteur indépendant** | Prototyper un chapitre en 10 minutes au lieu de 2 semaines |
| **Studio éditorial** | Itérer sur le pitch, le casting et le découpage avant rendu |
| **Webtoon / scanlation** | Générer des chapitres réguliers avec un univers cohérent |
| **Plateforme IA** | Brique "studio premium" intégrable sur sa propre stack |

### Ce qu'on garantit

- **Cast cohérent** : le héros, les héros secondaires et les NPC groups sont nommés, ancrés, reconnus par le LLM dialoguiste.
- **Canon visuel** : chaque personnage a un `CharacterCanonPack` avec score de complétude (0-100%). Score < 70% → warning en studio.
- **Dialogue ancré** : chaque réplique a un speaker visible dans le panel (interdit "dialogue flottant").
- **Plan canonique unique** : 70 à 75 panels (cible 72), validés via QA structure (cutaway ratio, actor-driven, monotonie).
- **Anti-régression** : 1100+ tests automatisés.

---

## Comment ça marche — vue d'ensemble

### Le parcours utilisateur

```mermaid
flowchart LR
    A[Créer projet] --> B[Définir personnages<br/>+ canon visuel]
    B --> C[Construire univers<br/>NPC groups + props]
    C --> D[Studio chapitre<br/>4 étapes wizard]
    D --> E[Estimate<br/>preview readiness]
    E --> F{Score ≥ seuil?}
    F -->|Non| G[Repair actions<br/>Analyser histoire, etc.]
    G --> D
    F -->|Oui| H[Launch génération]
    H --> I[Job Inngest<br/>pipeline v3]
    I --> J[Reader / Review<br/>Reroll si besoin]
```

### Les 4 étapes du studio chapitre

1. **Brief** — pitch chapitre, summary, cliffhanger ciblé
2. **Casting & Canon** — sélection du héros, héros secondaires, lieux, refs
3. **Plan** — outline approuvé → production plan (canonique 70-75 panels)
4. **Generation & Review** — preview readiness, launch, suivi job, QA, rerolls

À chaque étape, un **PremiumReadinessDashboard** affiche les blocants (rouges) et avertissements (jaunes), avec des **boutons "auto-repair"** (ex. "Analyser l'histoire" pour générer le `ChapterIntentContract`).

### Le principe fail-closed

```mermaid
flowchart TD
    UI[Studio UI] --> EST[POST /chapters/estimate]
    EST --> PLAN[CanonicalProductionPlan]
    PLAN --> QA1[QA structure]
    QA1 -->|fail| BLOCK1[Studio bloqué<br/>+ raison explicite]
    QA1 -->|pass| READY[Readiness 'ready']
    READY --> LAUNCH[POST /chapters/launch]
    LAUNCH --> CHECK[Preflights:<br/>intent contract,<br/>continuity,<br/>cast,<br/>canon packs]
    CHECK -->|fail| BLOCK2[HTTP 422<br/>+ code stable<br/>INTENT_CONTRACT_REQUIRED, etc.]
    CHECK -->|pass| JOB[Job créé<br/>Inngest enfile]
    JOB --> PIPELINE[Pipeline v3]
```

Aucun chapitre ne peut atteindre la phase **render Fal** sans avoir passé tous les contrats. C'est lent à configurer la première fois, mais ça garantit qu'un chapitre lancé est un chapitre cohérent.

---

## Pipeline IA détaillé

### Vue macro : 4 cerveaux IA + N validateurs

```mermaid
flowchart TB
    subgraph "Phase 1: Compréhension"
      INPUT[Pitch utilisateur] --> IC[IA-Intent Compiler<br/>gpt-4o-mini]
      IC --> CIC[ChapterIntentContract<br/>+ confidence score]
      INPUT --> WE[IA-World Extractor<br/>gpt-4o-mini]
      WE --> NPC[NpcGroups + WorldProps<br/>persistés DB USER-WINS]
    end

    subgraph "Phase 2: Architecture narrative"
      CIC --> SA[IA1: Story Architect<br/>gpt-4o-mini]
      SA --> ARC[StoryArc:<br/>6-10 beats ordonnés<br/>+ cliffhanger]
    end

    subgraph "Phase 3: Découpage éditorial"
      ARC --> CR[Canon Resolver<br/>déterministe]
      CR --> VW[IA-Visual World<br/>Composer<br/>gpt-4o-mini]
      VW --> CCP[Plan canonique<br/>70-75 panels<br/>+ blueprints]
      CCP --> ME[IA2: Manga Editor<br/>gpt-4o-mini<br/>(si plan IA)]
      ME --> SP[StoryboardPlan]
      CCP --> SPDET[Storyboard déterministe<br/>(si plan approuvé)]
      SPDET --> SP
    end

    subgraph "Phase 4: Dialogue + QA"
      SP --> DSW[IA-Dialogue Scene<br/>Writer<br/>gpt-4o-mini<br/>1 appel par beat]
      DSW --> DC[DialogueContract<br/>speakers ancrés]
      DC --> QAALL[QA: beat coverage,<br/>props fantômes,<br/>arc émotionnel,<br/>interactions]
    end

    subgraph "Phase 5: Rendu image"
      QAALL --> RSB[RenderSpec Builder<br/>+ minimal prompt FR→EN]
      RSB --> ROUTE[FAL Route v3<br/>déterministe par renderMode]
      ROUTE --> FAL[Fal.ai<br/>Flux schnell / dev / lora]
      FAL --> VQA[IA-Vision QA<br/>gpt-4o-mini<br/>optionnel]
    end
```

### Inventaire des appels LLM

Pour un chapitre premium standard (72 panels, sans reroll, sans LoRA personnalisée) :

| Étape | Service | Modèle | Appels | Tokens estimés |
|---|---|---|---|---|
| Compile intent | `compile-chapter-intent.ts` | `gpt-4o-mini` | 1 | ~800 in / ~400 out |
| Extract world entities | `extract-world-entities-from-intent.ts` | `gpt-4o-mini` | 1 | ~600 in / ~600 out |
| Story architect | `story-architect-agent-llm.ts` | `gpt-4o-mini` | 1 (si pas plan approuvé) | ~2000 in / ~1500 out |
| Visual world composer | `visual-world-composer.ts` | `gpt-4o-mini` | 1 | ~3000 in / ~2000 out |
| Manga editor (storyboard) | `manga-editor-agent-llm.ts` | `gpt-4o-mini` | 0-1 (déterministe si plan) | ~3500 in / ~2500 out |
| Dialogue scene writer | `dialogue-scene-writer.ts` | `gpt-4o-mini` | **1 appel par beat** (≈ 8 beats) | ~1500 in / ~600 out × 8 |
| Extract chapter visual contract | `extract-chapter-visual-contract.ts` | `gpt-4o-mini` | 1 | ~2000 in / ~1500 out |
| Vision QA panel (optionnel) | `panel-vision-analyzer.ts` | `gpt-4o-mini` (vision) | jusqu'à 1 par panel × 0.2 (échantillon) | ~1500 in / ~300 out |

**Total LLM moyen** : ~22 appels OpenAI / chapitre, ~38k tokens input + ~22k tokens output.

### Inventaire des appels image

| Étape | Provider | Modèle Fal | Images |
|---|---|---|---|
| Rendu panels | Fal.ai | `fal-ai/flux/dev` (par défaut), `fal-ai/flux/schnell` (panels rapides), `fal-ai/flux-lora` (personnage trained), `fal-ai/flux-realism` (scènes hyper-réalistes) | 70-75 |
| Cover (optionnel) | Fal.ai | `fal-ai/flux/dev` | 1 |
| Rerolls | idem | idem | variable (cible < 10% des panels) |

Routage déterministe via `fal-render-route-v3.ts` : `renderMode` (par ex. `dialogue_two_shot`, `establishing_environment`) → modèle Fal optimal.

---

## Coût d'un chapitre (tarifs réels 2026)

### Hypothèses

- **Chapitre cible** : 72 panels (valeur médiane de `PREMIUM_PANEL_RANGE`)
- **OpenAI** : `gpt-4o-mini` partout (tarifs API 2026 : **$0.15 / 1M tokens input**, **$0.60 / 1M tokens output**)
- **Fal.ai** : mix réaliste 60% `flux/dev` (~$0.025/MP, image 1MP) + 30% `flux/schnell` (~$0.003/MP) + 10% `flux-lora` ou `flux-realism` (~$0.035/MP)
- **Pas de reroll** dans le calcul de base (10% de rerolls ajoutent ~10% de coût image)
- **Vision QA** activée à 20% (1 panel sur 5 audité)

### Détail par étape

| Phase | Action | Tokens / Images | Tarif unit. | Coût ($) |
|---|---|---|---|---|
| **Texte** | Compile intent (gpt-4o-mini) | 800 in + 400 out | $0.15/1M + $0.60/1M | $0.00036 |
| | Extract world entities | 600 in + 600 out | idem | $0.00045 |
| | Story architect | 2 000 in + 1 500 out | idem | $0.00120 |
| | Visual world composer | 3 000 in + 2 000 out | idem | $0.00165 |
| | Manga editor storyboard | 3 500 in + 2 500 out | idem | $0.00203 |
| | Dialogue scene writer (× 8 beats) | (1 500 in + 600 out) × 8 | idem | $0.00468 |
| | Extract chapter visual contract | 2 000 in + 1 500 out | idem | $0.00120 |
| | Vision QA (15 panels échantillonnés) | (1 500 in + 300 out) × 15 | idem | $0.00608 |
| **Texte total** | | ~38k in + ~22k tokens out | | **~$0.018** |
| **Image** | 43 panels `flux/dev` (60%) | 1 MP each | $0.025 | $1.075 |
| | 22 panels `flux/schnell` (30%) | 1 MP each | $0.003 | $0.066 |
| | 7 panels `flux-lora`/`realism` (10%) | 1 MP each | $0.035 | $0.245 |
| | Cover (optionnel) | 1 image `flux/dev` | $0.025 | $0.025 |
| **Image total** | 73 images | | | **~$1.41** |
| **TOTAL chapitre** | | | | **~$1.43** |

### Par scénario

| Scénario | Coût estimé | Commentaire |
|---|---|---|
| **Chapitre rapide (100% schnell)** | ~$0.24 | Mode prototype / draft |
| **Chapitre standard (mix)** | **~$1.43** | Configuration par défaut |
| **Chapitre premium (100% flux/dev + vision QA full)** | ~$2.20 | Qualité maximale |
| **+ rerolls fréquents (30% panels)** | +$0.40 | À surveiller via observabilité |
| **+ LoRA personnage entraînée** | +$2-5 (one-shot) | Coût d'entraînement amorti sur tout un manga |

### À retenir

- **Le coût texte est négligeable** (~1% du total). C'est le rendu image qui fait 99% de la facture.
- **Optimisation clé** : router plus de panels vers `flux/schnell` (cutaways, inserts d'objets) et réserver `flux/dev` aux panels narratifs critiques (héros closeup, action). Le routeur le fait déjà via `renderMode`.
- **Marge produit** : un pack utilisateur "Studio" à 25 USD pour 1500 tokens internes (≈ 50 chapitres) laisse une marge brute de ~65% au coût standard.

> **Source des tarifs** : [OpenAI Pricing](https://platform.openai.com/docs/pricing) et [Fal.ai Pricing](https://fal.ai/pricing) (avril 2026). Mis à jour automatiquement à chaque revue de coût ; voir `packages/billing/src/pricing.ts` pour la source de vérité interne.

---

## Architecture technique

### Stack

| Couche | Technologie |
|---|---|
| **Frontend** | Next.js 15 (App Router) · React 19 · Tailwind v4 · shadcn/ui |
| **Backend** | Route handlers Next.js · packages TypeScript · Inngest pour les jobs longs |
| **Database** | PostgreSQL (Supabase) · Prisma 6 · pgvector pour embeddings |
| **Auth + Storage** | Supabase (cookies SSR) · Bucket privé pour les images générées |
| **LLM** | OpenAI (`gpt-4o-mini` partout, `gpt-4o` en option pour passes critiques) |
| **Image** | Fal.ai (Flux schnell / dev / lora / realism) |
| **Paiement** | Stripe (wallet en tokens internes) |
| **Hosting** | Render.com (build + migrations Prisma auto) |

### Monorepo

```
MYMANGA/
├── apps/
│   └── web/                 # Next.js (UI + API routes)
├── packages/
│   ├── ai/                  # Services LLM, agents, prompt builders, Fal adapter
│   ├── core/                # Types Zod, contrats, règles produit (PRODUCTION_RULES)
│   ├── workflow/            # Orchestration pipeline, passes, jobs Inngest
│   ├── db/                  # Prisma + migrations
│   ├── billing/             # Tarification, wallet, Stripe
│   ├── memory/              # Embeddings, snapshots mémoire
│   ├── continuity/          # Diff narratif inter-chapitre
│   ├── world/               # Univers (lieux, NPC ontologies)
│   ├── moderation/          # Garde-fous contenu
│   ├── visual-consistency/  # Cohérence visuelle cross-chapitre
│   ├── exports/             # Export PDF/CBZ
│   ├── ui/                  # Composants partagés
│   └── config/              # Schémas env partagés
├── tests/contracts/         # Tests de contrat cross-package
├── docs/                    # Architecture + runbooks
└── render.yaml              # Blueprint déploiement Render
```

### Le cerveau : 3 fichiers à connaître

```mermaid
flowchart TB
    JOB[Job Inngest<br/>chapter-pipeline] --> RUNNER[run-full-chapter-pipeline.ts<br/><i>orchestrateur mince</i>]
    RUNNER --> PREMIUM[run-premium-v3-pipeline.ts<br/><i>cerveau premium strict</i>]
    RUNNER -.->|fallback| LEGACY[run-legacy-compatible-chapter-pipeline.ts<br/><i>compatibilité historique</i>]
    PREMIUM --> P1[story-pass]
    PREMIUM --> P2[storyboard-pass]
    PREMIUM --> P3[render-pass]
    PREMIUM --> P4[QA passes]
```

- `packages/workflow/src/run-full-chapter-pipeline.ts` — point d'entrée unique, route vers premium ou legacy
- `packages/workflow/src/run-premium-v3-pipeline.ts` — pipeline strict, fail-closed sur tous les contrats
- `packages/workflow/src/legacy/run-legacy-compatible-chapter-pipeline.ts` — pont legacy (sera supprimé)

### Flux de données simplifié

```mermaid
sequenceDiagram
    participant U as Utilisateur
    participant UI as Next.js App
    participant API as API Route
    participant DB as PostgreSQL
    participant Q as Inngest
    participant W as Workflow
    participant AI as OpenAI
    participant F as Fal.ai
    participant S as Supabase Storage

    U->>UI: Click "Lancer génération"
    UI->>API: POST /chapters/[id]/launch
    API->>DB: Verify contracts (intent, cast, canon, plan)
    API-->>UI: 422 si blocant<br/>200 + jobId si OK
    API->>Q: Enqueue chapter-pipeline job
    Q->>W: Trigger run-full-chapter-pipeline
    W->>AI: Compile intent / story / storyboard / dialogue (× ~22)
    W->>F: Render panels (× 70-75)
    F-->>W: Image URLs
    W->>S: Persist images (private bucket)
    W->>DB: Persist SceneImages + audit metadata
    W-->>Q: Job done
    UI->>DB: Poll job status
    UI->>U: Reader avec chapitre généré
```

---

## Contrats clés (fail-closed)

Chaque contrat est un **schéma Zod strict** dans `packages/core/src/types/`. Si un contrat échoue, le pipeline s'arrête avec un code d'erreur stable (`E_CAST_*`, `E_DIALOGUE_*`, etc.).

| Contrat | Rôle | Fichier |
|---|---|---|
| `ChapterIntentContract` | Intention auteur compilée + `confidenceScore` (0-1) | `chapter-intent-contract.ts` |
| `IntentNarrativeContract` | Décompose l'intention en événements/entités vérifiables (sans LLM) | `intent/intent-narrative-contract.ts` |
| `ChapterCastContract` | Héros, héros secondaires, NPC groups validés avant pipeline | `chapter-cast-contract.ts` |
| `CharacterCanonPack` | Identité visuelle complète d'un personnage (score 0-100%) | `chapter-studio.ts` (champ `characterCanons`) |
| `VisualWorldContract` | Lieux, NPC, créatures structurés pour le chapitre | `visual-world/visual-world-contract.ts` |
| `ChapterStoryContract` | Objectif, héros, lieux requis, props autorisés/interdits | `chapter-story-contract.ts` |
| `CanonicalChapterProductionPlan` | Plan officiel 70-75 panels, source unique pour estimate + launch | `production/canonical-production-plan.ts` |
| `StoryboardPlan` | Pages, panels, layouts, renderMode | `packages/ai/src/contracts/storyboard-plan.ts` |
| `PanelRenderSpec` | Spec stricte de rendu d'une case (refs, locks, contraintes) | `packages/ai/src/contracts/panel-render-spec.ts` |
| `DialogueContract` | Lignes ancrées avec speakers visibles dans le panel | `dialogue-contract.ts` |
| `PanelTextContract` | Source de vérité texte par case (dialogue / narration / SFX) | `generation/panel-text-contract.ts` |

### Le pattern USER-WINS

Pour les **NPC groups** et **WorldProps** (auto-détectés depuis l'intention) :

```mermaid
flowchart LR
    A[Intent utilisateur] --> B[IA extract<br/>NPC + props]
    B --> C{Existe en DB?}
    C -->|Non| D[Créer entrée]
    C -->|Oui & userEdited=true| E[NE PAS écraser<br/>incrémenter appearanceCount]
    C -->|Oui & userEdited=false| F[Enrichir champs vides]
    G[Edit utilisateur via /world] --> H[Set userEdited=true<br/>protégé pour toujours]
```

Voir `apps/web/lib/world-entities/upsert-world-entities.ts`.

### Codes d'erreur pipeline

40+ codes stables dans `apps/web/shared/errors/generation-errors.ts` :

- `E_CAST_*` : héros manquant, rôle ambigu
- `E_RENDER_*` : spec invalide, FAL failed
- `E_PROMPT_*` : contradictions, négations
- `E_DIALOGUE_*` : speaker manquant, dialogue flottant
- `INTENT_CONTRACT_REQUIRED`, `INTENT_CONFIDENCE_TOO_LOW`, `INCOMPLETE_PLAN`, etc.

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
# Éditer .env avec tes clés (DATABASE_URL, OPENAI_API_KEY, FAL_KEY...)
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
| `pnpm test` | Tous les tests (web + core + ai + workflow + ...) |
| `pnpm --filter @manga-ai-studio/web test` | Tests app web uniquement |
| `pnpm --filter @manga-ai-studio/db exec prisma migrate dev` | Créer une migration |
| `pnpm --filter @manga-ai-studio/db exec prisma studio` | Ouvrir Prisma Studio |

### Workflow recommandé

1. **Avant de coder** : `pnpm typecheck && pnpm test` pour voir l'état du baseline
2. **En cours de feature** : `pnpm --filter <package> test -- --watch` sur le package modifié
3. **Avant commit** : `pnpm typecheck && pnpm lint && pnpm test`
4. **Avant push** : Si tu touches Prisma → vérifier que `prisma migrate deploy` passe (cf. [runbook](docs/runbooks/database-migrations.md))

---

## Variables d'environnement

### Critiques (production)

```env
# Database (Supabase pooler — voir docs/runbooks/database-migrations.md)
DATABASE_URL=postgresql://...?pgbouncer=true
DIRECT_URL=postgresql://...:5432/postgres

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
STORAGE_BUCKET=manga-assets

# Auth
NEXT_PUBLIC_APP_URL=https://your-app.com

# IA
OPENAI_API_KEY=sk-...
FAL_KEY=...

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Inngest
INNGEST_EVENT_KEY=...
INNGEST_SIGNING_KEY=signkey_...
```

### Pipeline flags

```env
PIPELINE_V3_PREMIUM_ONLY=true
PIPELINE_V3_STORYBOARD=true
PIPELINE_V3_RENDER_FAL=true
PIPELINE_V3_STORY_ARCHITECT_LLM=true
PIPELINE_V3_MANGA_EDITOR_LLM=true

# Optionnels
OPENAI_SCENE_DIALOGUE_ENRICH=1   # active enrichissement LLM dialogues
OPENAI_VISION_MODEL=gpt-4o-mini  # vision QA panels
ENABLE_PREMIUM_VISION_QA=1
MANGA_PROMPT_LANGUAGE_GUARD_STRICT=true  # 1 token FR résiduel = block
```

### Modèles LLM (override par défaut `gpt-4o-mini`)

| Variable | Service |
|---|---|
| `OPENAI_MODEL_INTENT` | `compile-chapter-intent` |
| `OPENAI_VISUAL_WORLD_MODEL` | `visual-world-composer` |
| `OPENAI_SCENE_DIALOGUE_MODEL` | `dialogue-scene-writer` |
| `OPENAI_CHAPTER_VISUAL_CONTRACT_MODEL` | `extract-chapter-visual-contract` |
| `STORY_ARCHITECT_MODEL` | `story-architect-agent-llm` |
| `OPENAI_MANGA_EDITOR_MODEL` | `manga-editor-agent-llm` |
| `OPENAI_VISION_MODEL` | `panel-vision-analyzer` |
| `OPENAI_OUTLINE_MODEL` | `chapter-outline` |
| `OPENAI_WORLD_EXTRACTION_MODEL` | `extract-world-entities-from-intent` |
| `OPENAI_EMBEDDING_MODEL` | embeddings mémoire (défaut `text-embedding-3-small`) |

### Dev local minimal

```env
AUTH_DISABLED=true
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/manga
OPENAI_API_KEY=sk-...
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=test
```

⚠️ **Ne jamais laisser `AUTH_DISABLED=true` en production.**

---

## Déploiement Render + Supabase

### 1. Supabase

1. Créer un projet Supabase
2. Récupérer l'URL pooler (Settings → Database → Connection pooling) :
   - Runtime app : port 6543, mode `transaction`, ajouter `?pgbouncer=true`
   - Migrations : port 5432, mode `session`
3. Créer un bucket de storage privé `manga-assets`

### 2. Render

```yaml
# render.yaml (déjà fourni)
services:
  - type: web
    name: manga-ai-studio
    buildCommand: |
      set -e
      npm install -g pnpm@10.33.0
      pnpm install --frozen-lockfile
      pnpm --filter @manga-ai-studio/db exec prisma generate
      pnpm --filter @manga-ai-studio/db exec prisma migrate deploy
      pnpm --filter @manga-ai-studio/web build
    startCommand: pnpm --filter @manga-ai-studio/web start
    envVars:
      - key: DATABASE_URL
        sync: false
      - key: DIRECT_URL
        sync: false
      # ... (cf. variables critiques)
```

### Checklist déploiement

1. ✅ Renseigner toutes les variables critiques dans Render
2. ✅ `DIRECT_URL` distinct de `DATABASE_URL` (cf. [runbook migrations](docs/runbooks/database-migrations.md))
3. ✅ `NEXT_PUBLIC_APP_URL` = ton domaine prod
4. ✅ `AUTH_DISABLED` non défini
5. ✅ `prisma migrate deploy` passe dans le `buildCommand` (auto-migrations)
6. ✅ Vérifier `GET /api/diagnostics/public` → `hasFalKey=true`, `hasOpenAI=true`, `authDisabled=false`
7. ✅ Lancer un chapitre test de bout en bout

---

## Tests et qualité

### Métriques

- **326+ fichiers de tests** au total (Vitest + Playwright)
- **1100+ assertions** unitaires + intégration
- **Tests de contrat cross-package** dans `tests/contracts/`
- **E2E Playwright** sur les flux studio critiques (`apps/web/tests/e2e/`)

### Catégories

| Type | Localisation | Couverture |
|---|---|---|
| Unitaires | `**/*.test.ts` dans chaque package | Logique pure (helpers, builders, validators) |
| Routes API | `apps/web/tests/*-route.test.ts` | Mock Prisma + vérification responses |
| Contrats | `tests/contracts/*.test.ts` | Sync entre packages (panel text, character role, etc.) |
| E2E | `apps/web/tests/e2e/*.spec.ts` | Flux studio complets (Playwright) |
| Migrations | `apps/web/tests/migration-*.test.ts` | Verrouillage des contraintes Prisma critiques |

### Run

```bash
# Tout
pnpm test

# Un package
pnpm --filter @manga-ai-studio/core test
pnpm --filter @manga-ai-studio/web test

# Un fichier spécifique
pnpm --filter @manga-ai-studio/web exec vitest run tests/chapter-estimate-route.test.ts

# E2E
pnpm --filter @manga-ai-studio/web test:e2e
```

---

## Runbooks

| Runbook | Quand l'utiliser |
|---|---|
| [Database migrations](docs/runbooks/database-migrations.md) | Erreurs Prisma `P1001`, configuration pooler Supabase, migration manuelle |
| [Image URLs invariants](docs/architecture/image-urls.md) | Bug d'affichage image, debug Supabase signed URLs |
| [Canonical packet migration](docs/architecture/canonical-packet-migration.md) | Comprendre la convergence legacy → premium |
| [Refactor large files](docs/architecture/refactor-plan-large-files.md) | Plan de découpage des monolithes restants |

### Diagnostic rapide

```bash
# Status pipeline
curl https://your-app.com/api/diagnostics/public

# Audit bundle d'un job
ls exports/audit-bundle-<jobId>.zip   # 12 fichiers JSON pour debug post-mortem

# Logs structurés (chercher event:'launch_blocked')
# Render → Logs → filter
```

### Codes 4xx / 5xx fréquents

| Code | Signification | Action |
|---|---|---|
| `INTENT_CONTRACT_REQUIRED` | Pitch non compilé | Cliquer "Analyser l'histoire" |
| `INTENT_CONFIDENCE_TOO_LOW` | Pitch trop vague | Ajouter personnages/lieux/objectif |
| `INCOMPLETE_PLAN` | < 70 panels dans le plan | Régénérer le plan (bouton studio) |
| `SHOT_PLAN_UNRELIABLE` | Trop de hero closeups / pas assez de variété | Ajuster les preferences pipeline |
| `Unresolved character ref` | NPC group inconnu | Vérifier la page `/projects/[id]/world` |
| `INTENT_RAW_TOO_SHORT` | Pitch < 20 caractères | Étoffer l'intention |

---

## Licence et contact

Projet propriétaire — tous droits réservés.

**Repo** : [github.com/Putsch13/mymanga](https://github.com/Putsch13/mymanga)
**Stack** : Next.js · TypeScript · Prisma · OpenAI · Fal.ai · Supabase · Render
