# Continuity Persistence Kernel

## Ce qui a été ajouté

- noyau de continuité central dans `packages/continuity/src/continuity-persistence-kernel.ts`
- types canoniques enrichis pour `StoryBible`, `WorldState`, `CharacterState`, `LocationState`, `RelationshipGraph`, `EventLedger`, `ArcRegistry`, `ChapterSnapshot`, `SceneSnapshot`
- validation pré-sortie des scènes contre le canon persistant
- append-only ledger via `ContinuityEvent` + `CanonTimelineEvent`
- matérialisation d'un snapshot chapitre enrichi dans `MemorySnapshot.structuredState`

## Effets dans le pipeline

- le pipeline charge maintenant un kernel de continuité avant génération
- `SceneBlueprint` reçoit des anchors et contraintes issus du canon persistant
- chaque scène validée écrit ses événements, met à jour le kernel en mémoire, puis alimente le snapshot chapitre
- un chapitre avec incohérences de continuité remonte en `partial_success` au lieu d'être considéré comme premium clean

## QA

- tests unitaires ajoutés dans `packages/continuity/src/continuity-persistence-kernel.test.ts`
- build web validé après branchement complet
