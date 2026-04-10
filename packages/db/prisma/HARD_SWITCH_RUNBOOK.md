# Hard Switch Runbook

## Objectif
Passer au schéma `hard switch` avec :
- migration SQL reviewable
- garanties DB fortes sur les invariants critiques
- backfill observable, idempotent, filtrable et réparable
- zéro mutation implicite

## Artefacts
- migration reviewable : `packages/db/prisma/migrations/20260410_091500_hard_switch_fal_scene_first/migration.sql`
- backfill : `packages/db/prisma/backfill-hard-switch.ts`
- checks read-only : `packages/db/prisma/manual-checks/hard-switch-pre-post-checks.sql`

## Statut
- migration préparée, non appliquée
- backfill préparé, non exécuté
- aucun `dry-run` lancé
- aucune mutation DB effectuée

## Diff DB couvert

### Enums
- `MediaAssetType`
- `MediaAssetOrigin`
- `FalMode`
- `FalTraceStatus`
- `NpcImportanceLevel`
- `NpcPromotionStatus`

### Tables créées
- `MediaAsset`
- `CharacterVisualLock`
- `NpcVisualProfile`
- `SceneKeyframe`
- `FalTrace`

### Colonnes ajoutées
- `CharacterVisualRef.mediaAssetId`
- `CharacterVisualRef.sourceVisualLockId`
- `LoraModel.weightsAssetId`
- `LoraModel.configAssetId`
- `SceneImage.mediaAssetId`
- `SceneImage.sceneKeyframeId`

### Index, uniques et partial uniques
- `MediaAsset(projectId, type)` index
- `MediaAsset(projectId, type, ownerType, ownerId)` index
- `MediaAsset(chapterId)` index
- `MediaAsset(sceneId)` index
- `MediaAsset(characterId)` index
- `MediaAsset(projectId, sha256)` unique
- `CharacterVisualLock(projectId, characterId, isActive)` index
- `CharacterVisualLock(characterId, version)` unique
- `CharacterVisualLock(characterId) WHERE isActive = true` unique partiel
- `NpcVisualProfile(stableNpcId)` unique
- `NpcVisualProfile(projectId, importanceLevel)` index
- `NpcVisualProfile(sceneId)` index
- `NpcVisualProfile(locationId)` index
- `NpcVisualProfile(characterId)` index
- `SceneKeyframe(projectId, chapterId, sceneId, selected)` index
- `SceneKeyframe(sceneId, version)` unique
- `SceneKeyframe(sceneId) WHERE selected = true` unique partiel
- `FalTrace(projectId, chapterId, sceneId)` index
- `FalTrace(panelId)` index
- `FalTrace(sceneKeyframeId)` index
- `FalTrace(characterId)` index
- `FalTrace(status, createdAt)` index

## Règles métier durcies

### CharacterVisualLock
- un seul lock actif par personnage
- la contrainte est garantie en SQL via un unique partiel
- Prisma ne l’exprime pas nativement, la source de vérité est la migration SQL

### SceneKeyframe
- une seule keyframe `selected = true` par scène
- la contrainte est garantie en SQL via un unique partiel
- Prisma ne l’exprime pas nativement, la source de vérité est la migration SQL

### MediaAsset matching
- garde principal du backfill : `projectId + type + ownerType + ownerId`
- `sha256` reste utile pour la déduplication binaire quand disponible
- si `sha256` est absent, `ownerType/ownerId` restent la convention structurante du backfill
- en cas de doublon de matching, le script garde le plus ancien et émet un warning

### SceneKeyframe source de vérité
- `imageAssetId` = source de vérité principale
- `imageUrl` = fallback legacy / compat / debug
- `imageUrl` est toléré si aucun `MediaAsset` n’existe encore
- pour les nouveaux flux premium, `imageAssetId` doit devenir la référence attendue

## Nature des changements

### Non destructifs
- création de tables
- création d’enums
- ajout de colonnes nullable
- ajout d’index
- ajout de foreign keys
- ajout d’uniques et partial uniques

### Destructifs
- aucun

### Backfilled plus tard
- `CharacterVisualRef.mediaAssetId`
- `CharacterVisualRef.sourceVisualLockId`
- `SceneImage.sceneKeyframeId`
- contenu initial des tables `MediaAsset`, `CharacterVisualLock`, `SceneKeyframe`, `FalTrace`

