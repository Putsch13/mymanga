# Chapter Studio Rollout

## Source de vérité

- Nouveau domaine partagé dans `packages/core/src/types/chapter-studio.ts`
- Snapshot studio persisté dans `chapter.outline.studio`
- Bridge legacy vers `chapter.outline.approvedOutline` pour rester compatible avec le pipeline actuel
- Résolution studio-first explicitée par:
  - `resolveEffectiveProjectCanon()`
  - `resolveEffectiveCharacterCanon()`
  - `resolveEffectiveLocationCanon()`
  - `resolveEffectiveChapterCanonState()`
  - `resolveEffectiveProductionSource()`

## Compatibilité existante

- Les anciens chapitres sans snapshot studio sont relus via `buildStudioSnapshotFromLegacy`
- Le flow legacy `generate -> read` continue de fonctionner
- La sauvegarde d’un approved outline legacy hydrate aussi le snapshot studio
- Un backfill manuel est disponible via `pnpm --filter @manga-ai-studio/db backfill:chapter-studio`
- `POST /api/projects/[id]/pipeline` reste actif, mais il est maintenant gardé par la readiness studio et n’accepte plus un chapitre bloqué.

## Règles métier

- Le plan de production porte le compteur `estimatedImages`, `targetImages`, `minimumImages`
- Un enrichissement automatique ajoute des ajustements narratifs si le plan tombe sous 55 images
- Le pipeline marque le chapitre `review_required` tant que la QA premium ou le minimum 55 images n’est pas validé
- Le routage FAL ne descend plus silencieusement à `NONE` sur un close-up héros / personnage canonique clé
- Les tiers personnages pilotent désormais lock / budget prompt / attente QA:
  - `MAIN_HERO`: `HARD_LOCK`, refs `STRONG`, QA stricte
  - `SECONDARY_CORE`: `STRONG`, refs `STRONG`, QA stricte
  - `IMPORTANT_SUPPORTING_CHARACTER`: `STRONG`, refs `LIGHT`, QA stricte
  - `RECURRING_NPC`: `MEDIUM`, mémoire légère, QA légère
  - `BACKGROUND_EXTRA`: pas de lock dur, QA non obligatoire
- Le prompt principal runtime passe par `composeMangaPanelPrompt()`; `prompt-composer-v2.ts` reste seulement comme bridge legacy explicitement déprécié.
- La QA critique est désormais un hard requirement: un panel critique sans QA visuelle exploitable est bloqué et ne peut pas être accepté silencieusement.

## Migration logique

1. Écriture nouvelle: `chapter.outline.studio`
2. Compat lecture: `chapter.outline.approvedOutline`
3. Compat pipeline: conversion `productionOutline -> approvedOutline`
4. Compat UI: `read` legacy conservé, nouvelles pages `edit/generate/review` ajoutées

## Décision migration de ce lot

- Décision retenue après finition: `hybrid structured runtime`.
- Les snapshots studio, l’historique et le debug restent en JSON, mais une migration Prisma réelle sort du blob les champs runtime les plus critiques.
- Invariants ajoutés dans ce lot:
  - validation systématique du snapshot studio avant persistance
  - agrégation centralisée des compteurs images
  - source outline/canon tracée dans les payloads persistés
  - impossibilité de clôturer un chapitre sous `minimumImages`
  - impossibilité de valider un panel critique sans QA visuelle
- Champs désormais structurés sur `Chapter`:
  - `studioStatus`
  - `studioCurrentStep`
  - `studioUpdatedAt`
  - `studioAutosaveVersion`
  - `minimumImages`
  - `generatedImages`
  - `acceptedImages`
  - `rejectedImages`
  - `missingImages`
  - `criticalPanelsCount`
  - `criticalPanelsBlocked`
  - `criticalPanelsMissingQa`
  - `reviewBlockedReason`
- Restent en JSON pour cette itération:
  - snapshot studio complet
  - historique détaillé de transitions
  - QA panel détaillée
  - bundles debug prompt/génération
- Migration relationnelle cible toujours pertinente plus tard pour:
  - tables dédiées QA panel / reroll history
  - tables runtime page/panel counters
  - historisation relationnelle des transitions studio

## Tests

- Unitaires `core`: studio + helpers runtime
- Unitaires `ai`: prompt composer, stratégie FAL, validator panel, hero lock
- Unitaires `workflow`: helpers extraits du pipeline
- Intégration `apps/web`: draft, patch studio, readiness, launch, qa-report, review/complete
- E2E Playwright: `edit` (save + reload), `generate` (readiness gate bloqué/prêt), `review` (compteurs, compare mode, complete review bloqué)

## Endpoints studio ajoutés

- `GET/PATCH /api/projects/[id]/chapters/[chapterId]/studio`
- `GET /api/projects/[id]/chapters/[chapterId]/readiness`
- `POST /api/projects/[id]/chapters/[chapterId]/launch`
- `GET /api/projects/[id]/chapters/[chapterId]/qa-report`
- `POST /api/projects/[id]/chapters/[chapterId]/review/complete`
