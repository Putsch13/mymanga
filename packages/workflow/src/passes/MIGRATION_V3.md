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

### Sprint 2bis — découper `narrative-pass.ts` (✅ scaffolding en place)

**Déjà extraits vers `./narrative/` (isoBehaviour, aucun changement sémantique) :**
- `LEGACY_STD_NEGATIVE` → `narrative/panel-prompt-constants.ts`
- `LegacyPlannedImage` + `LegacyPendingImageWrite` → `narrative/planned-image-types.ts`
- boucle micro-tx d'écriture `sceneImage.upsert` (≈ 53 lignes) →
  `narrative/persist-planned-images.ts`

**Restent à extraire (risqué : variables locales profondes, à faire en PR dédiée) :**
- composition `composedPositive` / `composedNegative` autour de
  `composeMangaPanelPrompt` → à déplacer vers
  `./narrative/compose-legacy-panel-prompt.ts` puis à terme vers
  `minimal-panel-prompt-builder` quand v3 absorbe le chemin legacy
- routing FAL heuristique (blocs ~1600-1900) → à remplacer par
  `resolveFalRenderRoute(spec)` une fois le render-pass v3 actif
- `baseMetadata` orienté FAL → à mutualiser avec le render-pass v3
- debug trace FAL → à déporter dans une fonction dédiée

**À GARDER définitivement dans `narrative-pass.ts` :**
- bundle narratif (scènes, beats, continuité)
- cohérence narrative / canon / body state / lore
- pas de décisions éditoriales (celles-ci migrent vers `manga-editor-agent`)

### Sprint 3 — Manga Editor "réel" (LLM) ✅

Le fichier `manga-editor-agent-llm.ts` implémente l'appel OpenAI :
1. Système prompt strict (pas d'invention, pas de prompts image, JSON strict).
2. Appel `openai.chat.completions.create` avec `response_format: json_object`
   + `temperature: 0.5` + `max_tokens: 8000` (modèle configurable via
   `OPENAI_MANGA_EDITOR_MODEL`, défaut `gpt-4o-mini`).
3. Sanitize enum-by-enum, validation via `validateStoryboardPlan`.
4. **Fallback automatique** sur le stub déterministe si :
   - `OPENAI_API_KEY` absent
   - réponse non parsable / sans pages
   - validation remonte des `issues`
5. Activé par `PIPELINE_V3_MANGA_EDITOR_LLM=true`.

### Sprint 4bis — Render-pass "réel" FAL ✅ (opt-in)

Le render-pass v3 peut désormais brancher un vrai FAL :
1. `createDefaultPanelImageGenerator()` utilise `createFalPanelAdapter`
   (identique au legacy) avec les providerParams v3 (renderMode,
   subjectFocus, cutawayType, referencePolicy, retryPolicy).
2. Taille image dérivée de `route.sizePreset` (portrait/landscape/square).
3. Références aplaties : characters + environments + panels + style.
4. Activé par `PIPELINE_V3_RENDER_FAL=true` (requiert
   `PIPELINE_V3_STORYBOARD=true` aussi). Sans `FAL_KEY`, bascule
   automatique sur `createMockImageProvider` — utile en tests/CI.

**Restent à faire côté persistance v3 :**
- Créer les `SceneImage` correspondants (schéma DB inchangé pour l'instant).
  Aujourd'hui les URLs générées sont stockées dans
  `outline.renderResultV2.rendered[].imageUrl` pour audit shadow.
- Retirer `image-generation-pass` legacy du chemin critique quand QA prod
  valide le shadow.

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
