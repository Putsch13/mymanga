## Premium V5 QA Report

### Automated checks run

- `pnpm --filter @manga-ai-studio/ai test`
- `pnpm --filter @manga-ai-studio/workflow test`
- `pnpm --filter @manga-ai-studio/web build`

### Scenario status

1. Extérieur post-apocalyptique avec héros seul
   - Better: richer `PanelContract`, readable background rules, stronger reroll pressure on empty decor.
   - Remaining gap: final vision QA is still heuristic, not image-understanding.

2. Jardin romantique avec duo
   - Better: location signals, floral anchors, structured hooks from outline to dialogue.
   - Remaining gap: emotional subtlety still depends on LLM quality.

3. Ruelle cyberpunk avec PNJ
   - Better: deterministic environment flavor, scene extras persisted per scene, complexity-aware routing.
   - Remaining gap: global PNJ persistence across multiple chapters is not fully canonical yet.

4. Laboratoire abandonné avec créature
   - Better: stronger environment props/signals, creature-aware environment hints, quality reroll.
   - Remaining gap: no vision model to confirm creature readability in final bitmap.

5. Arène / scène d’action
   - Better: crowd extras, routing pressure toward stronger providers on complex scenes, release score stored.
   - Remaining gap: motion readability is still prompt-validated, not visually parsed.

6. Close-up émotionnel
   - Better: environmental cues preserved through panel contract and prompt structure.
   - Remaining gap: close-up visual finesse remains sensitive to provider output variance.

### Before / after summary

- Before: continuity and premium QA were strongest after dialogue generation, but outline beats were still mostly unstructured.
- After: the outline itself now emits structured promises/consequences/hooks, and the rest of the pipeline inherits them.
- Before: scene extras existed but were effectively memory-only.
- After: scene extras persist in scene metadata and are reused deterministically within the scene lifecycle.
- Before: chapter quality existed panel-by-panel only.
- After: a chapter `qualityReport` is aggregated, persisted, and exposed to admin/debug.
