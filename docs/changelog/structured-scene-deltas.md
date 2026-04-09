# Structured Scene Deltas

## Ajouté

- nouveau contrat partagé `SceneContinuityPayload` dans `packages/core`
- `dialogue-writer` retourne désormais :
  - `panels`
  - `continuityPayload`
- le `continuityPayload` contient :
  - `sceneEvents`
  - `characterDeltas`
  - `locationDeltas`
  - `arcDeltas`

## Pipeline

- `chapter-pipeline` remonte ce payload dans `script.scenes[*]`
- les `timelineEvents` mémoire sont désormais construits en priorité depuis ces événements structurés
- `run-full-chapter-pipeline` persiste aussi le payload dans `ChapterScene.metadata`

## Kernel de continuité

- `buildSceneSnapshot` consomme les deltas structurés pour :
  - état émotionnel
  - inventaire
  - blessures
  - lieu
  - relations
  - progression d’arc
- `validateSceneSnapshotAgainstKernel` utilise ces deltas avant ses heuristiques texte
- `deriveSceneEvents` privilégie les `sceneEvents` structurés
- `applySceneEventsToKernel` met aussi à jour `relationshipGraph` et `arcRegistry`

## QA

- tests `ai` passants
- tests `continuity` passants
- build web validée
