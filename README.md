# Manga AI Studio

Monorepo full-stack pour generer des chapitres manga/webtoon coherents avec memoire narrative, canon visuel, PNJ adaptatifs et generation multi-provider.

## Parcours principal

1. Creer un projet (pitch, genre, ton, style pack)
2. Definir personnages, style et univers
3. Creer un chapitre dans le studio 4 etapes (Brief → Casting → Plan → Generation)
4. Lire en manga pagine ou en webtoon vertical
5. Continuer la serie en gardant le canon

## Fonctionnalites

### Projets
- Pitch, genres, intensite, bible d'univers, style pack
- Curseurs creatifs (violence, romance, noirceur, realisme, rythme…)
- Navigation : Overview, Bible, Characters, Canon, Style visuel, Chapters, Pipeline, Assets, Settings, History

### Personnages
- Fiches completes avec refs visuelles, preview et fingerprint
- Prompts verrouilles via canon pack
- Preview IA et generation visuelle automatique

### Chapitres — Studio 4 etapes
- **Brief** : pitch, conflit principal, mode expert/simple (mode simple par defaut pour le chapitre 1)
- **Casting & Canon** : selection heros/antagonistes, decor principal, PNJ libres avec resolution IA
- **Plan** : contrat narratif, outline editoriale, outline de production, plan de production
- **Generation & Review** : pipeline complet, suivi temps reel, QA, rerolls

### PNJ & Creatures
- 35+ archetypes NPC (mentor, villain, rival, oracle, berserker, informateur, ghost…)
- 15+ creatures (dragon, oni, shinigami, golem, kaiju, spectre, familier, symbiote…)
- Moteur de resolution adaptatif : catalogue local + generation IA
- Endpoint API `/api/projects/[id]/npc-resolve`

### Pipeline chapitre (3 passes modulaires)
- Orchestrateur mince (~220 lignes) : setup DB → 3 appels sequentiels
- **Narrative pass** (~2030 lignes) : contexte projet, bundle (outline + script + storyboard), coherence, persistance scenes (Tx A/B/C/D atomiques avec `narrativeCommitId`), continuity engine
- **Image generation pass** (~1430 lignes) : boucle FAL, retry policy, shot compliance, coverage, recovery, cover art, quality report
- **Memory pass** (~200 lignes) : canon warnings, snapshot, memoire persistante, continuity diff, finalisation job
- Helpers purs extraits (`partitionNpcsByPolicy`, `computeDefaultForbiddenDrift`, `slugifyNpcName`, `applyShotPlanToContract`, `normalizeLocationName`) dans `packages/workflow/src/passes/narrative/`
- Logger JSON structure : `logPipelineInfo/Warn/Error` (voir P4.1)
- Outline structuree avec arc promises, world consequences, setup/payoff hooks
- 21 types de beats narratifs (setup, escalation, villain_introduction, flashback_trigger, body_horror_reveal…)
- Modes narratifs : linear, flashback_framed, flash_forward_framed, in_medias_res
- 16 modes de genre (shonen_combat, seinen_tension, dark_fantasy_gore, josei_adult, comedy_parody…)
- Anti-repetition : detection de similarite, phases narratives distinctes pour les beats generes
- Story quality gate : cliffhanger, micro-turns, payoff, respiration, variete de beats
- Directives gore conditionnelles pour dark fantasy

### Lecteur
- Manga pagine (simple/double page) et webtoon vertical
- TTS : bouton ecouter global + lecture inline des dialogues
- Debug panel : provider, workflow, reference policy, complexite, rerolls, findings vision
- Proxy image, URLs signees, retries d'images

### Images & Vision QA
- Provider principal : fal.ai (FLUX dev, LoRA, Redux)
- Secondaires : Runware, BFL, Stability
- Routing scene-first avec `subjectFocus` du blueprint (hero, npc, enemy, environment, group) prioritaire sur les heuristiques
- `crowdCritical` route vers `CHARACTER_IN_SCENE` (pas `ESTABLISHING_ENVIRONMENT`)
- Vision QA auto-activee sur panels critiques, throttle 80 appels/min
- Rerolls cibles : decor, fidelite personnage, interaction (seulement si vision QA executee), style, composition
- Detection effets magiques : signaux FR/EN dans le fact extractor, section dediee dans le prompt composer (pouvoir, gardienne, eveil, revelation…)
- Drift detector : word-boundary matching pour eviter les faux positifs de genre
- Log `[fal:routing]` pour tracer subjectFocus → panelCategory sur chaque panel
- Contenu mature/adulte : `safety_tolerance: "6"` sur FAL, modele `flux-realism` pour ADULT_EXPLICIT, negative prompt adaptatif par layer

### Autofill IA
- Completion automatique des champs manquants du studio
- Mode brief (genere le pitch) et mode all_missing (complete tout)
- Detection et message adapte pour les erreurs reseau/parsing

## Refonte etape 2 — Compilateur visuel de chapitre (avril 2026)

La generation des 70–75 images d'un chapitre passe par un **compilateur visuel canonique**, pas par des prompts texte libres.

### Pipeline cible
1. Chapitre valide en 10 temps (outline approuvee)
2. `ChapterImagePlanBuilder` — produit un plan complet des 70–75 images (`ChapterImagePlanItem[]`)
3. `CanonBindingResolver` — resout bindings canon + LoRA (univers, style, personnages, PNJ, lieux, props)
4. `buildCanonicalPromptRecipe` — assemble les sections logiques `[TAG]` du prompt en FR + EN
5. `translateStructuredPrompt` / `prompt-translator` — garantit un prompt final en anglais, sections preservees
6. `buildFalPromptPayload` — compile le `ProviderPayload` pour fal.ai (prompt EN + refs + negative + validation)
7. `validatePayloadForIntent` — preflight dur : refuse portrait sur establishing, hero framing sur prop, two_shot sans second sujet, etc.
8. `planRerollForPacket` — reroll packet-aware : conserve refs, memoire, continuite, hierarchie de sujet

