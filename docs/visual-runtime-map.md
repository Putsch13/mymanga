# Visual Runtime Map — Pipeline Manga Premium

> Cartographie du pipeline réel, établie après audit du commit `6a927d4`.
> Mise à jour : 2026-04-11

---

## Pipeline runtime (flux réel)

```
ChapterStudioSnapshot
  └─ chapterLookProfile : ❌ ABSENT du schéma chapter-studio.ts
  └─ estimateContext    : ✅ présent
  └─ entityRegistry     : ✅ présent

runFullChapterPipelineFromJob(jobId)
  ├─ Charge : project, chapter, stylePacks, rawCharacters, loraAttachments
  ├─ generateChapterBundle() → outline + script.scenes + storyboard.pages
  ├─ runChapterNarrativeCoherencePass() → premiumDiagnostic, autoAppliedPatches
  │
  ├─ Pour chaque panel :
  │   ├─ buildPanelContract(input)
  │   │   └─ ❌ NE remplit PAS : characterFingerprints, intentCard, sceneAnchor
  │   │
  │   ├─ buildSceneBlueprint(input)
  │   │   └─ ❌ NE reçoit PAS chapterLookProfile
  │   │
  │   ├─ panelContract merge (mustShow, mustNotShow, npcPresence, persistentSceneAnchors)
  │   │   └─ ❌ NE remplit PAS : characterFingerprints, intentCard, sceneAnchor
  │   │
  │   ├─ promptCharacters map (fingerprint → texte aplati, PAS CharacterRef.fingerprint)
  │   │   └─ ❌ hardTraits NON passés au CharacterRef
  │   │
  │   ├─ combatDirection (si purpose === "action") ✅ branché
  │   │
  │   ├─ composeMangaPanelPrompt({ stylePack, sceneBlueprint, characters, ... })
  │   │   └─ ❌ chapterLookProfile : NON passé
  │   │   └─ ❌ sceneAnchor : NON passé
  │   │   └─ ❌ intentCard : NON passé
  │   │   └─ ❌ characters[].fingerprint : NON passé (hardTraits ignorés)
  │   │
  │   └─ baseMetadata sauvegardé (panelContract, sceneBlueprint, combatDirection, ...)
  │
  ├─ Pour chaque image planifiée :
  │   ├─ buildRoutingContext(...)
  │   │   └─ ❌ chapterLookProfileMode : NON injecté
  │   │   └─ ❌ beatEventType : NON injecté
  │   │
  │   ├─ generateAttempt() → runRoutedImageGeneration(routingCtx, input)
  │   │   └─ ImageGenerationLog : champs observabilité typés mais ❌ NON alimentés
  │   │
  │   ├─ validateAttempt() → detectVisualDrift({ prompt, characters, usedLoras, usedRefs, ... })
  │   │   └─ ❌ chapterLookProfile : NON passé → styleDriftScore = 100 (neutre)
  │   │   └─ ❌ sceneAnchor : NON passé → sceneContinuityScore = 100 (neutre)
  │   │   └─ ❌ intentCard : NON passé → beatAlignmentScore = 100 (neutre)
  │   │   └─ ❌ hardTraits : NON passés → boucle hard traits inactive
  │   │   └─ beatEventType = panelContract.purpose (string libre, pas BeatEventType typé)
  │   │
  │   └─ Persistance metadata (driftScore, driftSeverity, driftReasons)
  │       └─ ❌ styleDriftScore, characterDriftScore, beatAlignmentScore NON persistés
  │       └─ ❌ recommendedAction NON persisté dans metadata principale
```

---

## Tableau contrats : défini / alimenté / consommé

