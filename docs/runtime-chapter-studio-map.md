# Runtime Chapter Studio Map

## Parcours reel branche

- Creation projet : `apps/web/app/(app)/projects/new/page.tsx` → `apps/web/app/api/projects/route.ts`
- Hub projet : `apps/web/app/(app)/projects/[id]/page.tsx`
- Liste chapitres : `apps/web/app/(app)/projects/[id]/chapters/page.tsx`
- Studio chapitre :
  - `apps/web/app/(app)/projects/[id]/chapters/new/page.tsx`
  - `apps/web/app/(app)/projects/[id]/chapters/[chapterId]/edit/page.tsx`
  - `apps/web/app/(app)/projects/[id]/chapters/[chapterId]/generate/page.tsx`
  - `apps/web/app/(app)/projects/[id]/chapters/[chapterId]/review/page.tsx`
  - `apps/web/app/(app)/projects/[id]/chapters/[chapterId]/read/page.tsx`
- Pipeline projet : `apps/web/app/(app)/projects/[id]/pipeline/page.tsx`
- Style visuel : `apps/web/app/(app)/projects/[id]/style/page.tsx`
- Redirect legacy : `/projects/[id]/generate` → `/projects/[id]/pipeline` (301)
- Redirect legacy : `/projects/[id]/studio` → dernier chapitre `/edit`

## APIs runtime utilisees

- Creation et listing chapitres : `apps/web/app/api/projects/[id]/chapters/route.ts`
- Estimate narrative + outlines : `apps/web/app/api/projects/[id]/chapters/estimate/route.ts`
- Studio chapitre : `apps/web/app/api/projects/[id]/chapters/[chapterId]/studio/route.ts`
- Autofill IA : `apps/web/app/api/projects/[id]/chapters/[chapterId]/autofill/route.ts`
- Readiness gate : `apps/web/app/api/projects/[id]/chapters/[chapterId]/readiness/route.ts`
- Launch generation : `apps/web/app/api/projects/[id]/chapters/[chapterId]/launch/route.ts`
- Pipeline projet : `apps/web/app/api/projects/[id]/pipeline/route.ts`
- NPC resolve : `apps/web/app/api/projects/[id]/npc-resolve/route.ts`
- QA report : `apps/web/app/api/projects/[id]/chapters/[chapterId]/qa-report/route.ts`
- Complete review : `apps/web/app/api/projects/[id]/chapters/[chapterId]/review/complete/route.ts`
- Approved outline bridge : `apps/web/app/api/projects/[id]/chapters/[chapterId]/approved-outline/route.ts`
- Reader payload : `apps/web/app/api/projects/[id]/chapters/[chapterId]/route.ts`
- Retry panel : `apps/web/app/api/scene-images/[sceneImageId]/retry/route.ts`
- TTS : `apps/web/app/api/tts/route.ts`

## Packages impliques

- `packages/core` : types studio, canon, readiness, QA, adapters, approved outline
- `packages/ai` : prompt composer, lock policy FAL, genre director, story spine, story quality gate, NPC descriptor builder
- `packages/workflow` : pipeline de generation complet
- `packages/continuity` : continuite et canon persistants
- `packages/memory` : contexte projet et memoire chapitre
- `packages/world` : blueprint scene, ontologies NPC/creatures, NPC resolver
- `packages/db` : schema Prisma, jobs, images, assets
- `packages/billing` : Stripe, wallet, ledger

## Studio 4 etapes

Le studio `/edit` est le tunnel par defaut :

1. **Brief** : pitch, conflit, mode expert/simple
2. **Casting & Canon** : heros, antagonistes, decor, PNJ libres
3. **Plan du chapitre** : contrat narratif, outlines, plan de production
4. **Generation & Review** : pipeline, suivi, QA, rerolls

### Mode simple vs expert
- Chapitre 1 : mode simple par defaut (masque les reglages avances)
- Chapitres suivants : mode expert par defaut
- Toggle disponible dans le header du studio

### Readiness live
- Le rapport de readiness est recalcule en temps reel depuis le draft local
- Les blocants disparaissent instantanement quand l'utilisateur remplit les champs
- Le contrat narratif est cree automatiquement si absent

### Selecteur de chapitre
- Dropdown dans le header pour naviguer entre chapitres
- Conserve le sous-chemin actuel (/edit, /read, /generate)

## Source de verite runtime

- `chapter.outline.studio` reste la source de verite studio-first
- Le pipeline choisit sa source outline en priorite depuis le studio (`productionOutline` → bridge legacy)
- Les compteurs images passent par `aggregateChapterImageCounts()`
- Tant que `acceptedImages < minimumImages`, le runtime reste non terminal

## Genre Director

16 modes disponibles : shonen_combat, seinen_tension, romance_shojo, thriller_horror, quiet_aftermath, isekai_adventure, mecha_tactical, sport_rivalry, medical_drama, mystery_detective, slice_of_life, supernatural, historical_epic, dark_fantasy_gore, josei_adult, comedy_parody

Chaque mode configure : beatRhythm, turnTypes, silenceDensity, actionDialogueRatio, cliffhangerStyle, panelDensity, emotionalIntensityDefault.
