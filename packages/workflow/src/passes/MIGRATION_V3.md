# Pipeline v3 — plan de migration

Ce document trace le plan de découplage `narrative-pass` ↔ `render-pass`
en 3 étages stricts : **Story Architect → Manga Editor → Panel Renderer**.

## État actuel (à la livraison du refactor)

### ✅ En place

- **Contrats v3** (`packages/ai/src/contracts/`) :
  `ContinuityState`, `ChapterStyleBible`, `StoryArc`, `StoryboardPlan`,
  `PanelRenderSpec`, `FalRenderRoute`.
- **Passes v3** (`packages/workflow/src/passes/`) :
  `story-pass`, `storyboard-pass`, `render-pass`, `panel-qa-pass`,
  `page-qa-pass`.
- **Agents v3 (stubs déterministes)** :
  `story-architect-agent` (IA1), `manga-editor-agent` (IA2).
- **Services v3** :
  `chapter-visual-memory` (mémoire visuelle en RAM),
  `render-spec-builder` (StoryboardPanel → PanelRenderSpec),
  `minimal-panel-prompt-builder` (PanelRenderSpec → prompt court EN-only),
  `fal-render-route-v3` (renderMode → FalRenderRoute, pas d'heuristique).
- **Validators** : `storyboard-validator`, `render-spec-validator`.
- **Persistence** :
  `story-persistence` (→ `outline.storyArcV2`),
  `storyboard-persistence` (→ `outline.storyboardPlanV2`),
  `render-persistence` (→ `outline.renderResultV2`).
- **Loader DB** : `load-chapter-visual-memory` (hydrate la mémoire depuis
  `Character.visualRefs`, `Location.canonImageUrl`, `StylePack.styleRefImageUrl`).
- **Orchestrateur** (`run-full-chapter-pipeline.ts`) : en mode shadow
  quand `PIPELINE_V3_STORYBOARD=true`, la pipeline v3 tourne AVANT la
  legacy et persiste ses résultats. Le legacy fait toujours la génération
  FAL réelle pour ne rien casser.
- **Reader** (`apps/web/components/manga/reader/build-reader-pages.ts`) :
  si `outline.storyboardPlanV2` existe, le reader suit le plan v3
  directement (pas de repagination). Les panels sans image affichent
  `status="pending"` au lieu de cases blanches.
- **Deprecation markers** : `composeMangaPanelPrompt` et
  `optimizePromptForFal` sont marqués `@deprecated` pour le chemin v3.

## ⏭️ Étapes suivantes (à planifier)

### Sprint 2bis — découper `narrative-pass.ts` (2243 lignes)

**À DÉPLACER de `narrative-pass.ts` → `render-pass.ts` / helpers v3 :**
- `composedPositive` / `composedNegative` (vers `minimal-panel-prompt-builder`)
- `pendingImageWrites` (vers la persistence v3)
- tout `baseMetadata` orienté rendu FAL
- routing FAL (vers `fal-render-route-v3`)
- `sceneImage.upsert` côté image (vers la persistence v3 une fois le
  render-pass branché sur un adapter FAL réel)
- debug trace FAL

**À GARDER dans `narrative-pass.ts` :**
- bundle narratif (scènes, beats, continuité)
- cohérence narrative / canon / body state / lore
- pas de décisions éditoriales (celles-ci migrent vers `manga-editor-agent`)

### Sprint 3 — Manga Editor "réel" (LLM)

Actuellement `manga-editor-agent` est un **stub déterministe**. Pour
activer la variété de plans, le ratio décor/insert/reaction/dialogue
attendu, il faut :
1. Système prompt strict (pas d'invention, pas de prompts image, JSON strict).
2. Appel OpenAI (ou autre) avec retry + validation via `validateStoryboardPlan`.
3. Répartition 70–75 panels sur ~12-15 pages selon la tension narrative.

### Sprint 4bis — Render-pass "réel" FAL

Actuellement `render-pass.ts` ne fait pas d'appel FAL (ça reste au legacy).
Pour bascule totale :
1. Injecter un `generatePanelImage` réel utilisant `FalAdapter.generate`
   avec `resolveFalRenderRoute(spec)` pour le routing.
2. Persister les `SceneImage` correspondants.
3. Retirer `image-generation-pass` legacy du chemin critique quand
   `PIPELINE_V3_STORYBOARD=true`.

### Sprint 5bis — Visual memory enrichie

Étendre `load-chapter-visual-memory` :
- hydrate depuis `NpcVisualProfile.canonicalRefAsset`
- hydrate depuis `VisualLock.faceCloseupAsset` / `actionRefAsset`
- hydrate les panels déjà validés du chapitre comme anchors
  `recentPanels`

### Sprint 6bis — QA LLM-vision

Les QA passes actuelles font des checks structurels (sujet, lieu,
drift de tags). L'étape suivante : brancher
`panel-vision-analyzer` existant sur les rendus v3 pour détecter les
drifts réels via vision LLM.

## Garde-fous activés

- `validateRenderSpec` **refuse** les specs contradictoires (ex:
  `establishing_environment` avec `subjectFocus=hero`).
- `resolvePanelReferences` **lève** `MissingMainCharacterRefError` si un
  héros/support n'a pas de ref visuelle.
- `resolveFalRenderRoute` **ne descend jamais en `NONE`** si un hero/support
  est présent, même si la base du mode est LIGHT.
- `buildPagesFromPersistedStoryboard` **ne repagine jamais** un chapitre
  qui a un `StoryboardPlan` persisté.
