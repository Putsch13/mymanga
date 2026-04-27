# Dead Code and Legacy Cleanup

> Inventaire du code legacy, dead code et doublons à nettoyer.

## 1. Fichiers Legacy Structurants

### Pipeline Legacy (désactivé par défaut)

| Fichier | Usage | Action |
|---------|-------|--------|
| `packages/workflow/src/legacy/run-legacy-compatible-chapter-pipeline.ts` | Orchestre narrative/image/memory passes | **Garder** (flag désactivé) |
| `packages/workflow/src/passes/narrative-pass.ts` | Utilisé par legacy pipeline | **Garder** (legacy only) |
| `packages/workflow/src/passes/image-generation-pass.ts` | Utilisé par legacy pipeline, **contient LoRA** | **À migrer** vers v3 |
| `packages/workflow/src/passes/memory-pass.ts` | Utilisé par legacy pipeline | **Garder** (legacy only) |

### Core Legacy

| Fichier | Statut | Action |
|---------|--------|--------|
| `packages/core/src/legacy/densify-premium-blueprints.ts` | `@deprecated`, aucun import prod | **Delete** |
| `packages/db/prisma/run-legacy-prechecks.ts` | Outillage migration | **Garder** |

## 2. Passes Non Câblées dans V3

Ces passes existent mais ne sont **pas importées** dans `run-premium-v3-pipeline.ts`:

| Fichier | Utilisé par | Action |
|---------|-------------|--------|
| `narrative-truth-pass.ts` | Tests seulement | **Évaluer** intégration v3 |
| `approved-plan-structural-guard.ts` | Tests seulement | **Évaluer** intégration v3 |
| `dialogue-qa-pass.ts` | Tests anti-régression | **Intégrer** dans v3 |
| `dialogue-auto-repair-pass.ts` | Tests p8 | **Intégrer** dans v3 |
| `render-spec-repair-pass.ts` | Tests p8 | **Intégrer** dans v3 |

## 3. Services AI Legacy (mais utilisés)

Ces services sont marqués `@deprecated` mais toujours importés:

| Fichier | Importé par | Action |
|---------|-------------|--------|
| `prompt-translator.ts` | `canonical-prompt-recipe-builder.ts`, `fal-adapter-shared.ts` | **Garder** (câblé) |
| `fal-scene-strategy.ts` | `image-routing-service.ts` | **Garder** (câblé) |
| `blueprint-enrichment.ts` | `panel-blueprint-builder.ts` | **Garder** (câblé) |
| `manga-page-compositor.ts` | Multiple | **Nettoyer** champs legacy |
| `panel-vision-analyzer.ts` | Multiple | **Nettoyer** branche `legacyVisionOn` |

## 4. Routes avec Gardes Legacy

Ces routes ont des guards qui refusent le mode legacy:

| Route | Guard |
|-------|-------|
| `/launch/route.ts` | Refuse si V3 pas activé |
| `/retry/route.ts` | Refuse reconstruction prompt legacy |
| `/chapters/[chapterId]/route.ts` | Refuse modification statut legacy |

## 5. Tests d'Isolation Legacy

Le test `premium-path-legacy-isolation.test.ts` vérifie que ces strings sont **interdites** dans le chemin premium v3:

- `prompt-translator`
- `fal-scene-strategy` (le fichier strategy)
- `blueprint-enrichment`
- `densify-premium-blueprints`

## 6. Doublons Identifiés

### Types Panel/Dialogue

| Problème | Fichiers |
|----------|----------|
| Dialogues multiples | `panel.dialogue`, `bp.dialogueLines`, `panelTextBundle.dialogues`, `SceneImage.metadata.dialogue` |
| Panel types | `PanelBlueprint`, `StoryboardPanel`, `PanelRenderSpec` (chevauchement) |

### Helpers Image

| Pattern | Fichiers |
|---------|----------|
| Construction prompt | `minimal-panel-prompt-builder.ts`, `canonical-prompt-recipe-builder.ts` |
| Résolution FAL route | `fal-adapter-shared.ts`, `image-routing-service.ts` |

## 7. Feature Flags Legacy

| Flag | Défaut | Usage |
|------|--------|-------|
| `LEGACY_PIPELINE_ENABLED` | `false` | Active pipeline legacy |
| `MANGA_ALLOW_BLUEPRINT_EXPANSION_LEGACY` | - | Active blueprint-enrichment legacy |
| `legacyVisionOn` | - | Active branche vision legacy |

## 8. Actions de Nettoyage

### Immédiat (Safe)

```bash
# Supprimer fichier mort
rm packages/core/src/legacy/densify-premium-blueprints.ts
rm packages/core/src/legacy/densify-premium-blueprints.test.ts
```

### Court terme (P1)

1. **Migrer LoRA** de `image-generation-pass.ts` vers `default-panel-image-generator.ts`
2. **Intégrer** `dialogue-auto-repair-pass.ts` dans v3
3. **Intégrer** `render-spec-repair-pass.ts` dans v3
4. **Nettoyer** branches `legacyVisionOn` dans `panel-vision-analyzer.ts`

### Moyen terme (P2)

1. **Unifier** types dialogue en `PanelTextContract`
2. **Supprimer** champs legacy dans `manga-page-compositor.ts`
3. **Évaluer** suppression complète du dossier `legacy/` si plus utilisé

## 9. Scripts d'Audit à Créer

```json
{
  "scripts": {
    "audit:routes": "tsx apps/web/scripts/audit-api-routes.ts",
    "audit:assets": "tsx apps/web/scripts/audit-generated-assets.ts",
    "audit:legacy": "tsx apps/web/scripts/audit-legacy-imports.ts",
    "graph:circular": "madge --circular .",
    "deadcode": "ts-prune"
  }
}
```

## 10. Test Anti-Régression

Créer `packages/workflow/src/no-legacy-premium-imports.test.ts`:

```typescript
import { readFileSync } from "fs";

const PREMIUM_FILES = [
  "run-premium-v3-pipeline.ts",
  "passes/render-pass.ts",
  "build-storyboard-plan-from-approved-production-plan.ts",
  "passes/enrich-panel-render-spec.ts",
];

const FORBIDDEN_IMPORTS = [
  "prompt-translator",
  "fal-scene-strategy",
  "blueprint-enrichment",
  "densify-premium-blueprints",
  "./legacy/",
];

describe("Premium path legacy isolation", () => {
  PREMIUM_FILES.forEach((file) => {
    it(`${file} should not import legacy modules`, () => {
      const content = readFileSync(`packages/workflow/src/${file}`, "utf-8");
      FORBIDDEN_IMPORTS.forEach((forbidden) => {
        expect(content).not.toContain(forbidden);
      });
    });
  });
});
```

## 11. Résumé

| Catégorie | Count | Action |
|-----------|-------|--------|
| Fichiers legacy actifs (flag off) | 4 | Garder |
| Fichiers dead (aucun import) | 1 | Delete |
| Passes non câblées v3 | 5 | Évaluer/Intégrer |
| Services legacy câblés | 5 | Garder + nettoyer |
| Doublons types | 2 patterns | Unifier |
