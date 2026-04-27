# API Routes Inventory (Generated)

> Auto-généré par `pnpm audit:routes`
> Ne pas modifier manuellement.

> Généré le: 2026-04-27T16:49:27.601Z

## Résumé

- Total routes: 58
- Routes qui écrivent Chapter: 17
- Routes qui écrivent SceneImage: 5
- Routes qui créent Job: 3
- Routes qui lancent Inngest: 0
- Routes qui appellent FAL: 6
- Routes qui modifient approvedOutline: 9
- Routes qui modifient productionPlan: 9

## Routes à risque

| Route | Methods | Writes Chapter | Writes SceneImage | Creates Job | FAL | Action |
|-------|---------|----------------|-------------------|-------------|-----|--------|
| `/api/ai/generate` | POST | ❌ | ❌ | ❌ | ✅ | **audit** |
| `/api/chapters/[chapterId]/export/pdf` | GET, POST | ✅ | ❌ | ❌ | ❌ | **audit** |
| `/api/characters/[characterId]/canon-evolution` | GET | ✅ | ❌ | ❌ | ❌ | **audit** |
| `/api/characters/[characterId]/generate-visual` | POST | ❌ | ❌ | ❌ | ✅ | **audit** |
| `/api/diagnostics/admin` | GET | ❌ | ✅ | ❌ | ✅ | **audit** |
| `/api/diagnostics/public` | GET | ❌ | ❌ | ❌ | ✅ | **audit** |
| `/api/internal/premium-run-audit/[chapterId]` | GET | ✅ | ❌ | ❌ | ❌ | **audit** |
| `/api/projects/[id]/canon-health` | GET | ❌ | ✅ | ❌ | ❌ | **audit** |
| `/api/projects/[id]/chapters/[chapterId]/approved-outline` | PATCH | ✅ | ❌ | ❌ | ❌ | **audit** |
| `/api/projects/[id]/chapters/[chapterId]/autofill` | POST | ✅ | ❌ | ❌ | ❌ | **audit** |
| `/api/projects/[id]/chapters/[chapterId]/canon-state` | GET | ✅ | ❌ | ❌ | ❌ | **audit** |
| `/api/projects/[id]/chapters/[chapterId]/chapter-health` | GET | ✅ | ❌ | ❌ | ❌ | **audit** |
| `/api/projects/[id]/chapters/[chapterId]/continue` | POST | ✅ | ❌ | ✅ | ❌ | **audit** |
| `/api/projects/[id]/chapters/[chapterId]/launch` | POST | ✅ | ❌ | ✅ | ✅ | **keep** |
| `/api/projects/[id]/chapters/[chapterId]/qa-report` | GET | ✅ | ❌ | ❌ | ❌ | **audit** |
| `/api/projects/[id]/chapters/[chapterId]/readiness` | GET | ✅ | ❌ | ❌ | ❌ | **audit** |
| `/api/projects/[id]/chapters/[chapterId]/review/complete` | POST | ✅ | ❌ | ❌ | ❌ | **audit** |
| `/api/projects/[id]/chapters/[chapterId]` | GET, PATCH, DELETE | ✅ | ❌ | ❌ | ❌ | **audit** |
| `/api/projects/[id]/chapters/[chapterId]/studio` | GET, PATCH | ✅ | ❌ | ❌ | ❌ | **audit** |
| `/api/projects/[id]/chapters/estimate` | POST | ✅ | ❌ | ❌ | ❌ | **audit** |
| `/api/projects/[id]/chapters` | GET, POST | ✅ | ❌ | ❌ | ❌ | **audit** |
| `/api/projects/[id]/pipeline` | POST | ✅ | ❌ | ✅ | ❌ | **delegate** |
| `/api/scene-images/[sceneImageId]/debug` | GET | ❌ | ✅ | ❌ | ❌ | **audit** |
| `/api/scene-images/[sceneImageId]/retry` | POST | ❌ | ✅ | ❌ | ✅ | **audit** |
| `/api/scene-images/[sceneImageId]/validate` | POST | ❌ | ✅ | ❌ | ❌ | **audit** |

