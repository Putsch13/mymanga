# API Routes Inventory

> Inventaire complet des routes API du pipeline manga premium.

## Légende

- **Génération**: appel FAL/LLM
- **Pipeline premium bypass**: peut contourner les guards V3
- **Action**: `keep` | `delegate` | `read-only` | `delete`

## Routes Chapitre

### `/api/projects/[id]/chapters/estimate/route.ts`

| Critère | Valeur |
|---------|--------|
| Method | POST |
| Lit DB | Oui (Project, Chapter, Character, Memory) |
| Écrit DB | Non |
| Lance génération | Oui (LLM: generateChapterBundle) |
| Modifie outline | Non (preview seulement) |
| Modifie productionPlan | Non |
| Modifie SceneImage | Non |
| Modifie Job | Non |
| Bypass premium | Non |
| Canonique/Legacy | **Canonique** |
| Action | **keep** |

### `/api/projects/[id]/chapters/[chapterId]/approved-outline/route.ts`

| Critère | Valeur |
|---------|--------|
| Method | PATCH |
| Lit DB | Oui (Chapter, Project, Character) |
| Écrit DB | Oui (Chapter: approvedOutline, studio snapshot) |
| Lance génération | Non |
| Modifie outline | **Oui** |
| Modifie productionPlan | **Oui** (dans studio snapshot) |
| Modifie SceneImage | Non |
| Modifie Job | Non |
| Bypass premium | Non |
| Canonique/Legacy | **Canonique** |
| Action | **keep** |

### `/api/projects/[id]/chapters/[chapterId]/autofill/route.ts`

| Critère | Valeur |
|---------|--------|
| Method | POST |
| Lit DB | Oui (Project, Chapter, Character) |
| Écrit DB | Non (retourne suggestedPatch) |
| Lance génération | Oui (LLM: runChapterAutofill) |
| Modifie outline | Non en base |
| Modifie productionPlan | Non en base |
| Modifie SceneImage | Non |
| Modifie Job | Non |
| Bypass premium | Non |
| Canonique/Legacy | **Canonique** |
| Action | **keep** |

### `/api/projects/[id]/chapters/[chapterId]/studio/route.ts`

| Critère | Valeur |
|---------|--------|
| Method | GET, PATCH |
| Lit DB | GET: Chapter, Scene, SceneImage, Project, StylePack, Character, Location |
| Écrit DB | PATCH: Chapter (studio snapshot) |
| Lance génération | Non |
| Modifie outline | PATCH: Oui (merge) |
| Modifie productionPlan | PATCH: Oui (merge) |
| Modifie SceneImage | Non |
| Modifie Job | Non |
| Bypass premium | Non |
| Canonique/Legacy | **Canonique** |
| Action | **keep** |

### `/api/projects/[id]/chapters/[chapterId]/launch/route.ts`

| Critère | Valeur |
|---------|--------|
| Method | POST |
| Lit DB | Oui (Chapter, Project, User, Wallet) |
| Écrit DB | Oui (Chapter status, Job create) |
| Lance génération | **Oui** (Inngest/sync) |
| Modifie outline | Oui (sync approvedOutline) |
| Modifie productionPlan | Non direct |
| Modifie SceneImage | Indirect via pipeline |
| Modifie Job | **Oui** |
| Bypass premium | **Non** (garde V3 explicite) |
| Canonique/Legacy | **Canonique** (entrée principale) |
| Action | **keep** |

### `/api/projects/[id]/chapters/[chapterId]/route.ts`

| Critère | Valeur |
|---------|--------|
| Method | GET, PATCH, DELETE |
| Lit DB | GET: Chapter, Scene, SceneImage, Job, MemorySnapshot |
| Écrit DB | PATCH: Chapter (outline brut), DELETE: Chapter |
| Lance génération | Non |
| Modifie outline | **PATCH: Oui (dangereux)** |
| Modifie productionPlan | Possible via outline |
| Modifie SceneImage | Non |
| Modifie Job | Non |
| Bypass premium | **Oui (PATCH)** |
| Canonique/Legacy | **Mixte** |
| Action | **delegate PATCH vers /studio** |

### `/api/projects/[id]/chapters/[chapterId]/readiness/route.ts`

| Critère | Valeur |
|---------|--------|
| Method | GET |
| Lit DB | Oui (Chapter) |
| Écrit DB | Non |
| Lance génération | Non |
| Bypass premium | Non |
| Canonique/Legacy | **Canonique** |
| Action | **keep** |

### `/api/projects/[id]/chapters/[chapterId]/qa-report/route.ts`

| Critère | Valeur |
|---------|--------|
| Method | GET |
| Lit DB | Oui (Chapter, Scene, SceneImage) |
| Écrit DB | Non |
| Lance génération | Non |
| Bypass premium | Non |
| Canonique/Legacy | **Canonique** |
| Action | **keep** |

### `/api/projects/[id]/chapters/[chapterId]/review/complete/route.ts`