## Backfill

### État local
- fichier d’état par défaut : `packages/db/prisma/.backfill-hard-switch.state.json`
- chemin calculé depuis le répertoire du script, pas depuis le `cwd`
- override possible avec `--state-file=<path>`

### Garde-fous
- `--dry-run` : aucune écriture DB
- `--limit=<n>` : borne la progression par phase
- `--only-project=<id>` : réduit le blast radius
- `--resume` : reprend à partir du state file
- résumé JSON final
- post-checks automatiques calculés à la fin

### Phases

#### `media-assets`
- lit : `CharacterVisualRef` sans `mediaAssetId`
- matche : `projectId + type + ownerType + ownerId`
- crée : un `MediaAsset` si aucun match
- update : `CharacterVisualRef.mediaAssetId`
- skip : ref déjà liée correctement
- ambiguïtés : plusieurs assets candidats, warning puis choix du plus ancien
- invariant : toute ref ciblée pointe vers un `MediaAsset`

#### `character-locks`
- lit : `Character` avec refs, sans lock actif
- stratégie de version : `MAX(version) + 1`
- crée : une nouvelle version active
- update : aucun
- skip : lock actif déjà présent ou aucune ref
- ambiguïtés : plusieurs refs, on choisit la plus récente
- invariant : tout personnage ciblé avec refs possède un lock actif sans collision de version

#### `scene-keyframes`
- lit : scènes sans keyframe ou scènes avec panels orphelins
- crée : une keyframe si aucune n’existe
- update : rattache tous les panels `sceneKeyframeId IS NULL`
- transaction : création/rattachement atomiques quand la keyframe doit être créée
- réparation : si une keyframe existe déjà mais que des panels sont orphelins, le second passage les rattache sans recréer de keyframe
- invariant : une scène ciblée a une keyframe et ses panels ne restent pas orphelins

#### `fal-traces`
- lit : `SceneImage` completed sans trace
- crée : une `FalTrace`
- update : aucun
- skip : trace déjà présente
- ambiguïtés : `generationLog` absent, payload réponse vide
- invariant : tout panel completed ciblé possède au moins une trace

## Checks read-only recommandés
- refs sans `mediaAssetId`
- personnages avec refs mais sans lock actif
- scènes sans keyframe
- panels orphelins alors que la scène a déjà une keyframe
- panels completed sans trace
- doublons de matching `MediaAsset`
- personnages avec plusieurs locks actifs
- scènes avec plusieurs keyframes sélectionnées
- doublons `(characterId, version)`
- doublons `(sceneId, version)`
- point d'entrée recommandé : `pnpm --filter @manga-ai-studio/db checks:hard-switch`

## Ordre d’exécution futur recommandé
1. `pnpm --filter @manga-ai-studio/db migrate:status`
2. validation humaine du SQL reviewable
3. exécution de la migration reviewable
4. `dry-run` borné avec `--only-project` et `--limit`
5. lecture des checks et du résumé JSON
6. backup/checkpoint
7. backfill réel progressif
8. reprise via `--resume` si interruption
9. post-checks finaux
10. feu vert pour exploitation UI premium

## Commandes futures prêtes à l’emploi
```bash
pnpm --filter @manga-ai-studio/db migrate:status

pnpm --filter @manga-ai-studio/db checks:legacy

pnpm --filter @manga-ai-studio/db migrate:deploy

pnpm --filter @manga-ai-studio/db backfill:hard-switch --dry-run --only-project=<id> --limit=<n>

pnpm --filter @manga-ai-studio/db checks:hard-switch

pnpm --filter @manga-ai-studio/db backfill:hard-switch --only-project=<id> --limit=<n>

pnpm --filter @manga-ai-studio/db backfill:hard-switch --resume --only-project=<id> --limit=<n>
```

## Mitigation / rollback
- si la migration est appliquée mais le backfill non lancé : l’application reste en mode schéma étendu, données legacy encore lisibles
- si le backfill réel est interrompu :
- ne pas réappliquer la migration
- relancer le backfill avec les mêmes `--only-project`, `--limit` et `--state-file`
- si un dry-run révèle un matching ambigu inattendu :
- corriger d’abord la convention ou les données de matching
- ne pas lancer le backfill réel avant résolution