## Détail par route

### `/api/account/age-gate`

- **Methods**: POST
- **Classification**: audit
- **Action recommandée**: audit

| Check | Status |
|-------|--------|
| Writes Project | Non |
| Writes Chapter | Non |
| Writes SceneImage | Non |
| Creates Job | Non |
| Lances Inngest | Non |
| Calls FAL | Non |
| Modifies approvedOutline | Non |
| Modifies productionPlan | Non |

### `/api/account/me`

- **Methods**: GET
- **Classification**: audit
- **Action recommandée**: audit

| Check | Status |
|-------|--------|
| Writes Project | Non |
| Writes Chapter | Non |
| Writes SceneImage | Non |
| Creates Job | Non |
| Lances Inngest | Non |
| Calls FAL | Non |
| Modifies approvedOutline | Non |
| Modifies productionPlan | Non |

### `/api/ai/generate`

- **Methods**: POST
- **Classification**: legacy
- **Action recommandée**: audit

| Check | Status |
|-------|--------|
| Writes Project | ⚠️ Oui |
| Writes Chapter | Non |
| Writes SceneImage | Non |
| Creates Job | Non |
| Lances Inngest | Non |
| Calls FAL | ⚠️ Oui |
| Modifies approvedOutline | Non |
| Modifies productionPlan | Non |

**Notes:**
- Legacy/dev only, interdit en premium chapter

### `/api/billing/checkout-session`

- **Methods**: POST
- **Classification**: audit
- **Action recommandée**: audit

| Check | Status |
|-------|--------|
| Writes Project | Non |
| Writes Chapter | Non |
| Writes SceneImage | Non |
| Creates Job | Non |
| Lances Inngest | Non |
| Calls FAL | Non |
| Modifies approvedOutline | Non |
| Modifies productionPlan | Non |

### `/api/billing/webhooks/stripe`

- **Methods**: POST
- **Classification**: audit
- **Action recommandée**: audit

| Check | Status |
|-------|--------|
| Writes Project | Non |
| Writes Chapter | Non |
| Writes SceneImage | Non |
| Creates Job | Non |
| Lances Inngest | Non |
| Calls FAL | Non |
| Modifies approvedOutline | Non |
| Modifies productionPlan | Non |

### `/api/chapters/[chapterId]/export/pdf`

- **Methods**: GET, POST
- **Classification**: audit
- **Action recommandée**: audit

| Check | Status |
|-------|--------|
| Writes Project | Non |
| Writes Chapter | ⚠️ Oui |
| Writes SceneImage | Non |
| Creates Job | Non |
| Lances Inngest | Non |
| Calls FAL | Non |
| Modifies approvedOutline | Non |
| Modifies productionPlan | Non |

### `/api/characters/[characterId]/canon-evolution`

- **Methods**: GET
- **Classification**: audit
- **Action recommandée**: audit

| Check | Status |
|-------|--------|
| Writes Project | Non |
| Writes Chapter | ⚠️ Oui |
| Writes SceneImage | Non |
| Creates Job | Non |
| Lances Inngest | Non |
| Calls FAL | Non |
| Modifies approvedOutline | Non |
| Modifies productionPlan | Non |

### `/api/characters/[characterId]/generate-visual`

- **Methods**: POST
- **Classification**: audit
- **Action recommandée**: audit

| Check | Status |
|-------|--------|
| Writes Project | ⚠️ Oui |
| Writes Chapter | Non |
| Writes SceneImage | Non |
| Creates Job | Non |
| Lances Inngest | Non |
| Calls FAL | ⚠️ Oui |
| Modifies approvedOutline | Non |
| Modifies productionPlan | Non |

### `/api/characters/[characterId]`

