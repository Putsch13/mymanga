# Premium Pipeline P0

## P0.1 — Résolution panel premium

- Centralisation des tailles premium dans `packages/ai/src/image-generation-config.ts`.
- `PANEL_DRAFT` passe en `768x1024` et le reroll réutilise exactement la même taille.
- `CHARACTER_SHEET` et `PANEL_FINAL` utilisent aussi des presets explicites, avec cible d'upscale future documentée.
- Critère QA: plus aucun `512x768` dans `run-full-chapter-pipeline.ts`.

## P0.2 — Fallbacks visibles et non silencieux

- Statuts normalisés ajoutés dans `packages/ai/src/generation-status.ts`.
- Outline et dialogues remontent désormais un `degradedStatus`, un `usedFallback` et une `fallbackReason`.
- Les jobs, l'API chapitre et l'UI de génération/lecture exposent maintenant ces drapeaux.
- Un chapitre dégradé sort en `partial_success` au lieu de paraître pleinement premium.

## Logs et QA

- Logs structurés ajoutés pour `DEGRADED_OUTLINE_FALLBACK` et `DEGRADED_DIALOGUE_FALLBACK`.
- Tests automatisés ajoutés sur:
  - presets d'image premium
  - priorisation des statuts dégradés
  - visibilité explicite des fallbacks outline/dialogue