| Contrat | Défini | Alimenté (pipeline) | Consommé (pipeline) |
|---------|--------|---------------------|---------------------|
| `ChapterLookProfile` | ✅ `chapter-look-profile.ts` | ❌ absent du snapshot studio | ❌ non passé au prompt/drift/routing |
| `PanelContract.characterFingerprints` | ✅ `panel-contract.ts` | ❌ buildPanelContract ne le remplit pas | ❌ non consommé |
| `PanelContract.intentCard` | ✅ `panel-contract.ts` | ❌ buildPanelContract ne le remplit pas | ❌ non consommé |
| `PanelContract.sceneAnchor` | ✅ `panel-contract.ts` | ❌ buildPanelContract ne le remplit pas | ❌ non consommé |
| `PanelContract.panelDebugTrace` | ✅ `panel-contract.ts` | ❌ jamais rempli | ❌ non consommé |
| `CharacterRef.fingerprint` | ✅ `manga-prompt-composer.ts` | ❌ promptCharacters map ne le passe pas | ❌ hardTraitsLock inactif |
| `CharacterRef.hardTraits` | ✅ `manga-prompt-composer.ts` | ❌ non passé | ❌ bloc HARD LOCK inactif |
| `DriftCheckInput.chapterLookProfile` | ✅ `visual-drift-detector.ts` | ❌ non passé | ❌ styleDriftScore = 100 |
| `DriftCheckInput.sceneAnchor` | ✅ `visual-drift-detector.ts` | ❌ non passé | ❌ sceneContinuityScore = 100 |
| `DriftCheckInput.intentCard` | ✅ `visual-drift-detector.ts` | ❌ non passé | ❌ beatAlignmentScore = 100 |
| `CharacterDriftInput.hardTraits` | ✅ `visual-drift-detector.ts` | ❌ non passé | ❌ boucle hardTraits inactive |
| `RoutingContext.chapterLookProfileMode` | ✅ `types.ts` | ❌ buildRoutingContext ne le passe pas | ❌ filtre provider inactif |
| `RoutingContext.beatEventType` | ✅ `types.ts` | ❌ buildRoutingContext ne le passe pas | ❌ non utilisé |
| `ImageGenerationLog` (champs obs.) | ✅ `run-generation.ts` | ❌ runRoutedImageGeneration ne les alimente pas | ❌ non tracés |
| `RerollPolicyDecision` | ✅ `retry-reference-policy.ts` | ⚠️ produit par resolveRetryReferencePolicy | ⚠️ flags hasLookProfile/hasFingerprint/hasSceneAnchor non passés |
| `DriftCheckResult.styleDriftScore` | ✅ `visual-drift-detector.ts` | ⚠️ calculé si inputs fournis | ❌ non persisté en metadata |
| `DriftCheckResult.beatAlignmentScore` | ✅ `visual-drift-detector.ts` | ⚠️ calculé si inputs fournis | ❌ non persisté en metadata |
| `qa-report` drift 2.0 | ✅ `chapter-review-board.tsx` (type UI) | ❌ qa-report route ne les expose pas | ❌ UI affiche null |
| `chapterLookProfile` dans snapshot | ❌ absent de `chapter-studio.ts` | ❌ | ❌ |

---

## Points de rupture critiques (ordre de risque)

### P0 — Ruptures qui rendent les briques premium totalement inactives

1. **`chapterLookProfile` absent du snapshot studio** → impossible de le propager
2. **`composeMangaPanelPrompt` ne reçoit pas `chapterLookProfile`, `sceneAnchor`, `intentCard`** → prompt générique
3. **`detectVisualDrift` ne reçoit pas `chapterLookProfile`, `sceneAnchor`, `intentCard`** → scores 2.0 = 100 (neutre)
4. **`CharacterRef.fingerprint` / `hardTraits` non passés** → bloc HARD LOCK inactif
5. **`buildRoutingContext` n'injecte pas `chapterLookProfileMode`** → filtre provider inactif
6. **`ImageGenerationLog` champs observabilité non alimentés** → debug impossible

### P1 — Ruptures qui dégradent la qualité sans bloquer

7. **`buildPanelContract` ne remplit pas `characterFingerprints`, `intentCard`, `sceneAnchor`** → contrat incomplet
8. **Scores drift 2.0 non persistés en metadata** → qa-report ne peut pas les exposer
9. **`qa-report` route ne lit pas les sous-scores drift** → review board aveugle
10. **`resolveRetryReferencePolicy` ne reçoit pas `recommendedAction` du drift** → reroll goal mal orienté

---

## Fichiers à modifier (ordre d'exécution)

1. `packages/core/src/types/chapter-studio.ts` — ajouter `chapterLookProfile`
2. `packages/workflow/src/run-full-chapter-pipeline.ts` — résoudre lookProfile, passer à prompt/drift/routing, alimenter ImageGenerationLog, persister sous-scores drift
3. `packages/workflow/src/build-panel-contract.ts` — remplir `intentCard`, `sceneAnchor` (depuis sceneContext), `characterFingerprints`
4. `packages/ai/src/run-generation.ts` — alimenter ImageGenerationLog avec les champs observabilité
5. `apps/web/app/api/scene-images/[sceneImageId]/retry/route.ts` — passer lookProfile/anchor/intent au drift, passer recommendedAction à resolveRetryReferencePolicy, persister sous-scores
6. `apps/web/app/api/projects/[id]/chapters/[chapterId]/qa-report/route.ts` — exposer drift 2.0 dans le payload
7. `apps/web/components/studio/chapter-editor-sidebar-summary.tsx` — afficher lookProfile depuis snapshot