- **Methods**: GET, PATCH, DELETE
- **Classification**: audit
- **Action recommandée**: audit

| Check | Status |
|-------|--------|
| Writes Project | Non |
| Writes Chapter | Non |
| Writes SceneImage | Non |
| Creates Job | Non |
| Lances Inngest | Non |
| Calls FAL | Non |
| Modifies approvedOutline | Non |
| Modifies productionPlan | Non |

### `/api/characters/[characterId]/train-lora`

- **Methods**: POST
- **Classification**: audit
- **Action recommandée**: audit

| Check | Status |
|-------|--------|
| Writes Project | Non |
| Writes Chapter | Non |
| Writes SceneImage | Non |
| Creates Job | Non |
| Lances Inngest | Non |
| Calls FAL | Non |
| Modifies approvedOutline | Non |
| Modifies productionPlan | Non |

### `/api/diagnostics/admin`

- **Methods**: GET
- **Classification**: audit
- **Action recommandée**: audit

| Check | Status |
|-------|--------|
| Writes Project | Non |
| Writes Chapter | Non |
| Writes SceneImage | ⚠️ Oui |
| Creates Job | Non |
| Lances Inngest | Non |
| Calls FAL | ⚠️ Oui |
| Modifies approvedOutline | Non |
| Modifies productionPlan | Non |

### `/api/diagnostics/public`

- **Methods**: GET
- **Classification**: audit
- **Action recommandée**: audit

| Check | Status |
|-------|--------|
| Writes Project | Non |
| Writes Chapter | Non |
| Writes SceneImage | Non |
| Creates Job | Non |
| Lances Inngest | Non |
| Calls FAL | ⚠️ Oui |
| Modifies approvedOutline | Non |
| Modifies productionPlan | Non |

### `/api/estimate-image`

- **Methods**: POST
- **Classification**: debug
- **Action recommandée**: audit

| Check | Status |
|-------|--------|
| Writes Project | Non |
| Writes Chapter | Non |
| Writes SceneImage | Non |
| Creates Job | Non |
| Lances Inngest | Non |
| Calls FAL | Non |
| Modifies approvedOutline | Non |
| Modifies productionPlan | Non |

**Notes:**
- Dev/tooling only, interdit en premium chapter

### `/api/images/proxy`

- **Methods**: GET
- **Classification**: audit
- **Action recommandée**: audit

| Check | Status |
|-------|--------|
| Writes Project | Non |
| Writes Chapter | Non |
| Writes SceneImage | Non |
| Creates Job | Non |
| Lances Inngest | Non |
| Calls FAL | Non |
| Modifies approvedOutline | Non |
| Modifies productionPlan | Non |

### `/api/inngest`

- **Methods**: none
- **Classification**: audit
- **Action recommandée**: audit

| Check | Status |
|-------|--------|
| Writes Project | Non |
| Writes Chapter | Non |
| Writes SceneImage | Non |
| Creates Job | Non |
| Lances Inngest | Non |
| Calls FAL | Non |
| Modifies approvedOutline | Non |
| Modifies productionPlan | Non |

### `/api/internal/premium-run-audit/[chapterId]`

- **Methods**: GET
- **Classification**: audit
- **Action recommandée**: audit

| Check | Status |
|-------|--------|
| Writes Project | Non |
| Writes Chapter | ⚠️ Oui |
| Writes SceneImage | Non |
| Creates Job | Non |
| Lances Inngest | Non |
| Calls FAL | Non |
| Modifies approvedOutline | ⚠️ Oui |
| Modifies productionPlan | ⚠️ Oui |

### `/api/jobs/[jobId]/cancel`

- **Methods**: POST
- **Classification**: audit
- **Action recommandée**: audit

| Check | Status |
|-------|--------|
| Writes Project | Non |
| Writes Chapter | Non |
| Writes SceneImage | Non |
| Creates Job | Non |
| Lances Inngest | Non |
| Calls FAL | Non |
| Modifies approvedOutline | Non |
| Modifies productionPlan | Non |