### Taxonomie canonique `ImageIntentType` (core)
28 intents stables, groupes en familles (`hero`, `duo`, `other_character`, `group`, `cutaway`, `combat`, `dialogue`, `aftermath`, `magic`) :
- hero : `hero_focus`, `hero_action`, `hero_emotion`, `hero_reaction`, `hero_duo`, `hero_secondary_character`
- non-hero : `npc_focus`, `secondary_character_focus`, `enemy_focus`, `enemy_reveal`, `ally_focus`
- groupes : `guard_group_focus`, `soldier_patrol`, `threat_group_focus`, `crowd_presence`, `group_conflict`, `group_presence`
- cutaways : `environment_establishing`, `environment_transition`, `prop_insert`, `reaction_cutaway`, `symbolic_insert`, `aftermath`
- combat & dialogue : `combat_exchange`, `combat_turning_point`, `threat_presence`, `dialogue_two_shot`, `dialogue_anchor`
- autres : `magic_manifestation`

Helper `isNonHeroDominantIntent(intent)` — utilise par le recipe builder et le preflight pour interdire `hero_lock`/`hero_portrait` sur cutaways, groupes, PNJ focus, etc.

### `CanonicalImagePromptPacket`
Contrat unique envoye au provider : `packetVersion`, `projectId`, `chapterId`, `imageId`, `sourceBeatId`, intent, contentRating, universe/manga style, character/npc/prop/group context, continuity, bindings canon + LoRA, `promptSections[]`, `finalFrenchStructuredPrompt`, `finalEnglishStructuredPrompt`, `negativePromptEnglish`, `modelRoutingDecision`, `providerPayload`. Serialisable, auditable, reinjectable.

### Regle dure "manga medium"
Chaque prompt final contient toujours les sections `[MANGA_MEDIUM]` et `[VISUAL_STYLE]` avec :
- `Manga panel, manga visual language, consistent manga linework, manga composition and readability, same manga style as chapter canon.`
- Style encrage/ombrage/composition/reference manga explicites.

Preflight echoue si le prompt final n'inclut pas le token `manga` (`MISSING_MANGA_MEDIUM_TOKEN`).

### Hierarchie visuelle explicite
Chaque `ChapterImagePlanItem` porte :
- `imageIntentType`, `dominantSubject`, `secondarySubjects[]`
- `environmentPriority`, `characterPriority`, `npcPriority`, `propPriority`, `groupPriority` (0–100)
- `heroPresenceMode` ∈ `primary | secondary | silhouette | absent`, `heroVisualWeight` ∈ [0,1]
- `forbiddenFocus[]`, `forbiddenFraming[]`, `forbiddenPromptClauses[]`

Exemples :
- `environment_establishing` + hero present → `heroPresenceMode=silhouette`, `heroVisualWeight<0.3`, framing `wide`, forbid `portrait`/`close-up`
- `prop_insert` + hero present → `heroPresenceMode=absent`, `propPriority=95`, forbid `hero portrait`/`hero centered`
- `guard_group_focus` + hero present → `heroPresenceMode=secondary`, `groupPriority > characterPriority`, require group description
- `dialogue_two_shot` → `requiredReadableFaces.length ≥ 2`, `forbiddenSoloFraming=true`

### Traduction FR→EN controlee
`translateStructuredPrompt` : preserve les tags `[SECTION]`, les noms propres, les IDs canon, le rating. Filet de securite `detectResidualFrenchTokens` qui flagge toute derive (`héros`, `château`, `yeux bleus`…) residuelle dans le prompt final.

### Reroll packet-aware
`planRerollForPacket(packet, reason, attempt)` retourne un plan explicite :
- `drift_character` → `forcedReferencePolicy: STRONG`, refs face conservees, hint "keep canonical face"
- `drift_environment` → refs conservees, re-injecte `locationName` + `mustShowLocationSignals`
- `drift_style` → re-injecte style manga + inking
- `wrong_framing` → drop IP adapter refs, injecte negatifs de framing par intent
- `wrong_dominant_subject` → force intent-specific hints (`environment is the subject`, `prop is the subject`…)
- `policy_violation` → injecte les negatifs de rating (teen → nudity/explicit/gore interdits)
- `low_quality` → bump guidance + negatifs qualite
- `≥ 4 tentatives` → refuse reroll (`MAX_RETRIES_REACHED`)

`applyRerollPlanToPayload(payload, plan)` applique le plan de maniere non-destructive (append `[REROLL_HINTS]`, merge negatifs, bump guidance).

### Validation preflight par intent (fail-closed)
`validatePayloadForIntent` refuse les payloads contradictoires :
- `PORTRAIT_FRAMING_ON_ENVIRONMENT` — establishing avec tokens portrait/close-up
- `HERO_FRAMING_ON_PROP` — prop_insert avec tokens hero framing
- `SHARED_SPOTLIGHT_MISSING_SECOND_SUBJECT` — duo/two_shot avec < 2 visages lisibles
- `GROUP_INTENT_MISSING_GROUP_CONTEXT` — guard/crowd sans `groupContext`
- `DIALOGUE_TWO_SHOT_MISSING_SECOND_CHARACTER` — dialogue_two_shot avec < 2 personnages
- `RATING_INCOMPATIBLE_TOKEN` — teen/all_ages avec `nude`/`explicit`/`gore`…
- `MISSING_MANGA_MEDIUM_TOKEN` — prompt final sans `manga`

### Tests
- `chapter-image-plan-builder.test.ts` — 19 tests (routing intents, priorites, forbidden focus, plan 72 images, distribution, hero-bias warning)
- `canonical-prompt-recipe-builder.test.ts` — 13 golden tests par intent (manga guard, rating, sections obligatoires, group description, dialogue context, residual FR)
- `fal-prompt-payload-builder.test.ts` — payload shape, reference policy par intent, 7 regles preflight
- `packet-aware-reroll-advisor.test.ts` — plans par reason, max retries, application non-destructive
- `chapter-image-plan-from-narrative.test.ts` — adapter narrative → plan canonique (mapping subjectFocus, validation)

