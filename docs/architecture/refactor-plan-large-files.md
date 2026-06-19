# Plan de refactor — gros fichiers critiques (P3.2)

Statut : _plan_ — à exécuter sprint par sprint, pas en un seul PR.

Contexte : certains fichiers dépassent 1000 lignes et concentrent trop de
responsabilités, ce qui rend le diff review et les tests difficiles.
L'objectif de ce doc est d'avoir un plan d'extraction **ciblé, réversible
et testable** pour chaque fichier.

## 1. `packages/workflow/src/passes/image-generation-pass.ts` — 1924 lignes

### Responsabilités actuelles

1. orchestration du pass par panel (boucle principale)
2. `generateAttempt` (appel runtime routé)
3. preflight / post-generation validation
4. reroll policy (jusqu'à N tentatives par stratégie)
5. reinforcement pass (character lock)
6. scoring + choix du "bestAttempt"
7. persistance FAL trace + SceneImage metadata
8. reconciliation `canonicalPacket.providerPayload`
9. coverage report + debug summary

### Plan d'extraction (par sprint)

- **Sprint A — Panel attempt engine** : extraire `generateAttempt` +
  `evaluateAttemptScore` + `runPanelQualityGate` dans
  `./image-generation/panel-attempt.ts`. Interface stable :
  `runPanelAttempt(input) → { generation, validation, score, promptDebug }`.
- **Sprint B — Reroll engine** : extraire les branches reroll
  (environment/fidelity/interaction/style/composition) dans
  `./image-generation/reroll-engine.ts`. Consomme le
  `panel-attempt` ci-dessus.
- **Sprint C — Packet reconcile** : la logique P0.2 de mise à jour du packet
  après runtime est déjà isolée visuellement (bloc commenté "P0.2") →
  l'extraire dans `./image-generation/reconcile-canonical-packet.ts`.
- **Sprint D — Persistence** : déjà partiellement dans `fal-trace.ts`, finir
  d'y absorber la mise à jour de `SceneImage.metadata`.

Objectif cible : `image-generation-pass.ts` < 600 lignes, purement
orchestration.

## 2. `packages/workflow/src/passes/narrative-pass.ts` — 2243 lignes

### Responsabilités actuelles

1. Construction du plan narratif (pages, panels, dialogues)
2. Résolution des personnages / NPCs / props
3. Calcul des intents + blueprints
4. Panel contract construction
5. Continuity + state propagation

### Plan

- Extraire **panel-cast resolution** (déjà partiellement dans
  `build-panel-cast.ts`) — virer le résidu de narrative-pass.
- Extraire **panel-contract construction** dans
  `./narrative/panel-contract-builder.ts` (nouveau).
- Extraire **page/panel layout decisions** dans
  `./narrative/page-layout-decider.ts`.
- Laisser `narrative-pass.ts` comme orchestrateur pur.

## 3. `apps/web/app/api/scene-images/[sceneImageId]/retry/route.ts` — 881 lignes

### Responsabilités actuelles

- Auth + ownership + age gate
- Lecture + validation Zod du body
- Résolution refs / LoRAs / packet base / overrides
- Calcul du prompt final (packet-aware ou legacy)
- Garde linguistique (P1.1)
- Appel provider
- QA + drift
- Persistence

### Plan

- Extraire **refs/loras resolution** dans `@/lib/retry/resolve-refs-loras.ts`.
- Extraire **runtime routing + call** dans
  `@/lib/retry/run-retry-generation.ts`.
- Extraire **QA + drift + persistence** dans un helper
  `@/lib/retry/evaluate-and-persist.ts`.
- Laisser la route comme pure glue auth/validation/dispatch (~200 lignes).

## 4. `apps/web/components/studio/chapter-studio-editor.tsx` — 603 lignes

### Plan

- Split en sous-composants par panneau logique : outline editor, character
  tray, launch panel, events feed.
- Remonter la gestion d'état dans un `use-chapter-studio-editor.ts` hook
  dédié.

## 5. `apps/web/components/manga/manga-book-reader.tsx` — 1129 lignes

### Plan

- Séparer la logique de pagination (`use-reader-pagination.ts`), du rendering
  de planche (`reader-page.tsx`), du rendering de panel (`reader-panel.tsx`).
- Isoler les gestionnaires de TTS / sons / preload dans un hook dédié.

## Ordre de priorité recommandé

1. **Retry route** (smallest, highest security surface — en premier)
2. **image-generation-pass** (le plus critique pour l'audit)
3. **narrative-pass**
4. **manga-book-reader** (UX mais pas bloquant runtime)
5. **chapter-studio-editor**

## Garde-fous généraux

- Pas de "grand PR" qui refactor tout d'un coup. Chaque extraction = 1 PR
  indépendant avec tests de non-régression.
- Les signatures publiques exportées (ex: `runImageGenerationPass`) ne
  doivent pas bouger. Les extractions sont purement internes.
- À chaque extraction : ajouter un test unit sur le nouveau module extrait.