### `/api/jobs/[jobId]`

- **Methods**: GET
- **Classification**: audit
- **Action recommandée**: audit

| Check | Status |
|-------|--------|
| Writes Project | Non |
| Writes Chapter | Non |
| Writes SceneImage | Non |
| Creates Job | Non |
| Lances Inngest | Non |
| Calls FAL | Non |
| Modifies approvedOutline | Non |
| Modifies productionPlan | Non |

### `/api/jobs/[jobId]/run-now`

- **Methods**: POST
- **Classification**: canonical
- **Action recommandée**: audit

| Check | Status |
|-------|--------|
| Writes Project | Non |
| Writes Chapter | Non |
| Writes SceneImage | Non |
| Creates Job | Non |
| Lances Inngest | Non |
| Calls FAL | Non |
| Modifies approvedOutline | Non |
| Modifies productionPlan | Non |

**Notes:**
- Doit utiliser exactement les mêmes guards que launch

### `/api/moderation/events`

- **Methods**: GET
- **Classification**: audit
- **Action recommandée**: audit

| Check | Status |
|-------|--------|
| Writes Project | Non |
| Writes Chapter | Non |
| Writes SceneImage | Non |
| Creates Job | Non |
| Lances Inngest | Non |
| Calls FAL | Non |
| Modifies approvedOutline | Non |
| Modifies productionPlan | Non |

### `/api/moderation/review-request`

- **Methods**: POST
- **Classification**: audit
- **Action recommandée**: audit

| Check | Status |
|-------|--------|
| Writes Project | Non |
| Writes Chapter | Non |
| Writes SceneImage | Non |
| Creates Job | Non |
| Lances Inngest | Non |
| Calls FAL | Non |
| Modifies approvedOutline | Non |
| Modifies productionPlan | Non |

### `/api/projects/[id]/arcs`

- **Methods**: GET, POST
- **Classification**: audit
- **Action recommandée**: audit

| Check | Status |
|-------|--------|
| Writes Project | Non |
| Writes Chapter | Non |
| Writes SceneImage | Non |
| Creates Job | Non |
| Lances Inngest | Non |
| Calls FAL | Non |
| Modifies approvedOutline | Non |
| Modifies productionPlan | Non |

### `/api/projects/[id]/bible`

- **Methods**: PUT
- **Classification**: audit
- **Action recommandée**: audit

| Check | Status |
|-------|--------|
| Writes Project | ⚠️ Oui |
| Writes Chapter | Non |
| Writes SceneImage | Non |
| Creates Job | Non |
| Lances Inngest | Non |
| Calls FAL | Non |
| Modifies approvedOutline | Non |
| Modifies productionPlan | Non |

### `/api/projects/[id]/canon-health`

- **Methods**: GET
- **Classification**: audit
- **Action recommandée**: audit

| Check | Status |
|-------|--------|
| Writes Project | Non |
| Writes Chapter | Non |
| Writes SceneImage | ⚠️ Oui |
| Creates Job | Non |
| Lances Inngest | Non |
| Calls FAL | Non |
| Modifies approvedOutline | Non |
| Modifies productionPlan | Non |

### `/api/projects/[id]/chapters/[chapterId]/approved-outline`

- **Methods**: PATCH
- **Classification**: audit
- **Action recommandée**: audit

| Check | Status |
|-------|--------|
| Writes Project | ⚠️ Oui |
| Writes Chapter | ⚠️ Oui |
| Writes SceneImage | Non |
| Creates Job | Non |
| Lances Inngest | Non |
| Calls FAL | Non |
| Modifies approvedOutline | ⚠️ Oui |
| Modifies productionPlan | ⚠️ Oui |

### `/api/projects/[id]/chapters/[chapterId]/autofill`

- **Methods**: POST
- **Classification**: audit
- **Action recommandée**: audit

