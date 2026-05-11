/**
 * Façade publique du package `@manga-ai-studio/memory`.
 *
 * Expose la mémoire long-terme du projet : RAG documents, embeddings OpenAI,
 * snapshots de chapitre, contexte projet pour les prompts LLM, indexation
 * d'entités (character/location/NPC) et détection de warnings canon.
 *
 * Le détail vit dans `_index/` :
 *   - `embeddings.ts`        : OpenAI embeddings + sanitisation
 *   - `rag-documents.ts`     : index/replace/retrieve RAG documents
 *   - `series-synopsis.ts`   : `buildSeriesSynopsis` pour séries longues
 *   - `project-context.ts`   : `buildProjectContext` (riche)
 *   - `chapter-memory.ts`    : `persistChapterMemory` + RAG events
 *   - `entity-rag.ts`        : `indexCharacterForRag` / `indexLocationForRag` / `indexNpcForRag`
 *   - `canon-warnings.ts`    : `detectCanonWarnings`
 */

export * from "./scene-extras-registry";
export * from "./species-resolver";
export * from "./dialogue-memory";
export * from "./dialogue-voice-drift";

export {
  indexRagDocument,
  replaceRagDocument,
  listRecentSummaries,
  retrieveRelevantMemory,
  type RagDocumentInput,
} from "./_index/rag-documents";

export {
  buildProjectContext,
  type BuildProjectContextOptions,
} from "./_index/project-context";

export {
  persistChapterMemory,
  type ChapterMemoryInput,
} from "./_index/chapter-memory";

export {
  indexCharacterForRag,
  indexLocationForRag,
  indexNpcForRag,
  type CharacterRagInput,
  type LocationRagInput,
  type NpcRagInput,
} from "./_index/entity-rag";

export {
  detectCanonWarnings,
  type DetectCanonWarningsInput,
} from "./_index/canon-warnings";
