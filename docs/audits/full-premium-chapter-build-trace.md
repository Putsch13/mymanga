# Full Premium Chapter Build Trace

> Audit complet du parcours chapitre premium depuis l'interface studio jusqu'au reader.

## 1. Flux Général

```
Interface Studio (chapter-studio-editor.tsx)
    ↓
Estimate Route (estimate/route.ts)
    ↓
Approved Outline Route (approved-outline/route.ts)
    ↓
Launch Route (launch/route.ts)
    ↓
Job Creation → Inngest/run-now
    ↓
run-premium-v3-pipeline.ts
    ├── story-pass.ts (StoryArchitect LLM)
    ├── storyboard-pass.ts (MangaEditor LLM)
    ├── visual-world-discovery-pass.ts (compose + valide VisualWorldContract ; legacy regex en support interne)
    ├── canon-resolver-pass.ts
    ├── load-chapter-visual-memory.ts
    ├── dialogue-scene-writer.ts
    └── render-pass.ts
         ├── buildPanelRenderSpec
         ├── repairRenderSpecContradictions
         ├── buildMinimalPanelPromptStrict
         ├── resolveFalRenderRoute
         └── generatePanelImage (FAL)
              ↓
         v3-scene-image-persistence.ts
              ↓
         Visual QA (panel-vision-analyzer.ts)
              ↓
         SceneImage (DB)
              ↓
         Reader (build-reader-pages.ts)
```

## 2. Composants Studio Audités

### 2.1 chapter-studio-editor.tsx

| Aspect | Détail |
|--------|--------|
| **Données lues** | `snapshot`, `draft`, `characterCatalog`, `chapterVisualContract`, `generationContext` |
| **Routes appelées** | `GET/PATCH /studio`, `POST /estimate`, `POST /autofill` |
| **Données écrites** | Tout `ChapterStudioData` via PATCH studio |
| **Source dialogues** | Aucun affichage texte — seulement `sceneDialogueEnrich` (booléen) |

### 2.2 chapter-plan-step.tsx

| Aspect | Détail |
|--------|--------|
| **Données lues** | `draft.editorialOutline`, `draft.productionPlan`, `estimateContext.canonicalProductionPlan` |
| **Routes appelées** | Aucune (callbacks vers parent) |
| **Données écrites** | `narrativeContract` via `onUpdateDraft` |
| **Source dialogues** | Métriques `dialogueAnchorCoverage` uniquement |

### 2.3 production-plan-card.tsx

| Aspect | Détail |
|--------|--------|
| **Données lues** | `plan` (ProductionPlan), `canonicalProductionPlan` |
| **Routes appelées** | Aucune (présentation pure) |
| **Source dialogues** | `plan.dialogueAnchorCoverage` (comptages) |

### 2.4 chapter-review-board.tsx

| Aspect | Détail |
|--------|--------|
| **Données lues** | Rapport QA via `GET /qa-report` |
| **Routes appelées** | `POST /retry`, `POST /validate`, `POST /review/complete` |
| **Source dialogues** | Score `dialogueAnchorScore` (QA), pas de texte |

### 2.5 chapter-cast-canon-step.tsx

| Aspect | Détail |
|--------|--------|
| **Données lues** | `draft`, `characterCatalog`, `recurringNpcs` |
| **Routes appelées** | `GET /recurring-npcs`, `POST /promote`, `POST /npc-resolve` |
| **Données écrites** | `characterSelection`, `chapterCanon` |

## 3. Problèmes Identifiés

### 3.1 Plan riche écrasé par plan canonique

**Fichiers concernés:**
- `run-premium-v3-pipeline.ts`
- `build-storyboard-plan-from-canonical-plan.ts`
- `build-canonical-production-plan.ts`

**Problème:** `buildStoryboardPlanFromCanonicalPlan` peut reconstruire des panels génériques et perdre:
- micro-actions enrichies
- dialogueLines
- visual DNA
- NPC groups
- props obligatoires

### 3.2 Dialogues répartis dans trop de champs

**Champs trouvés:**
- `panel.dialogue`
- `bp.dialogueLines`
- `panelTextBundle.dialogues`
- `panelTextPayload.dialogue`
- `SceneImage.metadata.dialogue`
- `SceneImage.metadata.dialogues`

**Résultat:** Bulles vides possibles, dialogue perdu entre étapes.

### 3.3 Visual DNA personnage incomplet

**Problème:** 
- `buildDialogueTwoShotSubject` utilise parfois juste les noms
- `render-spec-builder` ignore souvent `characterVisualDna`
- Vision QA reçoit des fingerprints "unspecified"

### 3.4 Vision QA sur URL temporaire

**Problème:** QA lancée sur URL provider (FAL) qui peut expirer avant Vision QA.

### 3.5 Fallbacks IA silencieux

**Agents avec fallback:**
- `story-architect-agent-llm.ts` → stub si pas de clé/erreur
- `manga-editor-agent-llm.ts` → stub si pas de clé/erreur
- `dialogue-writer.ts` → heuristique fallback

**Protection existante:** `story-pass.ts` et `storyboard-pass.ts` ont des guards premium, mais pas `dialogue-writer.ts`.

### 3.6 LoRA non intégré dans render-pass v3

**Constat:** `default-panel-image-generator.ts` n'injecte pas explicitement les LoRAs dans l'appel `generateImage`. Les LoRAs sont câblés dans le legacy `image-generation-pass.ts` mais pas dans le chemin v3.

## 4. Routes à Risque

| Route | Risque |
|-------|--------|
| `/projects/[id]/chapters/[chapterId]/route.ts` PATCH | Peut injecter outline arbitraire, bypass validations studio |
| `/projects/[id]/pipeline/route.ts` | Pas de garde V3 obligatoire, peut tomber sur legacy |
| `/jobs/[jobId]/run-now/route.ts` | Pas de re-contrôle V3, même logique worker |

## 5. Actions Prioritaires

1. **Créer `ChapterGenerationContract`** — source de vérité unique
2. **Créer `PanelTextContract`** — dialogue unique
3. **Intégrer LoRA dans render-pass v3**
4. **Persister image stable avant Vision QA**
5. **Bloquer fallback dialogue en premium**
6. **Propager visual DNA complet jusqu'au prompt**