| Check | Status |
|-------|--------|
| Writes Project | Non |
| Writes Chapter | ⚠️ Oui |
| Writes SceneImage | Non |
| Creates Job | Non |
| Lances Inngest | Non |
| Calls FAL | Non |
| Modifies approvedOutline | Non |
| Modifies productionPlan | Non |

### `/api/projects/[id]/chapters/[chapterId]/canon-state`

- **Methods**: GET
- **Classification**: audit
- **Action recommandée**: audit

| Check | Status |
|-------|--------|
| Writes Project | Non |
| Writes Chapter | ⚠️ Oui |
| Writes SceneImage | Non |
| Creates Job | Non |
| Lances Inngest | Non |
| Calls FAL | Non |
| Modifies approvedOutline | Non |
| Modifies productionPlan | Non |

### `/api/projects/[id]/chapters/[chapterId]/chapter-health`

- **Methods**: GET
- **Classification**: audit
- **Action recommandée**: audit

| Check | Status |
|-------|--------|
| Writes Project | Non |
| Writes Chapter | ⚠️ Oui |
| Writes SceneImage | Non |
| Creates Job | Non |
| Lances Inngest | Non |
| Calls FAL | Non |
| Modifies approvedOutline | Non |
| Modifies productionPlan | Non |

### `/api/projects/[id]/chapters/[chapterId]/composite-page`

- **Methods**: GET
- **Classification**: audit
- **Action recommandée**: audit

| Check | Status |
|-------|--------|
| Writes Project | Non |
| Writes Chapter | Non |
| Writes SceneImage | Non |
| Creates Job | Non |
| Lances Inngest | Non |
| Calls FAL | Non |
| Modifies approvedOutline | Non |
| Modifies productionPlan | Non |

### `/api/projects/[id]/chapters/[chapterId]/continue`

- **Methods**: POST
- **Classification**: audit
- **Action recommandée**: audit

| Check | Status |
|-------|--------|
| Writes Project | ⚠️ Oui |
| Writes Chapter | ⚠️ Oui |
| Writes SceneImage | Non |
| Creates Job | ⚠️ Oui |
| Lances Inngest | Non |
| Calls FAL | Non |
| Modifies approvedOutline | Non |
| Modifies productionPlan | Non |

### `/api/projects/[id]/chapters/[chapterId]/launch`

- **Methods**: POST
- **Classification**: canonical
- **Action recommandée**: keep

| Check | Status |
|-------|--------|
| Writes Project | Non |
| Writes Chapter | ⚠️ Oui |
| Writes SceneImage | Non |
| Creates Job | ⚠️ Oui |
| Lances Inngest | Non |
| Calls FAL | ⚠️ Oui |
| Modifies approvedOutline | ⚠️ Oui |
| Modifies productionPlan | ⚠️ Oui |

**Notes:**
- Route canonique pour lancer un chapitre premium

### `/api/projects/[id]/chapters/[chapterId]/qa-report`

- **Methods**: GET
- **Classification**: audit
- **Action recommandée**: audit

| Check | Status |
|-------|--------|
| Writes Project | Non |
| Writes Chapter | ⚠️ Oui |
| Writes SceneImage | Non |
| Creates Job | Non |
| Lances Inngest | Non |
| Calls FAL | Non |
| Modifies approvedOutline | ⚠️ Oui |
| Modifies productionPlan | ⚠️ Oui |

### `/api/projects/[id]/chapters/[chapterId]/readiness`

- **Methods**: GET
- **Classification**: audit
- **Action recommandée**: audit

| Check | Status |
|-------|--------|
| Writes Project | Non |
| Writes Chapter | ⚠️ Oui |
| Writes SceneImage | Non |
| Creates Job | Non |
| Lances Inngest | Non |
| Calls FAL | Non |
| Modifies approvedOutline | Non |
| Modifies productionPlan | Non |

### `/api/projects/[id]/chapters/[chapterId]/review/complete`