Total : **+45 tests** sur cette refonte. `packages/core` 99/99, `packages/ai` 271/271, `packages/workflow` 387/387 OK.

### Integration live dans le pipeline
Le compilateur visuel est cable dans le pipeline de production :

1. **`buildChapterImagePlanFromNarrative`** (`packages/workflow/src/chapter-image-plan-from-narrative.ts`)
   - Transforme `narrativeResult.plannedImages` + `baseMetadata.panelContract` en `ChapterImagePlanItem[]`
   - Appele dans `run-full-chapter-pipeline.ts` juste apres le narrative pass, avant l'image pass
   - Log la validation (`[pipeline:chapter-image-plan] items=N valid=bool issues=…`)
   - Helpers : `deriveContentRatingFromProject`, `deriveMangaStyleProfileFromStylePack`

2. **`buildCanonicalPacketForPlannedImage`** (`packages/workflow/src/canonical-packet-bridge.ts`)
   - Construit le `CanonicalImagePromptPacket` complet pour chaque `PlannedImage`
   - Injecte `buildCanonicalPromptRecipe` (sections FR+EN), `buildFalPromptPayload` (payload + preflight validation)
   - Mappe les personnages reels (`rawCharacters`) vers `CharacterContextEntry[]` avec presence/weight selon l'intent
   - Resout group/prop/npc/dialogue context a partir de `baseMetadata`
   - Appele dans `image-generation-pass.ts` en amont de la boucle de reroll

3. **Reroll packet-aware**
   - Dans la boucle de reroll, `planRerollForPacket(packet, reason, attempt)` est appele a chaque tentative
   - Mapping `rerollKind` -> `RerollReason` : `REROLL_CHARACTER_FIDELITY` -> `drift_character`, `REROLL_ENVIRONMENT` -> `drift_environment`, etc.
   - Les plans (`keepRefs`, `forcedReferencePolicy`, `extraNegativeTokens`, `extraPromptHints`) sont accumules dans `packetRerollPlans[]`
   - Non destructif : n'ecrase pas la logique rerollKind existante

4. **Persistance sur `SceneImage.metadata`**
   - `metadata.canonicalPacket` — packet JSON complet (auditable, reinjectable)
   - `metadata.canonicalPacketValidation` — resultat preflight (`valid`, `errors[]`, `warnings[]`)
   - `metadata.packetRerollPlans` — historique des plans de reroll packet-aware
   - Aucune migration Prisma requise (colonne `Json @default("{}")` deja presente)

## Sprint CTO P0 — Canonique comme source de verite runtime (avril 2026)

Cette passe finalise l'integration du compilateur visuel canonique (`CanonicalImagePromptPacket`) comme source de verite effective du pipeline d'images, et corrige les failles d'ownership/data-integrity restantes.

### P0.1 — `canonicalPacket` branche comme source de verite runtime
- Nouveau helper `packages/workflow/src/effective-prompt-source.ts` : `resolveEffectivePanelPromptSource({ canonicalPacket, legacyPanelPrompt, legacyNegativePrompt })` choisit automatiquement `finalEnglishStructuredPrompt`/`negativePromptEnglish` du packet s'ils sont valides, sinon fallback legacy.
- `image-generation-pass.ts` consomme l'effective source dans toutes les phases : preflight, generateAttempt, rerolls, reinforcement pass, detection de visual drift, quality gate.
- Tests unitaires : `packages/workflow/src/effective-prompt-source.test.ts`.

### P0.2 — `providerPayload` reconcilie avec le payload reellement envoye
- Apres chaque `generateAttempt` reussi, on met a jour `canonicalPacket.providerPayload` + `modelRoutingDecision` avec les decisions runtime (`finalModel`, `finalReferencePolicy`, `finalSize`, `finalSeed`, `refs` reels).
- Persistence : le packet final stocke sur `SceneImage.metadata.canonicalPacket` correspond exactement a ce qui a ete envoye au provider (plus de divergence avec `falTrace.requestPayload`).

### P0.3 — Retry route packet-aware
- Nouveau module `apps/web/lib/retry/retry-packet-resolver.ts` :
  - `resolveRetryPacketBase` lit `metadata.canonicalPacket` si present
  - `resolveEffectiveRetryOverrides` applique la fusion tri-state (`undefined`=preserve, `null`=clear, `string`=set)
  - `buildPacketAwareRetryPrompt` s'appuie sur `planRerollForPacket` de `@manga-ai-studio/ai`
  - `retryBodySchema` (Zod) valide strictement le body POST
- `apps/web/app/api/scene-images/[sceneImageId]/retry/route.ts` rejoue le contrat canonique au lieu d'un heritage partiel : `safeParse` + packet-aware reroll + repersistence du packet/prompt final.
- Tests : `apps/web/tests/retry-packet-resolver.test.ts`.

### P0.4 — `promptDebug` persiste et expose le prompt final reellement envoye
- `buildPromptDebugSnapshot` centralise la construction de `SceneImage.metadata.promptDebug` (finalPrompt, finalNegativePrompt, provider, model, referencePolicy, packetVersion, seed, refsCount, lorasCount, warnings, origin/retry).
- Persistence alignee sur **chaque generation** (pipeline principal + retry route) via `persistRetrySuccess` etendu.
- API `GET /api/projects/:id/chapters/:chapterId` expose desormais `promptDebug` complet + `canonicalPacket` (champs-cles) + `canonicalPacketValidation` + `packetRerollPlans`.
- UI `chapter-review-board.tsx` : bloc de debug visible sur chaque panel (prompt final, negatif, source, provider, modele, ref policy, seed, warnings, packet collapsible).

