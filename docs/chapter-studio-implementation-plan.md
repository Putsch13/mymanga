# Chapter Studio Implementation Plan

## Objectif produit
Créer le cockpit principal de pilotage d'un chapitre pour comprendre immédiatement :
- pourquoi un panel est bon ou mauvais
- quelle keyframe, quels locks, quelles refs et quelles traces il utilise
- quel reroll ciblé lancer sans régénération destructive

## Route page
- `apps/web/app/(app)/projects/[id]/chapters/[chapterId]/studio/page.tsx`

## Route API read model consolidée
- `apps/web/app/api/projects/[id]/chapters/[chapterId]/studio/route.ts`

## Read model attendu
```ts
type ChapterStudioReadModel = {
  project: { id: string; title: string };
  chapter: {
    id: string;
    chapterNumber: number;
    title: string | null;
    status: string;
    qualityScore: number | null;
    fallbackFlags: string[];
  };
  scenes: Array<{
    id: string;
    sceneNumber: number;
    title: string | null;
    summary: string | null;
    intensity: number | null;
    qualityScore: number | null;
    keyframe: {
      id: string | null;
      version: number | null;
      selected: boolean | null;
      imageUrl: string | null;
      imageAssetId: string | null;
      compositionArchetype: string | null;
      lightingLock: string | null;
    } | null;
    characters: Array<{ id: string; name: string }>;
    panels: Array<{
      id: string;
      panelNumber: number;
      imageUrl: string | null;
      status: string;
      shotType: string | null;
      tags: string[];
      warnings: string[];
      quality: {
        overall: number | null;
        styleContinuity: number | null;
        backgroundContinuity: number | null;
        faceConsistency: number | null;
        interactionReadability: number | null;
        combatReadability: number | null;
      };
      identity: {
        expectedCharacters: Array<{ id: string; name: string }>;
        detectedCharacters: Array<{ id: string; name: string; confidence: number | null }>;
        activeLocks: Array<{ id: string; version: number; displayName: string }>;
        driftScore: number | null;
      };
      generation: {
        provider: string | null;
        model: string | null;
        mode: string | null;
        referencePolicy: string | null;
        keyframeSourceId: string | null;
        refs: Array<{ id: string; imageUrl: string; type: string }>;
        loras: Array<{ id: string; name: string; triggerWord: string | null }>;
        positivePrompt: string | null;
        negativePrompt: string | null;
        latestTraceId: string | null;
        attemptCount: number;
      };
      attempts: Array<{
        traceId: string;
        createdAt: string;
        status: string;
        mode: string;
        imageUrl: string | null;
      }>;
    }>;
  }>;
};
```

## Layout UX

### Colonne gauche
- liste des scènes
- statut visuel
- keyframe active
- personnages présents
- score global scène

### Centre
- pages / panels avec grandes miniatures
- badges : `validated`, `drift`, `rerolled`, `combat`, `weak_background`, `missing_subject`
- pagination légère ou scroll virtuel pour chapitres 50-60 images

### Colonne droite
- cockpit du panel sélectionné

## Cockpit panel

### Identity
- personnages attendus
- personnages détectés
- lock actif utilisé
- drift oui/non ou score

### Generation
- provider
- modèle
- mode
- keyframe source
- refs
- LoRAs
- prompt positif
- prompt négatif

### Quality
- score global
- style continuity
- background continuity
- face consistency
- interaction / combat readability
- warnings

### Actions
- reroll identité
- reroll décor
- reroll style
- reroll action
- force generation mode
- mark best
- compare attempts

## Composants
- `apps/web/components/chapter-studio/chapter-studio-shell.tsx`
- `apps/web/components/chapter-studio/scene-sidebar.tsx`
- `apps/web/components/chapter-studio/panel-canvas.tsx`
- `apps/web/components/chapter-studio/panel-card.tsx`
- `apps/web/components/chapter-studio/panel-cockpit.tsx`
- `apps/web/components/chapter-studio/panel-identity-section.tsx`
- `apps/web/components/chapter-studio/panel-generation-section.tsx`
- `apps/web/components/chapter-studio/panel-quality-section.tsx`
- `apps/web/components/chapter-studio/panel-actions-section.tsx`
- `apps/web/components/chapter-studio/attempt-compare-drawer.tsx`

## Actions API à prévoir
- `POST /api/scene-images/[sceneImageId]/reroll`
- `POST /api/scene-images/[sceneImageId]/mark-best`
- `POST /api/projects/[id]/chapters/[chapterId]/panels/[panelId]/force-mode`
- `GET /api/projects/[id]/chapters/[chapterId]/studio`

## Ordre d'implémentation
1. route API consolidée read-only
2. page studio avec layout 3 colonnes
3. sidebar scènes + centre panels
4. cockpit panel read-only complet
5. badges qualité et warnings
6. compare attempts
7. actions ciblées de reroll
8. polish UX premium

## Risques
- volume de données élevé sur 50-60 images : prévoir pagination/virtualisation
- prompts/payloads parfois volumineux : viewer repliable par défaut
- il faut garder le cockpit panel lisible avant d'ajouter des métriques secondaires
