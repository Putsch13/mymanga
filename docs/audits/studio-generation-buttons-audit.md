# Audit — boutons et actions « génération » (studio)

**Date :** 2026-04-28  
**Objectif :** En production avec `PIPELINE_V3_PREMIUM_ONLY=true`, un chapitre premium ne doit être lancé que via  
`POST /api/projects/[id]/chapters/[chapterId]/launch`.

## Résumé

| Zone | Action « lancer chapitre » | Route HTTP | Autorisé prod premium-only |
|------|----------------------------|------------|----------------------------|
| `chapter-generate-launcher.tsx` | Bouton « Lancer la génération » | `POST .../chapters/{chapterId}/launch` (via `launchChapterGeneration`) | Oui |
| `chapter-studio-editor.tsx` | Sauvegarde studio, estimate, autofill | `PATCH .../studio`, `POST .../chapters/estimate`, `POST .../autofill` | Oui (pas un lancement pipeline complet) |
| `chapter-review-board.tsx` | QA / complétion review | `POST .../qa-report`, `POST .../review/complete` | Oui |
| `generation-progress-board.tsx` | Rafraîchir stats chapitre | `GET`/`fetch` chapitre (lecture) | Oui |
| `chapter-cast-canon-step.tsx` | PNJ / promote / resolve | `GET/POST` recurring-npcs, npc-resolve | Oui |
| `chapter-visual-contract-policy-panel.tsx` | Contrat visuel UI | `fetch .../visual-contract-ui` | Oui |
| `chapter-plan-step.tsx`, `production-plan-card.tsx`, etc. | Texte d’aide mentionnant « pipeline » | Aucun `fetch` vers `/pipeline` | N/A |

## Client canonique

- Fichier : `apps/web/lib/studio/launch-chapter-generation.ts`
- Fonction : `launchChapterGeneration({ projectId, chapterId })`
- Payload : `{ mode: "premium", source: "studio" }`

## Routes volontairement bloquées en prod (ou réservées hors lancement chapitre)

- `POST /api/projects/[id]/pipeline` → `409` + `premium_only_launch_route_required` si prod + premium-only.
- `POST /api/jobs/[jobId]/run-now` (job `GENERATE_CHAPTER_SCRIPT`) → `409` + `run_now_disabled_in_premium_only`.
- `POST /api/ai/generate` → `403` + `dev_image_generate_route_disabled` si `NODE_ENV=production`.
- `POST /api/estimate-image` → `403` + `dev_estimate_image_route_disabled` si `NODE_ENV=production`.

## Page Pipeline (hors studio)

La page `app/(app)/projects/[id]/pipeline/page.tsx` appelle encore `POST .../pipeline` pour les flux historiques / dev ; ce n’est pas le chemin studio chapitre. Les auteurs en prod premium-only doivent passer par **Studio chapitre → Génération**.

## Tests anti-régression

- `apps/web/tests/studio-generation-route.test.ts` — interdit les sous-chaînes d’URL legacy dans `components/studio/*` (hors fichiers `.test.ts`).
- `apps/web/tests/api-route-inventory.test.ts` — garde-fous sur les routes API ci-dessus.
