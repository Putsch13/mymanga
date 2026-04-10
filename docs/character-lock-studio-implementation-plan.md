# Character Lock Studio Implementation Plan

## Objectif produit
Traiter le personnage comme un acteur casté avec un lock visuel versionné, comparable, activable et traçable.

## Route page
- `apps/web/app/(app)/projects/[id]/characters/[characterId]/locks/page.tsx`

## API read model
- `apps/web/app/api/characters/[characterId]/locks/route.ts`

## Read model attendu
```ts
type CharacterLockStudioReadModel = {
  project: { id: string; title: string };
  character: {
    id: string;
    name: string;
    roleType: string | null;
    visualRefs: Array<{
      id: string;
      imageUrl: string;
      type: string;
      isPrimary: boolean;
      mediaAssetId: string | null;
      sourceVisualLockId: string | null;
    }>;
  };
  activeLock: {
    id: string;
    version: number;
    displayName: string;
    shortVisualCore: string;
    triggerWord: string | null;
    defaultOutfit: string | null;
    canonicalRefUrls: string[];
    currentState: Record<string, unknown>;
    injuryState: Record<string, unknown>;
    loraModel: { id: string; name: string; status: string } | null;
    loraAsset: { id: string; url: string | null } | null;
    faceCloseupAsset: { id: string; url: string | null } | null;
    actionRefAsset: { id: string; url: string | null } | null;
  } | null;
  versions: Array<{
    id: string;
    version: number;
    isActive: boolean;
    createdAt: string;
    shortVisualCore: string;
    triggerWord: string | null;
    previewUrl: string | null;
    metadata: Record<string, unknown>;
  }>;
  lora: {
    id: string;
    name: string;
    status: string;
    triggerWord: string | null;
    weightsAssetUrl: string | null;
    configAssetUrl: string | null;
  } | null;
};
```

## Fonctions minimales
- voir lock actif
- voir versions
- comparer 2 versions
- activer une version
- cloner une version
- voir refs réelles
- voir LoRA active
- préparer l'action `regenerate canonical pack`

## Composants
- `apps/web/components/character-lock-studio/character-lock-studio-shell.tsx`
- `apps/web/components/character-lock-studio/active-lock-panel.tsx`
- `apps/web/components/character-lock-studio/lock-version-list.tsx`
- `apps/web/components/character-lock-studio/lock-compare-panel.tsx`
- `apps/web/components/character-lock-studio/ref-strip.tsx`
- `apps/web/components/character-lock-studio/lora-status-card.tsx`

## Actions API à prévoir
- `GET /api/characters/[characterId]/locks`
- `POST /api/characters/[characterId]/locks/[lockId]/activate`
- `POST /api/characters/[characterId]/locks/[lockId]/clone`
- `GET /api/characters/[characterId]/locks/compare?left=<id>&right=<id>`
- plus tard : `POST /api/characters/[characterId]/canonical-pack/regenerate`

## Ordre d'implémentation
1. route read model
2. page locks dédiée
3. vue lock actif + refs + LoRA
4. liste des versions
5. comparaison de deux versions
6. action `activate`
7. action `clone`
8. préparation de `regenerate canonical pack`

## Risques
- si trop d'informations techniques arrivent en même temps, la comparaison devient illisible
- il faut afficher d'abord le lock actif et les différences, pas exposer tout le JSON d'un coup