### P0.5 — Ownership et validation HTTP durcies
- `/api/projects/:id/pipeline-version` : `getOwnedProject` sur GET + POST, `upsert` (plus d'erreur au premier write), `safeParse` body.
- `/api/projects/:id/recurring-npcs/:npcId/promote` : ownership NPC scoped au projet, Zod strict, `prisma.$transaction` atomique pour create character + update NPC.
- `/api/projects/:id/relationships` : `safeParse` + verification que `sourceCharacterId` / `targetCharacterId` appartiennent au projet, refus d'auto-relations.

### P0.6 — Blocage des plans incomplets
- `buildGenerationJobInputFromSnapshot` (`apps/web/lib/premium-chapter-contract.ts`) leve desormais `IncompletePlanError` si `panelBlueprints.length < minimumImages`.
- L'expansion automatique via `expandBlueprintsToMinimum` est releguee derriere le flag legacy `MANGA_ALLOW_BLUEPRINT_EXPANSION_LEGACY=true`.
- Routes `/launch` et `/pipeline` remontent un 422 explicite (`PREMIUM_CONTRACT_INCOMPLETE_PLAN`) au lieu de generer silencieusement un contrat gonfle.
- Tests : `apps/web/tests/incomplete-plan-guard.test.ts`.

### Tests P0
- Suite complete verte : **379 tests `apps/web` + 393 tests `workflow` + 271 tests `ai`** (>1000 assertions au total).

---

## Sprint CTO P1 + P2 + P3 — Convergence packet canonique (avril 2026)

### P1.1 — Garde runtime "anglais effectif" avant envoi provider
- Nouveau `packages/workflow/src/prompt-language-guard.ts` (`evaluatePromptLanguage`, `enforcePromptLanguageGuard`, `ResidualFrenchPromptError`).
- Politique : `ok` si aucun token FR, `warn` si residus faibles (tracepersistee dans `promptDebug.warnings`), `block` si >= `blockThreshold` tokens FR critiques. Flag strict `MANGA_PROMPT_LANGUAGE_GUARD_STRICT=true` → 1 token suffit pour bloquer.
- Branche dans `image-generation-pass.ts` (base + rerolls + reinforcement) et dans `/api/scene-images/[sceneImageId]/retry/route.ts` avant `runRoutedImageGeneration`. Une requete FR residuelle est soit tracee (warn), soit refusee avec 422 (block).
- Tests : `packages/workflow/src/prompt-language-guard.test.ts` (7 tests).

### P1.2 — `sceneImageId` + `panelBlueprintId` dans le packet canonique
- `CanonicalImagePromptPacket` expose desormais `sceneImageId: string | null` et `panelBlueprintId: string | null` en plus de l'`imageId` synthetique.
- `canonical-packet-bridge` injecte l'identifiant DB direct et derive `panelBlueprintId` depuis `baseMetadata.panelBlueprintId / blueprintId` quand disponible.
- Permet l'audit et les rerolls sans dependre d'un identifiant synthetique `chapterId__pX__pnlY`.

### P1.3 — Mapping stable `sceneImageId → planItem`
- `buildStablePlanItemMap` (`packages/workflow/src/chapter-image-plan-from-narrative.ts`) construit une cle deterministe `${pageIndex}|${panelIndex}|${beatId}` a partir du `baseMetadata` de chaque plannedImage.
- Fallback ordre en cas de cle manquante + warning trace. Cardinality mismatch = erreur explicite (plus de mapping silencieusement decale).
- Tests : `chapter-image-plan-from-narrative-mapping.test.ts` (4 tests).

### P1.4 — `parseJsonBody` unifie pour les routes Next.js
- Nouveau `apps/web/lib/parse-json-body.ts` : `parseJsonBody(req, schema, options?)` renvoie `{ ok, data }` ou `{ ok:false, response }` avec 400 (JSON malforme) / 422 (Zod reject + `fieldErrors` detailles).
- Migration des routes priorite : `projects/[id]/pipeline-version`, `projects/[id]/relationships`, `projects/[id]/recurring-npcs/[npcId]/promote`. Plus de `.parse(await req.json())` en direct sur les routes publiques.
- Tests : `apps/web/tests/parse-json-body.test.ts` (6 tests).

### P1.5 — Review UI enrichie avec le packet canonique
- L'API `/api/projects/[id]/chapters/[chapterId]` expose deja `canonicalPacket.*`, `canonicalPacketValidation` et `packetRerollPlans`. Le composant `chapter-review-board.tsx` affiche maintenant :
  - l'`imageIntentType`, `heroPresenceMode`, `contentRating`
  - la decision de routing (modelId, referencePolicy, reason)
  - le `providerPayload` brut (details repliables)
  - le `finalEnglishStructuredPrompt` + `negativePromptEnglish`
  - les `buildWarnings` et les derniers `packetRerollPlans`
- `canonicalPacketValidation.valid === false` → affichage destructif inline avec les erreurs preflight.

### P2.1 — Enum central `CharacterRoleType`
- Nouveau `packages/core/src/types/character-role.ts` : `CHARACTER_ROLE_CANONICAL` + `normalizeCharacterRoleType` (retourne `{ role, confidence, raw }`) + `canonicalizeCharacterRoleType` + predicats `isHeroRole` / `isAntagonistRole` / `isSupportingRole` / `isNpcRole`.
- Gere toutes les variantes historiques (`main_hero`, `MAIN_CHARACTER`, `protagonist`, `villain`, `enemy`, `SECONDARY_CORE`, `pnj`, etc.) avec traçage du `confidence` (canonical / aliased / fallback).
- Premiere migration concrete : `roleTypeToRole` dans `chapter-image-plan-from-narrative.ts` delegue desormais au normaliseur central au lieu d'utiliser des regex locales.
- Tests : `packages/core/src/types/character-role.test.ts` (8 tests).

### P2.2 + P2.3 — Packet canonique comme source de verite + plan de migration
- QA (`runPanelQualityGate`) et retry (`planRerollForPacket`) consomment deja le prompt effectif issu du packet (heritage P0.1 + P0.3).
- Nouveau doc `docs/architecture/canonical-packet-migration.md` qui recapitule quelle surface consomme le packet, quelles surfaces restent legacy, et les regles de migration (pas de `panel.prompt` direct, toujours `resolveEffectivePanelPromptSource`, toujours persister `promptDebug`, jamais de divergence entre `canonicalPacket.providerPayload` et le payload reel).

### P3.1 — `*.tsbuildinfo` exclu des bundles d'audit
- Deja verrouille via `audit-bundle.mjs` + test `audit-bundle-policy.test.ts` (P3.1 initial). Verifie aussi que les artefacts ne sont pas trackes par git.

### P3.2 — Plan de refactor des gros fichiers
- Nouveau doc `docs/architecture/refactor-plan-large-files.md` qui analyse les 5 plus gros fichiers (`image-generation-pass.ts` 1924 lignes, `narrative-pass.ts` 2243 lignes, `retry/route.ts` 881 lignes, `manga-book-reader.tsx` 1129 lignes, `chapter-studio-editor.tsx` 603 lignes) et propose un plan d'extraction sprint par sprint, sans changement de signatures publiques.

### Tests P1 + P2 + P3
- Suite complete verte apres convergence : **107 tests `core` + 404 tests `workflow` + 271 tests `ai` + 385 tests `apps/web`** (total >1100 assertions).
- Nouveaux tests cibles : `prompt-language-guard` (7), `chapter-image-plan-from-narrative-mapping` (4), `parse-json-body` (6), `character-role` (8) = **25 tests supplementaires** pour verrouiller les changements P1/P2.

---

## Sprint CTO — Durcissement studio & fix bug `INCOMPLETE_PLAN` (avril 2026)

Cette passe supprime la divergence UI/backend autour des plans de production incomplets. Symptôme avant : un chapitre pouvait être présenté comme "prêt" côté studio alors que le backend refusait le launch avec `IncompletePlanError` (52 blueprints pour un minimum de 75). Fix : rendre le blocage explicite côté studio, avant tout appel pipeline.

### P0.1 — Readiness report bloque sur `panelBlueprints.length < minimumImages`
- `packages/core/src/types/chapter-studio-helpers.ts` : `buildChapterReadinessReport` calcule desormais `panelBlueprintCount` + `contractStatus` (`ok` / `missing_production_plan` / `missing_blueprints` / `incomplete_blueprints`) + `launchBlocked` + `launchBlockedReason`.
- Un plan avec `0 blueprint` ou `< minimumImages` produit un **blocant** (`production_plan_missing_blueprints` ou `production_plan_incomplete_blueprints`) avec CTA "Régénérer le plan" (`action: generate_outline`), plus un simple warning.
- `packages/core/src/types/chapter-studio.ts` : nouveaux schemas Zod `chapterContractStatusSchema` + `chapterLaunchBlockedReasonSchema` exposes via `chapterReadinessReportSchema` (champs optionnels pour compatibilite ascendante avec les snapshots persistes).
- Tests : `packages/core/src/types/chapter-studio-readiness.test.ts` (5 tests couvrant les 4 etats + absence de faux warning quand `targetImages > minimumImages`).

### P0.2 — Carte "Production Plan" affiche le statut contrat honnetement
- `apps/web/components/studio/production-plan-card.tsx` : nouvelle banniere de statut contrat (rouge si `panelBlueprints.length < minimumImages`, vert sinon) avec ratio explicite `52 / 75 blueprints`.
- Le mini-bloc "Panels planifies" utilise desormais rouge/vert au lieu de vert/jaune (l'ancienne couleur verte "si > 0" etait trompeuse : le backend refuse le launch dans ce cas).
- `data-testid="production-plan-contract-banner"` + `data-tone` pour les tests E2E/visuels.

### P0.3 — Validation du plan bloquee si contrat incomplet
- `apps/web/components/studio/chapter-studio-editor.tsx` : `onValidatePlan` priorise le blocant "plan" (production_plan_incomplete_blueprints / missing_blueprints / missing_production_plan) sur les autres blocants avant de rediriger vers `generation_review`.
- Si `readiness.launchBlocked === true`, le user reste sur l'etape `plan` et voit le message exact du blocant (pas un texte generique).

### P0.4 — Mapping UX unique pour `INCOMPLETE_PLAN`
- Nouveau helper `apps/web/app/(app)/projects/[id]/pipeline/_components/map-launch-error.ts` : `mapLaunchError(payload)` traduit les codes backend (`INCOMPLETE_PLAN`, `INVALID_BLUEPRINTS`, `SHOT_MONOTONY`, `premium_contract_incomplete`) en messages actionnables orientes studio (jamais de stack trace ni de code brut).
- Consomme par `apps/web/app/(app)/projects/[id]/pipeline/page.tsx` (pipeline legacy) et `apps/web/components/studio/chapter-generate-launcher.tsx` (studio flow).
- Le message `incomplete_plan` affiche le ratio `${panelBlueprintCount} blueprints pour un minimum de ${minimumImages}` + CTA "Régénérer le plan".
- Tests : `apps/web/tests/pipeline-launch-error-mapping.test.ts` (8 tests).

### P0.5 — `approved-outline` signale `launchBlocked` dans `premiumMeta` (Option B)
- `apps/web/app/api/projects/[id]/chapters/[chapterId]/approved-outline/route.ts` : quand le contrat reconstruit cote serveur (`buildPremiumChapterContractFromApprovedOutline`) sort avec `panelBlueprints.length < minimumImages`, on **persiste quand meme le snapshot** (Option B — evite de casser les flux partiels) mais on remonte `premiumMeta.launchBlocked = true`, `launchBlockedReason`, `minimumImages` + log `warn` visible cote serveur.
- Le front peut ainsi afficher une banniere "plan incomplet" persistante avant meme que le user tente un launch.

### P0.6 — Tests de regression
- `packages/core/src/types/chapter-studio.test.ts` : l'ancien test "warning si targetImages < minimumImages" devient "blocant si panelBlueprints vide" (contractStatus=missing_blueprints, launchBlocked=true).
- `apps/web/tests/chapter-studio-routes.test.ts` : nouveau test "readiness route expose le blocant incomplete_blueprints avec le ratio" (52/75 blueprints) + assertion `launchBlocked=true` dans `premiumMeta` de `approved-outline`.
- Fixture `buildReadyStudio()` mise a jour : 75 blueprints (varies en shotType pour eviter SHOT_MONOTONY) au lieu de 1 (ancien comportement incoherent avec P0.1).

### P0.7 — Flag legacy `MANGA_ALLOW_BLUEPRINT_EXPANSION_LEGACY` marque support-only
- `apps/web/lib/premium-chapter-contract.ts` : documentation explicite que le flag est support-only, ne doit jamais etre active en prod par defaut, et chaque activation laisse un log `warn` visible (`⚠️ LEGACY_EXPANSION_ACTIVE chapterId=X panelBlueprints_expanded N → M ...`).
- Le comportement reste inchange (flag valide, erreur bloquante par defaut), seule la visibilite operationnelle est renforcee.

### Regle produit posee
> Dans un contrat premium valide, `panelBlueprints.length >= minimumImages`. Toute divergence est un **blocant de studio** (pas un warning), et se soigne par "Régénérer le plan" — jamais par l'expansion automatique.

### Tests
- Suite complete verte : **112 tests `core` + 404 tests `workflow` + 271 tests `ai` + 394 tests `apps/web`** (total >1180 assertions).
- Nouveaux tests cibles : `chapter-studio-readiness` (5), `pipeline-launch-error-mapping` (8), `chapter-studio-routes` (+1 pour le readiness route + 1 pour launchBlocked) = **15 tests supplementaires** pour verrouiller le bug `INCOMPLETE_PLAN`.

---

## Assainissement CTO (P0 + P1 + P2 + P3 — avril 2026)

Une passe d'audit complete a ete appliquee pour garantir la fiabilite des donnees critiques (commits `9af57d1`, `04bf4ce`, puis les sprints CTO P0-P3). Voir `docs/architecture/image-urls.md` pour le detail des invariants URL.

### Sprint P0 — Routing & provenance (critiques)
- **P0.1** : `cutawayType` branche dans `buildRoutingContextV2` + `dominantSubject`. Un cutaway `environment`/`prop`/`aftermath` n'active plus jamais de `CHARACTER_LOCK` implicite.
- **P0.2** : `npc-resolver` durci avec Zod strict (`aiGeneratedNpcSchema`) + fallback controle (`buildControlledNpcFallback`) si la sortie IA est invalide ou OpenAI indisponible.
- **P0.3** : politique "Option B tracable" sur les `CharacterVisualRef` manuels — `metadata.source=manual_import`, `isCanonical=false`, `isPrimary` force a `false` sans `mediaAssetId`.
- **P0.4** : reroll/retry alignes sur le `dominantSubject` canonique via `mapCanonicalToComplianceDominantSubject` (fin des heuristiques locales divergentes).

### Sprint P1 — Hardening moteur
- **P1.1** : `species-resolver` — fin des `(prisma as any)`, `upsert` atomique via `prisma.$transaction`, versioning SHA-256 du prompt AI.
- **P1.2** : audit `enum-normalizer` — nouveau `readShotPlanEnumsFromJson` qui valide strictement les enums depuis un JSON et reporte les `unknowns` (fin des `as string` permissifs).
- **P1.3** : continuity engine — `detectTimelineViolations` (morts irreversibles, blessures non resolues, objets perdus sans acquisition) + `detectCausalityBreaks` (blessures appliquees puis evaporees).
- **P1.4** : decor/props/location hardening — `buildLocationMarkersLine` delegue a `resolveLocationVisualCanon` (architecture, props canon, palette, lighting, views). Nouveau `extractCriticalPropsFromPanelContractMeta` pour retenir les props `mustBeVisible` en retry.

### Sprint P2 — Tests & observabilite
- **P2.1** : tests route-level — `npc-resolve` (ownership, determinisme catalogue, fallback IA) + `generate-visual-guards` (guards purs extraits : `isCharacterLockExpected`, `shouldRefuseCharacterVisualForMissingRefs`, `resolveCharacterReferencePolicy`).
- **P2.2** : observabilite metier — `packages/workflow/src/lib/business-metrics.ts` emet 8 metriques typees (`hero_bias_on_non_hero_panel`, `npc_drift_detected`, `decor_drift_detected`, `panel_retry`, `npc_ai_fallback`, `image_persist_failed`, `manual_visual_ref_non_canonical`, `chapter_stability_score`). Agregables via `jq` / Loki / Datadog.
- **P2.3** : eval harness — `packages/workflow/src/evals/fixtures.ts` contient 10 fixtures couvrant hero-closeup, enemy-closeup-with-hero-present, reaction-npc, crowd-scene, prop-insert, environment-establishing, aftermath-panel, transition-panel, enemy-reveal-with-hero-absent, hero-action-no-cutaway. Chaque regression de `buildRoutingContextV2` ou `computeFalSceneAssessment` fait echouer le harness.

### Sprint P3 — Sealing
- **P3.1** : `*.tsbuildinfo` exclu du bundle d'audit (`audit-bundle.mjs`). Test de non-regression `audit-bundle-policy.test.ts` qui verrouille toutes les exclusions critiques (`.env`, `node_modules`, `.next`, `.git`, `*.log`).
- **P3.2** : contraintes DB sur provenance/storageProvider — migration `20260419_200000_p32_provenance_storage_constraints` :
  1. `MediaAsset.storageProvider ∈ {supabase, fal, external, other}` (CHECK enum).
  2. `storageProvider='supabase' ⇒ storageKey NOT NULL` (pas de Supabase sans cle re-signable).
  3. `CharacterVisualRef.mediaAssetId IS NULL ⇒ metadata.source='manual_import' AND metadata.isCanonical='false'` (fin de la canonisation silencieuse).
  4. Index unique partiel : au plus une `CharacterVisualRef` primary active par character.

### Storage & canon images
- Aucune URL temporaire ou signee n'entre jamais en DB (`assertStableImageUrl` + guard a l'ecriture)
- `persistGeneratedImageIfNeeded` retourne `{ ok, url, storageKey }` aligne sur le chemin Supabase reel
- Bucket prive : miniatures proxifiees via `/api/images/proxy`

### Canon personnage & lieu unifie
- Resolver unique `resolveCharacterVisualCanon` (lock > fingerprint > stableVisualDNA > visualProfile)
- Resolver unique `resolveLocationVisualCanon` (colonne `Location.visualRefs` avec refs stables cross-chapitre)
- Studio ↔ runtime lisent le meme canon (plus de drift)

### Matching robuste
- Retry scene-image : matching par ID (`panelCastData.focus?.characterId`, `metadata.characterIds[]`) avant fallback nom
- Lieux : `normalizeLocationName` (NFD, accents, casse, espaces)

### Atomicite narrative-pass
- `Chapter.narrativeCommitId` set UNIQUEMENT a la fin de Tx D ; un chapitre "stale" est detecte par `isStaleReady` dans l'API
- Soft-delete `CharacterVisualRef.archivedAt` pour le PATCH visualRefs (plus de destructif)
- Script CLI `cleanup-orphan-autogen-characters.ts` pour les PNJ auto orphelins

### Contrat API personnages
- Schema Zod `.strict()` partage entre UI et route PATCH (25+ champs voix/ADN/canon rules persistes, champ inconnu → 422)

### Observabilite
- Logger JSON structure `logPipeline(level, event, payload, ctx)`
- Schemas Zod de frontiere (`parseEntityRegistry`, `parseObjectStateTimeline`, `parseCharacterFingerprint`) avec degradation gracieuse si blob malforme
- `applyShotPlanToContract` pure function typee (fin des `(x as any).y = z`)

### Tests de non-regression
- `stable-image-url-guard.test.ts`, `location-matcher.test.ts`, `npc-important-detection.test.ts`
- `npc-auto-promotion.test.ts`, `pipeline-contracts.test.ts`, `apply-shot-plan-to-contract.test.ts`
- Sprint CTO P0-P3 : `routing-context.cutaway.test.ts`, `fal-scene-strategy.cutaway.test.ts`, `compliance-dominant-subject.test.ts`, `npc-resolver.test.ts`, `manual-visual-ref-policy.test.ts`, `species-resolver.integration.test.ts`, `run-continuity-diff.timeline.test.ts`, `build-location-markers.test.ts`, `extract-critical-props.test.ts`, `generate-visual-guards.test.ts`, `npc-resolve-route.test.ts`, `business-metrics.test.ts`, `evals/fixtures.test.ts`, `audit-bundle-policy.test.ts`, `migration-p32-constraints.test.ts`
- **Suite complete verte** : 349 tests `apps/web` + 21 fichiers `workflow` + 37 fichiers `ai` + 5 fichiers `continuity` + 4 fichiers `world` + 3 fichiers `core` + 2 fichiers `memory`

## Architecture

```mermaid
flowchart TB
  UI[Next.js App Router] --> API[Route Handlers]
  API --> DB[(PostgreSQL + Prisma)]
  API --> SB[Supabase Auth + Storage]
  API --> OAI[OpenAI]
  API --> FAL[fal.ai]
  API --> ING[Inngest]
  API --> STRIPE[Stripe]
  DB --> MEM[Memory + Continuity]
  MEM --> ORCH[Orchestrateur pipeline]
  ORCH --> NP[Narrative pass]
  ORCH --> IP[Image generation pass]
  ORCH --> MP[Memory pass]
  NP --> IP
  IP --> MP
```

Stack :

- Frontend : Next.js 15, React 19, Tailwind v4, shadcn
- Backend : route handlers Next.js + packages TypeScript
- Data : PostgreSQL, Prisma, pgvector
- Auth/Storage : Supabase
- Orchestration : Inngest avec fallback synchrone
- Texte : OpenAI
- Image : fal principal, Runware/BFL/Stability secondaires

## Structure du depot

```text
MYMANGA/
├── apps/web/                   # App Next.js, UI et routes API
├── packages/ai/                # Prompts, image routing, QA vision, fingerprints, genre director
├── packages/workflow/          # Pipeline chapitre (orchestrateur + 3 passes modulaires)
├── packages/world/             # SceneBlueprint, ontologies NPC/creatures, NPC resolver
├── packages/continuity/        # Canon, snapshots, diff, validation
├── packages/memory/            # RAG, scene extras, memoire persistante
├── packages/core/              # Types partages et contrats
├── packages/db/                # Schema Prisma
├── packages/billing/           # Stripe, wallet, ledger
├── packages/moderation/        # Garde-fous contenu/provider
├── packages/config/            # Configuration partagee
├── packages/exports/           # Export manga/PDF
├── packages/ui/                # Composants UI partages
├── docs/                       # Architecture et glossaire routes
└── render.yaml                 # Blueprint Render
```

## Routes principales

| Route | Role |
|---|---|
| `/projects/[id]` | Hub projet (overview, tuiles, arcs, chapitres recents) |
| `/projects/[id]/style` | Configuration style visuel |
| `/projects/[id]/pipeline` | Pipeline de generation (ex /generate) |
| `/projects/[id]/chapters/[id]/edit` | Studio chapitre 4 etapes |
| `/projects/[id]/chapters/[id]/generate` | Suivi temps reel de la generation |
| `/projects/[id]/chapters/[id]/read` | Lecteur manga/webtoon |
| `/projects/[id]/chapters/[id]/review` | Review QA |
| `/projects/[id]/studio` | Redirect vers le dernier chapitre |

## API principale

| Methode | Route | Role |
|---|---|---|
| `GET/POST` | `/api/projects` | Projets |
| `GET/POST` | `/api/projects/[id]/characters` | Personnages |
| `POST` | `/api/characters/[id]/generate-visual` | Preview visuel personnage |
| `POST` | `/api/projects/[id]/chapters` | Brouillon chapitre |
| `POST` | `/api/projects/[id]/pipeline` | Lancer pipeline |
| `POST` | `/api/projects/[id]/npc-resolve` | Resolution PNJ (catalogue + IA) |
| `POST` | `/api/projects/[id]/chapters/[id]/autofill` | Completion IA |
| `POST` | `/api/projects/[id]/chapters/[id]/launch` | Lancer generation chapitre |
| `GET` | `/api/projects/[id]/chapters/[id]` | Data reader + debug |
| `POST` | `/api/scene-images/[id]/retry` | Reroll image |
| `POST` | `/api/tts` | Text-to-speech |
| `GET` | `/api/diagnostics/public` | Checks prod sans secrets |

## Installation locale

```bash
pnpm install
pnpm db:generate
pnpm db:push
pnpm dev
```

Commandes utiles :

| Commande | Role |
|---|---|
| `pnpm dev` | Lance le site |
| `pnpm build` | Build prod |
| `pnpm db:generate` | Prisma generate |
| `pnpm db:push` | Sync schema |
| `pnpm db:studio` | Prisma Studio |
| `pnpm --filter @manga-ai-studio/ai test` | Tests IA |
| `pnpm --filter @manga-ai-studio/workflow test` | Tests workflow |
| `pnpm --filter @manga-ai-studio/world test` | Tests QA world |
| `pnpm --filter @manga-ai-studio/web build` | Build app web |

## Variables d'environnement

Critiques :

- `DATABASE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STORAGE_BUCKET`
- `FAL_KEY`
- `OPENAI_API_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `NEXT_PUBLIC_APP_URL`
- `INNGEST_EVENT_KEY`
- `INNGEST_SIGNING_KEY`

Optionnelles :

- `BFL_API_KEY`
- `RUNWARE_API_KEY`
- `STABILITY_API_KEY`
- `ADMIN_UNLIMITED_EMAILS`
- `POSTHOG_KEY`
- `SENTRY_DSN`
- `OPENAI_VISION_MODEL`
- `ENABLE_PREMIUM_VISION_QA`
- `ENABLE_CHARACTER_VISION_FINGERPRINT`

Dev local minimal :

```env
AUTH_DISABLED=true
DATABASE_URL=postgresql://...
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

Ne jamais laisser `AUTH_DISABLED=true` en production.

## Deploiement Render

Build command :

```bash
npm install -g pnpm@10.33.0 && pnpm install --frozen-lockfile && pnpm --filter @manga-ai-studio/db exec prisma generate && pnpm --filter @manga-ai-studio/web build
```

Start command :

```bash
pnpm --filter @manga-ai-studio/web start
```

Checklist :

1. Renseigner toutes les variables critiques
2. Verifier `NEXT_PUBLIC_APP_URL`
3. Ne pas definir `AUTH_DISABLED`
4. Executer `pnpm --filter @manga-ai-studio/db exec prisma migrate deploy` (inclut la migration P3.2 `20260419_200000_p32_provenance_storage_constraints` : CHECK enum `storageProvider`, NOT NULL `storageKey` si Supabase, provenance manuelle tracable, unique primary ref active)
5. Verifier `GET /api/diagnostics/public`
6. Confirmer `hasFalKey=true`, `hasOpenAI=true`, `authDisabled=false`
7. Lancer un chapitre test

Si `prisma migrate deploy` echoue sur P3.2 avec une violation de contrainte
`MediaAsset_supabase_requires_storage_key`, exécuter le preflight fix :

```bash
pnpm --filter @manga-ai-studio/db exec prisma db execute \
  --file prisma/p32-fix-mediaasset-supabase-storagekey.sql \
  --schema prisma/schema.prisma
```

## Base de donnees

Schema : `packages/db/prisma/schema.prisma`

Modeles principaux : Project, Character, Chapter, ChapterScene, SceneImage, MemorySnapshot, Job, RagDocument, Wallet, NpcCanonPack, CharacterPropInventory

## Paiement et tokens

- Stripe alimente le wallet
- Le wallet et le ledger sont la source de verite
- Les comptes admin QA peuvent etre illimites

## Cout IA par chapitre

Ordre de grandeur pour un chapitre premium de 10 pages :

| Poste | Hypothese | Cout approx. |
|---|---|---|
| Panels | 40-60 images 768x1024 via fal | ~0.58-0.95 USD |
| Style frame + keyframes + cover | Refs et couverture | ~0.13 USD |
| Rerolls QA | Decor / interaction / drift | ~0.03-0.10 USD |
| Texte + embeddings | Outline, dialogues, passes, memoire | ~0.03-0.06 USD |
| **Total** | Pipeline complet | **~0.77-1.24 USD** |

## Statuts de generation

- `FULLY_OPERATIONAL`
- `DEGRADED_NO_OPENAI` (Service d'ecriture indisponible)
- `DEGRADED_NO_IMAGE_PROVIDER` (Service d'image indisponible)
- `DEGRADED_STORAGE_MISSING`
- `DEGRADED_DIALOGUE_FALLBACK`
- `DEGRADED_OUTLINE_FALLBACK`

Un chapitre degrade sort en `partial_success`.