| Critère | Valeur |
|---------|--------|
| Method | POST |
| Lit DB | Oui (Chapter, Scene, SceneImage) |
| Écrit DB | Oui (Chapter status, historique) |
| Lance génération | Non |
| Modifie outline | Oui (studio historique) |
| Bypass premium | Non |
| Canonique/Legacy | **Canonique** |
| Action | **keep** |

## Routes Pipeline/Job

### `/api/projects/[id]/pipeline/route.ts`

| Critère | Valeur |
|---------|--------|
| Method | POST |
| Lit DB | Oui (Project, Chapter, User) |
| Écrit DB | Oui (Chapter, Job) |
| Lance génération | **Oui** |
| Modifie outline | Possible |
| Modifie Job | **Oui** |
| Bypass premium | **Oui** (pas de garde V3) |
| Canonique/Legacy | **Doublon de launch** |
| Action | **delegate vers launch** |

### `/api/jobs/[jobId]/run-now/route.ts`

| Critère | Valeur |
|---------|--------|
| Method | POST |
| Lit DB | Oui (Job) |
| Écrit DB | Indirect via workers |
| Lance génération | **Oui** |
| Bypass premium | **Oui** (pas de re-contrôle V3) |
| Canonique/Legacy | **Utilitaire** |
| Action | **keep** (aligner guards) |

### `/api/jobs/[jobId]/cancel/route.ts`

| Critère | Valeur |
|---------|--------|
| Method | POST |
| Lit DB | Oui (Job) |
| Écrit DB | Oui (Job status) |
| Lance génération | Non |
| Bypass premium | Non |
| Canonique/Legacy | **Canonique** |
| Action | **keep** |

### `/api/inngest/route.ts`

| Critère | Valeur |
|---------|--------|
| Method | GET, POST, PUT |
| Lit DB | Non (handler Inngest) |
| Écrit DB | Non |
| Lance génération | Indirect |
| Bypass premium | N/A |
| Canonique/Legacy | **Canonique** |
| Action | **keep** |

## Routes SceneImage

### `/api/scene-images/[sceneImageId]/retry/route.ts`

| Critère | Valeur |
|---------|--------|
| Method | POST |
| Lit DB | Oui (SceneImage, Scene, Chapter, Project, Character, Location) |
| Écrit DB | Oui (SceneImage) |
| Lance génération | **Oui** (FAL) |
| Modifie SceneImage | **Oui** |
| Bypass premium | **Partiel** (bypass job, mais garde canonicalPacket) |
| Canonique/Legacy | **Canonique** |
| Action | **keep** |

### `/api/scene-images/[sceneImageId]/validate/route.ts`

| Critère | Valeur |
|---------|--------|
| Method | POST |
| Lit DB | Oui (SceneImage) |
| Écrit DB | Oui (SceneImage userValidatedAt) |
| Lance génération | Non |
| Modifie SceneImage | **Oui** |
| Bypass premium | Non |
| Canonique/Legacy | **Canonique** |
| Action | **keep** |

### `/api/scene-images/[sceneImageId]/debug/route.ts`

| Critère | Valeur |
|---------|--------|
| Method | GET |
| Lit DB | Oui (SceneImage) |
| Écrit DB | Non |
| Lance génération | Non |
| Bypass premium | Non |
| Canonique/Legacy | **Utilitaire debug** |
| Action | **keep (read-only)** |

## Routes Utilitaires

### `/api/ai/generate/route.ts`

| Critère | Valeur |
|---------|--------|
| Method | POST |
| Lit DB | Oui (User, Project, Wallet) |
| Écrit DB | Oui (Wallet: tokens) |
| Lance génération | **Oui** (image sandbox) |
| Bypass premium | N/A (hors chapitre) |
| Canonique/Legacy | **Canonique** (sandbox) |
| Action | **keep** |

### `/api/estimate-image/route.ts`

| Critère | Valeur |
|---------|--------|
| Method | POST |
| Lit DB | Non |
| Écrit DB | Non |
| Lance génération | Non |
| Bypass premium | N/A |
| Canonique/Legacy | **Canonique** |
| Action | **keep** |

### `/api/images/proxy/route.ts`

| Critère | Valeur |
|---------|--------|
| Method | GET |
| Lit DB | Non |
| Écrit DB | Non |
| Lance génération | Non |
| Bypass premium | Non |
| Canonique/Legacy | **Canonique** |
| Action | **keep** |

## Synthèse des Risques

| Route | Risque | Action |
|-------|--------|--------|
| `PATCH /chapters/[chapterId]` | Bypass validations studio | Déléguer vers /studio |
| `POST /projects/[id]/pipeline` | Pas de garde V3 | Déléguer vers /launch |
| `POST /jobs/[jobId]/run-now` | Pas de re-contrôle V3 | Aligner guards avec launch |

## Règle Finale

- **Une seule route lance un chapitre premium**: `/launch`
- **Une seule route modifie l'approved outline**: `/approved-outline`
- **Une seule route retry une image avec contrat**: `/retry`
- **Aucune route legacy n'écrit dans l'état premium**
