# QA visuelle premium — configuration production

En **production**, le rendu image premium doit utiliser la vision réelle (pas de mocks) et des clés valides.

## Variables recommandées

| Variable | Rôle |
|----------|------|
| `OPENAI_API_KEY` | Obligatoire — IA1/IA2 et analyse vision QA. |
| `FAL_KEY` ou équivalent provider image | Obligatoire pour `PIPELINE_V3_RENDER_FAL=true`. |
| `PIPELINE_V3_RENDER_FAL` | `true` en premium-only pour persister les `SceneImage`. |
| `ENABLE_IMAGE_MOCKS` | Doit rester **absent** ou `false` en prod. |
| `VISUAL_PANEL_QA_VISION` | **`true` en prod premium** — active l’analyse vision côté QA panel. |
| `ENABLE_PREMIUM_VISION_QA` | **`true` en prod premium** — active le chemin QA vision premium. |

## Préflight

`assertPremiumVisualQaConfig()` (package `workflow`) est appelé en **premium-only** + `NODE_ENV=production` au démarrage du pipeline V3 : absence de clé, mocks activés, ou flags vision manquants → erreur explicite.

Obligatoire en prod premium :

- `VISUAL_PANEL_QA_VISION=true`
- `ENABLE_PREMIUM_VISION_QA=true`
- `OPENAI_API_KEY`
- `FAL_KEY` (ou `FAL_API_KEY`)
- `ENABLE_IMAGE_MOCKS=false` (ou absent)

## Comportement panels critiques

Sans vision disponible sur un **panel critique**, la politique produit impose **revue manuelle** ou **échec** selon l’environnement (voir `visual-panel-qa.ts` et `run-premium-v3-pipeline`).
