# AI Engine Inventory

> Inventaire des moteurs IA utilisés dans le pipeline premium.

## 1. Agents LLM

### Story Architect

| Fichier | Moteur | Modèle | Fallback | Guard Premium |
|---------|--------|--------|----------|---------------|
| `story-architect-agent.ts` | **Aucun** (stub) | - | N/A | Non |
| `story-architect-agent-llm.ts` | **OpenAI** | `STORY_ARCHITECT_MODEL` ou `gpt-4o-mini` | → stub si clé absente, JSON invalide, <4 beats | Non |
| `story-pass.ts` | Délègue | - | - | **Oui**: throw si premium + pas de clé |

**Problème**: Le fallback vers le stub passe silencieusement en warnings.

### Manga Editor

| Fichier | Moteur | Modèle | Fallback | Guard Premium |
|---------|--------|--------|----------|---------------|
| `manga-editor-agent.ts` | **Aucun** (stub) | - | N/A | Non |
| `manga-editor-agent-llm.ts` | **OpenAI** | `OPENAI_MANGA_EDITOR_MODEL` ou `gpt-4o-mini` | → stub si clé absente, exception, validation fail | Non |
| `storyboard-pass.ts` | Délègue | - | - | **Oui**: throw si premium + pas de clé |

**Problème**: Même pattern que Story Architect.

### Dialogue Writer

| Fichier | Moteur | Modèle | Fallback | Guard Premium |
|---------|--------|--------|----------|---------------|
| `dialogue-writer.ts` | **OpenAI** | `OPENAI_DIALOGUE_MODEL` ou `gpt-4o-mini` | → heuristique `generateFallbackResults` | **Non** |
| `dialogue-scene-writer.ts` | **OpenAI** | `OPENAI_SCENE_DIALOGUE_MODEL` ou `gpt-4o-mini` | → skip si pas activé/pas de clé | **Non** |

**Problème critique**: Aucun guard premium! Le dialogue peut silencieusement fallback sur heuristique.

## 2. Génération d'Images

### FAL Adapter

| Fichier | Modèles | LoRA Support |
|---------|---------|--------------|
| `fal-adapter-shared.ts` | `flux-lora`, `flux/dev`, `flux-schnell`, `Redux` | **Oui** |
| `run-generation.ts` | Routing vers FAL si LoRA | **Oui** |

**Modèles FAL utilisés**:
- `fal-ai/flux-lora` (avec LoRA)
- `fal-ai/flux/dev` (sans LoRA, haute qualité)
- `fal-ai/flux-schnell` (rapide)
- `fal-ai/flux-pro/v1.1-ultra` (ultra qualité)

### Render Pass v3

| Fichier | LoRA Integration |
|---------|-----------------|
| `default-panel-image-generator.ts` | **Non explicite** — pas de champ `loras` |
| `image-generation-pass.ts` (legacy) | **Oui** — `panelLoras` injecté |

**Problème critique**: Le chemin v3 n'injecte pas les LoRAs!

## 3. RAG / Memory

### Embeddings

| Fichier | Moteur | Modèle | Fallback |
|---------|--------|--------|----------|
| `packages/memory/src/index.ts` | **OpenAI** | `OPENAI_EMBEDDING_MODEL` ou `text-embedding-3-small` | → null si erreur |

### Retrieval

| Fonction | Méthode | Fallback |
|----------|---------|----------|
| `retrieveRelevantMemory` | pgvector cosine | → LIKE textuel (silencieux) |
| `buildProjectContext` | RAG 5 docs | → contexte vide si échec |

**Problème**: Fallback textuel silencieux sans warning.

## 4. Vision QA

| Fichier | Moteur | Modèle |
|---------|--------|--------|
| `panel-vision-analyzer.ts` | **OpenAI Vision** | `gpt-4o-mini` (par défaut) |
| `visual-panel-qa.ts` | Heuristiques + Vision | - |

**Problème**: Vision QA peut tourner sur URL provider temporaire.

## 5. LoRA Training

| Fichier | Modèle |
|---------|--------|
| `lora-training-service.ts` | `fal-ai/flux-lora-fast-training` |
| `pipeline-lora.ts` | Orchestration file d'attente |

## 6. Résumé des Problèmes

### Fallbacks Silencieux

| Agent | Fallback | Guard Premium |
|-------|----------|---------------|
| Story Architect | → stub | ✅ Oui (story-pass) |
| Manga Editor | → stub | ✅ Oui (storyboard-pass) |
| Dialogue Writer | → heuristique | ❌ **Non** |
| Dialogue Scene Writer | → skip | ❌ **Non** |
| RAG Retrieval | → LIKE textuel | ❌ **Non** |
| Embeddings | → null | ❌ **Non** |

### LoRA Non Intégré

| Chemin | LoRA |
|--------|------|
| Legacy (`image-generation-pass.ts`) | ✅ Oui |
| V3 (`default-panel-image-generator.ts`) | ❌ **Non** |

## 7. Actions Requises

### P0 - Dialogue Writer Premium Guard

```typescript
// Dans dialogue-writer.ts ou appelant
if (isPremiumRun && result.usedFallback) {
  throw new Error(`premium_dialogue_fallback_forbidden:${result.fallbackReason}`);
}
```

### P0 - LoRA dans Render Pass V3

```typescript
// Dans default-panel-image-generator.ts
const result = await adapter.generateImage({
  // ... existing
  loras: spec.loraBindings?.map(l => ({
    url: l.url,
    triggerWord: l.triggerWord,
    scale: l.scale,
  })),
});
```

### P0 - RAG Premium Guard

```typescript
// Dans narrative-pass.ts ou buildProjectContext
if (isPremiumRun && ragContext.mode === "text_fallback") {
  throw new Error("premium_rag_embedding_required");
}
```

## 8. Variables d'Environnement Requises

| Variable | Usage | Obligatoire Premium |
|----------|-------|---------------------|
| `OPENAI_API_KEY` | LLM agents | **Oui** |
| `FAL_KEY` ou `FAL_API_KEY` | Image generation | **Oui** |
| `SUPABASE_URL` | Storage | **Oui** |
| `SUPABASE_SERVICE_ROLE_KEY` | Storage | **Oui** |
| `STORY_ARCHITECT_MODEL` | Story LLM | Non (default gpt-4o-mini) |
| `OPENAI_MANGA_EDITOR_MODEL` | Storyboard LLM | Non (default gpt-4o-mini) |
| `OPENAI_DIALOGUE_MODEL` | Dialogue LLM | Non (default gpt-4o-mini) |
| `OPENAI_SCENE_DIALOGUE_MODEL` | Scene dialogue | Non (default gpt-4o-mini) |
| `OPENAI_EMBEDDING_MODEL` | RAG embeddings | Non (default text-embedding-3-small) |
| `PIPELINE_V3_PREMIUM_ONLY` | Premium mode | **Oui** pour premium |