- **Methods**: POST
- **Classification**: audit
- **Action recommandée**: audit

| Check | Status |
|-------|--------|
| Writes Project | Non |
| Writes Chapter | ⚠️ Oui |
| Writes SceneImage | Non |
| Creates Job | Non |
| Lances Inngest | Non |
| Calls FAL | Non |
| Modifies approvedOutline | Non |
| Modifies productionPlan | Non |

### `/api/projects/[id]/chapters/[chapterId]`

- **Methods**: GET, PATCH, DELETE
- **Classification**: audit
- **Action recommandée**: audit

| Check | Status |
|-------|--------|
| Writes Project | ⚠️ Oui |
| Writes Chapter | ⚠️ Oui |
| Writes SceneImage | Non |
| Creates Job | Non |
| Lances Inngest | Non |
| Calls FAL | Non |
| Modifies approvedOutline | Non |
| Modifies productionPlan | Non |

### `/api/projects/[id]/chapters/[chapterId]/studio`

- **Methods**: GET, PATCH
- **Classification**: audit
- **Action recommandée**: audit

| Check | Status |
|-------|--------|
| Writes Project | Non |
| Writes Chapter | ⚠️ Oui |
| Writes SceneImage | Non |
| Creates Job | Non |
| Lances Inngest | Non |
| Calls FAL | Non |
| Modifies approvedOutline | ⚠️ Oui |
| Modifies productionPlan | ⚠️ Oui |

### `/api/projects/[id]/chapters/[chapterId]/visual-contract-ui`

- **Methods**: PATCH
- **Classification**: audit
- **Action recommandée**: audit

| Check | Status |
|-------|--------|
| Writes Project | Non |
| Writes Chapter | Non |
| Writes SceneImage | Non |
| Creates Job | Non |
| Lances Inngest | Non |
| Calls FAL | Non |
| Modifies approvedOutline | Non |
| Modifies productionPlan | Non |

### `/api/projects/[id]/chapters/estimate`

- **Methods**: POST
- **Classification**: audit
- **Action recommandée**: audit

| Check | Status |
|-------|--------|
| Writes Project | Non |
| Writes Chapter | ⚠️ Oui |
| Writes SceneImage | Non |
| Creates Job | Non |
| Lances Inngest | Non |
| Calls FAL | Non |
| Modifies approvedOutline | ⚠️ Oui |
| Modifies productionPlan | ⚠️ Oui |

### `/api/projects/[id]/chapters`

- **Methods**: GET, POST
- **Classification**: audit
- **Action recommandée**: audit

| Check | Status |
|-------|--------|
| Writes Project | ⚠️ Oui |
| Writes Chapter | ⚠️ Oui |
| Writes SceneImage | Non |
| Creates Job | Non |
| Lances Inngest | Non |
| Calls FAL | Non |
| Modifies approvedOutline | ⚠️ Oui |
| Modifies productionPlan | ⚠️ Oui |

### `/api/projects/[id]/characters/ai-suggest`

- **Methods**: POST
- **Classification**: audit
- **Action recommandée**: audit

| Check | Status |
|-------|--------|
| Writes Project | Non |
| Writes Chapter | Non |
| Writes SceneImage | Non |
| Creates Job | Non |
| Lances Inngest | Non |
| Calls FAL | Non |
| Modifies approvedOutline | Non |
| Modifies productionPlan | Non |

### `/api/projects/[id]/characters`

- **Methods**: GET, POST
- **Classification**: audit
- **Action recommandée**: audit

| Check | Status |
|-------|--------|
| Writes Project | ⚠️ Oui |
| Writes Chapter | Non |
| Writes SceneImage | Non |
| Creates Job | Non |
| Lances Inngest | Non |
| Calls FAL | Non |
| Modifies approvedOutline | Non |
| Modifies productionPlan | Non |

### `/api/projects/[id]/export/bible`

- **Methods**: POST
- **Classification**: audit
- **Action recommandée**: audit

