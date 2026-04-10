# FAL Trace Explorer Implementation Plan

## Objectif produit
Répondre en moins de 10 secondes à :
"Pourquoi cette image est ratée ?"

## Route page
- `apps/web/app/(app)/projects/[id]/traces/page.tsx`

## API read model paginée
- `apps/web/app/api/projects/[id]/traces/route.ts`

## Paramètres de filtre
- `chapterId`
- `sceneId`
- `panelId`
- `characterId`
- `status`
- `provider`
- `mode`
- `cursor`
- `limit`

## Read model attendu
```ts
type FalTraceExplorerReadModel = {
  filters: {
    chapterId: string | null;
    sceneId: string | null;
    panelId: string | null;
    characterId: string | null;
    status: string | null;
    provider: string | null;
    mode: string | null;
  };
  pagination: {
    nextCursor: string | null;
    limit: number;
  };
  traces: Array<{
    id: string;
    createdAt: string;
    provider: string;
    model: string;
    mode: string;
    status: string;
    requestId: string | null;
    jobId: string | null;
    chapter: { id: string; title: string | null } | null;
    scene: { id: string; sceneNumber: number | null } | null;
    panel: {
      id: string;
      panelNumber: number | null;
      imageUrl: string | null;
    } | null;
    character: { id: string; name: string } | null;
    sceneKeyframe: {
      id: string;
      version: number;
      imageUrl: string | null;
    } | null;
    refsUsed: Array<{ url: string; type?: string }>;
    lorasUsed: Array<{ id?: string; name?: string; triggerWord?: string }>;
    timings: Record<string, unknown>;
    requestPayload: Record<string, unknown>;
    responsePayload: Record<string, unknown>;
    error: Record<string, unknown> | null;
    linkedUrls: {
      panelStudioUrl: string | null;
      characterLockStudioUrl: string | null;
    };
  }>;
};
```

## Fonctions minimales
- filtrer par chapitre / scène / panel / personnage / status
- visualiser refs input / outputs
- visualiser payloads
- voir timings
- voir erreurs
- comparer deux traces
- naviguer vers `Chapter Studio` et `Character Lock Studio`

## Composants
- `apps/web/components/fal-trace-explorer/fal-trace-explorer-shell.tsx`
- `apps/web/components/fal-trace-explorer/filter-bar.tsx`
- `apps/web/components/fal-trace-explorer/trace-list.tsx`
- `apps/web/components/fal-trace-explorer/trace-card.tsx`
- `apps/web/components/fal-trace-explorer/trace-image-strip.tsx`
- `apps/web/components/fal-trace-explorer/trace-payload-drawer.tsx`
- `apps/web/components/fal-trace-explorer/trace-diff-modal.tsx`

## Actions utilisateur
- filtrer
- ouvrir le détail d'une trace
- comparer deux traces
- ouvrir le panel source
- ouvrir le personnage lié

## Ordre d'implémentation
1. route API paginée
2. page explorer avec filtres
3. cartes de trace image-first
4. drawer de payloads repliable
5. comparaison de rerolls
6. liens profonds vers Chapter Studio / Character Lock Studio

## Principes UX
- timeline et cartes avant JSON brut
- images input/output visibles immédiatement
- JSON secondaire et replié
- erreurs et timings mis en avant
- diff de reroll lisible sans jargon inutile
