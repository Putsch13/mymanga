# Dead Code and Legacy Cleanup

> P1.15 — Documentation des fichiers morts, imports legacy et doublons.

## Scripts de détection

```bash
# Détection des imports legacy dans le pipeline premium
pnpm audit:legacy

# Détection des dépendances circulaires
pnpm graph:circular

# Détection du code mort
pnpm deadcode
```

## Fichiers premium protégés

Ces fichiers ne doivent **jamais** importer de modules legacy :

- `packages/workflow/src/run-premium-v3-pipeline.ts`
- `packages/workflow/src/passes/render-pass.ts`
- `packages/workflow/src/build-storyboard-plan-from-approved-production-plan.ts`
- `packages/workflow/src/passes/enrich-panel-render-spec.ts`

## Imports interdits dans les fichiers premium

| Pattern | Raison |
|---------|--------|
| `prompt-translator` | Ancien traducteur de prompt |
| `fal-scene-strategy` (sans -v3) | Ancienne stratégie FAL |
| `blueprint-enrichment` | Ancien enrichissement de blueprints |
| `densify-premium-blueprints` | Densifieur déprécié |
| `./legacy/` ou `../legacy/` | Import direct de module legacy |
| `run-legacy-compatible` | Pipeline legacy |

## Patterns legacy à éviter

| Pattern | Raison |
|---------|--------|
| `PromptComposer` | Ancien composeur de prompt |
| `LegacyRenderer` | Ancien renderer |
| `StubAgent` | Agent stub (doit utiliser LLM) |
| `LEGACY_*` | Constantes legacy |
| `@deprecated` | Code déprécié |

## Test anti-régression

Le test `packages/workflow/src/no-legacy-premium-imports.test.ts` vérifie automatiquement que les fichiers premium ne contiennent aucun import legacy.

```bash
pnpm test:workflow
```

## Types dupliqués à consolider

### Panel types

- `PanelBlueprint` vs `PanelBlueprintPremium` vs `StoryboardPanel`
- Utiliser `PanelBlueprintPremium` pour tout le pipeline premium

### Dialogue types

- `DialogueLine` vs `Dialogue` vs `PanelDialogue`
- Utiliser `PanelTextContract` comme source unique

### Image types

- `SceneImage` vs `PanelImage` vs `GeneratedImage`
- Utiliser `SceneImage` (DB) avec `PanelRenderSpec` (metadata)

## Helpers image dupliqués

| Fichier | Fonction | Action |
|---------|----------|--------|
| `image-helpers.ts` | `downloadImage` | Garder |
| `image-utils.ts` | `downloadImage` | Supprimer, utiliser image-helpers |
| `fal-helpers.ts` | `persistFalImage` | Migrer vers persist-temporary-image-for-qa |

## Routes non utilisées

Exécuter `pnpm audit:routes` pour générer l'inventaire complet.

Routes candidates à la suppression :

- `/api/ai/generate` → Legacy, bloquer pour premium
- `/api/estimate-image` → Dev/tooling uniquement

## Prochaines étapes

1. Exécuter les scripts d'audit
2. Identifier les violations
3. Migrer progressivement vers les nouveaux modules
4. Supprimer les fichiers legacy inutilisés
5. Ajouter les tests de non-régression
