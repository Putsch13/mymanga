# Canonical Packet Migration — État et stratégie

Statut : _living document_ — mis à jour à chaque sprint qui touche à la
génération d'image.

## Contexte

Le repo contient deux runtimes de génération d'image qui ont coexisté :

1. **Legacy** — prompts libres construits par `manga-prompt-composer.ts`,
   consommés directement par `runRoutedImageGeneration`.
2. **Canonique** — `CanonicalImagePromptPacket` produit par le
   `canonical-packet-bridge`, passé ensuite au `FalPromptPayloadBuilder` pour
   cristalliser un `providerPayload` anglais structuré.

P0 (sprint CTO 2025-12) a branché le packet canonique **comme source de
vérité runtime** quand il est disponible. P1 a verrouillé l'identité
(`sceneImageId`/`panelBlueprintId`), le mapping stable, et la garde
linguistique anglaise. P2 documente l'état et la stratégie de convergence.

## Statut actuel (post-P1)

| Surface | Source de vérité | Fallback legacy | Flag |
|---|---|---|---|
| Génération panel initiale (`image-generation-pass`) | `canonicalPacket.finalEnglishStructuredPrompt` | `panel.prompt` legacy | automatique |
| `providerPayload` persisté (`SceneImage.metadata.canonicalPacket.providerPayload`) | reflète **exactement** le payload envoyé à FAL | n/a | reconcilié en runtime |
| Retry `/api/scene-images/[sceneImageId]/retry` | `metadata.canonicalPacket` si présent + `planRerollForPacket` | prompt legacy + `buildRetryPrompts` | automatique |
| QA (`runPanelQualityGate`) | `effectivePositivePrompt` (= packet ou legacy) | n/a | n/a |
| Reroll advisor (`planRerollForPacket`) | `canonicalPacket` | n/a | packet-only |
| Review UI (`chapter-review-board`) | `metadata.promptDebug.finalPrompt` + `canonicalPacket.*` | `sceneImage.prompt` (affiché comme "source") | n/a |
| Reader API (`/api/projects/.../chapters/[chapterId]`) | expose `promptDebug`, `canonicalPacket`, `canonicalPacketValidation`, `packetRerollPlans` | n/a | n/a |
| Blocage plans incomplets | `IncompletePlanError` (P0.6) | expansion legacy | `MANGA_ALLOW_BLUEPRINT_EXPANSION_LEGACY=true` |
| Garde langue provider (P1.1) | `evaluatePromptLanguage` (warn/block) | n/a | `MANGA_PROMPT_LANGUAGE_GUARD_STRICT=true` |

## Ce qui reste legacy

- `manga-prompt-composer.ts` et `buildRetryPrompts` restent utilisés quand
  aucun `canonicalPacket` n'existe pour un panel — typiquement les chapitres
  anciens générés avant l'introduction du packet, ou les rerolls avant
  qu'un packet ne soit attaché.
- `panel-blueprint-builder.ts` produit encore des blueprints via la pipeline
  narrative V1 quand le narrative-pass n'a pas rempli `panelBlueprints`.
  Ce fallback est gardé uniquement derrière le flag
  `MANGA_ALLOW_BLUEPRINT_EXPANSION_LEGACY`.

## Règles de migration

1. **Ne plus écrire de code qui utilise `panel.prompt` directement** dans
   `image-generation-pass.ts` ou les routes `retry`. Toujours passer par
   `resolveEffectivePanelPromptSource({ canonicalPacket, ... })`.
2. **Toujours persister `promptDebug`** pour chaque envoi (génération
   initiale ou retry). C'est la source de vérité UI.
3. **Ne pas diverger `canonicalPacket.providerPayload`** du payload réel.
   Si une décision runtime modifie le payload (model, refs, seed), il faut
   mettre à jour le packet avant persistance.
4. **roleType** — utiliser `canonicalizeCharacterRoleType` (P2.1) plutôt
   que d'écrire un regex local `/hero|protagon/`.
5. **Validation HTTP** — utiliser `parseJsonBody(req, schema)` (P1.4)
   plutôt que `.parse(await req.json())` directement.

## Ordre de convergence recommandé

1. Faire en sorte que **tout chapitre neuf** ait un `canonicalPacket` pour
   chaque `SceneImage` (backlog P2).
2. Migrer les rerolls de chapitres legacy via une tâche de backfill qui
   reconstruit un packet à partir du blueprint existant.
3. Une fois la parité atteinte, supprimer la branche `source=legacy` dans
   `resolveEffectivePanelPromptSource` et faire du packet la condition de
   génération (pas juste la préférence).

## Références code

- `packages/core/src/types/canonical-image-prompt-packet.ts`
- `packages/workflow/src/canonical-packet-bridge.ts`
- `packages/workflow/src/effective-prompt-source.ts` — source de vérité
  prompt runtime.
- `packages/workflow/src/prompt-language-guard.ts` — garde FR résiduel.
- `apps/web/lib/retry/retry-packet-resolver.ts` — overrides tri-état + packet
  reroll.
- `apps/web/lib/parse-json-body.ts` — parsing unifié body JSON + Zod.
- `packages/core/src/types/character-role.ts` — enum central roleType.