| Check | Status |
|-------|--------|
| Writes Project | Non |
| Writes Chapter | Non |
| Writes SceneImage | Non |
| Creates Job | Non |
| Lances Inngest | Non |
| Calls FAL | Non |
| Modifies approvedOutline | Non |
| Modifies productionPlan | Non |

### `/api/projects/[id]/export/package`

- **Methods**: POST
- **Classification**: audit
- **Action recommandée**: audit

| Check | Status |
|-------|--------|
| Writes Project | Non |
| Writes Chapter | Non |
| Writes SceneImage | Non |
| Creates Job | Non |
| Lances Inngest | Non |
| Calls FAL | Non |
| Modifies approvedOutline | Non |
| Modifies productionPlan | Non |

### `/api/projects/[id]/npc-resolve`

- **Methods**: POST
- **Classification**: audit
- **Action recommandée**: audit

| Check | Status |
|-------|--------|
| Writes Project | ⚠️ Oui |
| Writes Chapter | Non |
| Writes SceneImage | Non |
| Creates Job | Non |
| Lances Inngest | Non |
| Calls FAL | Non |
| Modifies approvedOutline | Non |
| Modifies productionPlan | Non |

### `/api/projects/[id]/pipeline`

- **Methods**: POST
- **Classification**: legacy
- **Action recommandée**: delegate

| Check | Status |
|-------|--------|
| Writes Project | ⚠️ Oui |
| Writes Chapter | ⚠️ Oui |
| Writes SceneImage | Non |
| Creates Job | ⚠️ Oui |
| Lances Inngest | Non |
| Calls FAL | Non |
| Modifies approvedOutline | ⚠️ Oui |
| Modifies productionPlan | ⚠️ Oui |

**Notes:**
- Doit déléguer vers /launch ou devenir read-only/debug

### `/api/projects/[id]/pipeline-version`

- **Methods**: GET, POST
- **Classification**: audit
- **Action recommandée**: audit

| Check | Status |
|-------|--------|
| Writes Project | Non |
| Writes Chapter | Non |
| Writes SceneImage | Non |
| Creates Job | Non |
| Lances Inngest | Non |
| Calls FAL | Non |
| Modifies approvedOutline | Non |
| Modifies productionPlan | Non |

### `/api/projects/[id]/recurring-npcs/[npcId]/promote`

- **Methods**: POST
- **Classification**: audit
- **Action recommandée**: audit

| Check | Status |
|-------|--------|
| Writes Project | Non |
| Writes Chapter | Non |
| Writes SceneImage | Non |
| Creates Job | Non |
| Lances Inngest | Non |
| Calls FAL | Non |
| Modifies approvedOutline | Non |
| Modifies productionPlan | Non |

### `/api/projects/[id]/recurring-npcs`

- **Methods**: GET
- **Classification**: audit
- **Action recommandée**: audit

| Check | Status |
|-------|--------|
| Writes Project | ⚠️ Oui |
| Writes Chapter | Non |
| Writes SceneImage | Non |
| Creates Job | Non |
| Lances Inngest | Non |
| Calls FAL | Non |
| Modifies approvedOutline | Non |
| Modifies productionPlan | Non |

### `/api/projects/[id]/relationships`

- **Methods**: GET, POST
- **Classification**: audit
- **Action recommandée**: audit

| Check | Status |
|-------|--------|
| Writes Project | Non |
| Writes Chapter | Non |
| Writes SceneImage | Non |
| Creates Job | Non |
| Lances Inngest | Non |
| Calls FAL | Non |
| Modifies approvedOutline | Non |
| Modifies productionPlan | Non |

### `/api/projects/[id]`

- **Methods**: GET, PATCH, DELETE
- **Classification**: audit
- **Action recommandée**: audit

| Check | Status |
|-------|--------|
| Writes Project | ⚠️ Oui |
| Writes Chapter | Non |
| Writes SceneImage | Non |
| Creates Job | Non |
| Lances Inngest | Non |
| Calls FAL | Non |
| Modifies approvedOutline | Non |
| Modifies productionPlan | Non |

### `/api/projects/[id]/style-pack`

- **Methods**: GET, PUT
- **Classification**: audit
- **Action recommandée**: audit

| Check | Status |
|-------|--------|
| Writes Project | ⚠️ Oui |
| Writes Chapter | Non |
| Writes SceneImage | Non |
| Creates Job | Non |
| Lances Inngest | Non |
| Calls FAL | Non |
| Modifies approvedOutline | Non |
| Modifies productionPlan | Non |

### `/api/projects`

- **Methods**: GET, POST
- **Classification**: audit
- **Action recommandée**: audit

| Check | Status |
|-------|--------|
| Writes Project | ⚠️ Oui |
| Writes Chapter | Non |
| Writes SceneImage | Non |
| Creates Job | Non |
| Lances Inngest | Non |
| Calls FAL | Non |
| Modifies approvedOutline | Non |
| Modifies productionPlan | Non |

### `/api/scene-images/[sceneImageId]/debug`

- **Methods**: GET
- **Classification**: audit
- **Action recommandée**: audit

| Check | Status |
|-------|--------|
| Writes Project | Non |
| Writes Chapter | Non |
| Writes SceneImage | ⚠️ Oui |
| Creates Job | Non |
| Lances Inngest | Non |
| Calls FAL | Non |
| Modifies approvedOutline | Non |
| Modifies productionPlan | Non |

### `/api/scene-images/[sceneImageId]/retry`

- **Methods**: POST
- **Classification**: canonical
- **Action recommandée**: audit

| Check | Status |
|-------|--------|
| Writes Project | ⚠️ Oui |
| Writes Chapter | Non |
| Writes SceneImage | ⚠️ Oui |
| Creates Job | Non |
| Lances Inngest | Non |
| Calls FAL | ⚠️ Oui |
| Modifies approvedOutline | ⚠️ Oui |
| Modifies productionPlan | ⚠️ Oui |

**Notes:**
- Autorisé seulement avec PanelGenerationContract

### `/api/scene-images/[sceneImageId]/validate`

- **Methods**: POST
- **Classification**: canonical
- **Action recommandée**: audit

| Check | Status |
|-------|--------|
| Writes Project | Non |
| Writes Chapter | Non |
| Writes SceneImage | ⚠️ Oui |
| Creates Job | Non |
| Lances Inngest | Non |
| Calls FAL | Non |
| Modifies approvedOutline | Non |
| Modifies productionPlan | Non |

**Notes:**
- Ne doit pas masquer un contrat cassé

### `/api/tts`

- **Methods**: POST
- **Classification**: audit
- **Action recommandée**: audit

| Check | Status |
|-------|--------|
| Writes Project | Non |
| Writes Chapter | Non |
| Writes SceneImage | Non |
| Creates Job | Non |
| Lances Inngest | Non |
| Calls FAL | Non |
| Modifies approvedOutline | Non |
| Modifies productionPlan | Non |

### `/api/wallet`

- **Methods**: GET
- **Classification**: audit
- **Action recommandée**: audit

| Check | Status |
|-------|--------|
| Writes Project | Non |
| Writes Chapter | Non |
| Writes SceneImage | Non |
| Creates Job | Non |
| Lances Inngest | Non |
| Calls FAL | Non |
| Modifies approvedOutline | Non |
| Modifies productionPlan | Non |

### `/api/wallet/transactions`

- **Methods**: GET
- **Classification**: audit
- **Action recommandée**: audit

| Check | Status |
|-------|--------|
| Writes Project | Non |
| Writes Chapter | Non |
| Writes SceneImage | Non |
| Creates Job | Non |
| Lances Inngest | Non |
| Calls FAL | Non |
| Modifies approvedOutline | Non |
| Modifies productionPlan | Non |
