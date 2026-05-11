/**
 * Persistance d'un `MemorySnapshot` de chapitre.
 *
 * En plus de la création de la ligne `MemorySnapshot`, on indexe :
 *   - le résumé du chapitre comme `chapter_summary` RAG ;
 *   - les événements clés (importance ≥ 60) comme `key_event` RAG ;
 *   - les open loops dans un document `open_loops` dédié.
 *
 * Les `timelineEvents` créent aussi des `ContinuityEvent` ordonnés par
 * `timelineOrder = chapterNumber * 100 + i`.
 */
import type { Prisma, PrismaClient } from "@manga-ai-studio/db";
import { indexRagDocument, replaceRagDocument } from "./rag-documents";

export interface ChapterMemoryInput {
  projectId: string;
  chapterId: string;
  chapterNumber: number;
  summary: string;
  structuredState?: Prisma.InputJsonValue;
  timelineEvents?: Array<Record<string, unknown>>;
  openLoops?: string[];
  title?: string | null;
  characterSnapshots?: Prisma.InputJsonValue;
  wardrobeSnapshots?: Prisma.InputJsonValue;
  relationshipSnapshots?: Prisma.InputJsonValue;
  visualContinuityWarnings?: Prisma.InputJsonValue;
}

export async function persistChapterMemory(
  prisma: PrismaClient,
  input: ChapterMemoryInput,
) {
  const snapshot = await prisma.memorySnapshot.create({
    data: {
      projectId: input.projectId,
      chapterId: input.chapterId,
      narrativeSummary: input.summary,
      structuredState: input.structuredState ?? {},
      characterSnapshots: input.characterSnapshots ?? [],
      wardrobeSnapshots: input.wardrobeSnapshots ?? [],
      relationshipSnapshots: input.relationshipSnapshots ?? [],
      visualContinuityWarnings: input.visualContinuityWarnings ?? [],
      embeddingStatus: "queued",
    },
  });

  // RAG profond : indexer le résumé du chapitre avec embedding pour recherche
  // sémantique.
  await replaceRagDocument(prisma, {
    projectId: input.projectId,
    entityType: "chapter_summary",
    entityId: input.chapterId,
    title: input.title ?? `Chapitre ${input.chapterNumber}`,
    content: input.summary,
    metadata: {
      chapterId: input.chapterId,
      chapterNumber: input.chapterNumber,
    },
  });

  // Indexer aussi les événements clés comme documents RAG séparés.
  const keyEvents = (input.timelineEvents ?? [])
    .filter((e) => Number(e?.importance ?? 0) >= 60)
    .slice(0, 5);
  for (const event of keyEvents) {
    if (!event) continue;
    const eventSummary = String(event.summary ?? "");
    if (eventSummary.length > 20) {
      await indexRagDocument(prisma, {
        projectId: input.projectId,
        entityType: "key_event",
        entityId: `${input.chapterId}_evt_${String(event.eventType ?? "event")}`,
        title: `Ch.${input.chapterNumber} — ${String(event.eventType ?? "event")}`,
        content: eventSummary,
        metadata: {
          chapterId: input.chapterId,
          chapterNumber: input.chapterNumber,
          importance: event.importance,
        },
      });
    }
  }

  const timelineEvents = input.timelineEvents ?? [];
  for (let i = 0; i < timelineEvents.length; i++) {
    const event = timelineEvents[i];
    if (!event) continue;
    await prisma.continuityEvent.create({
      data: {
        projectId: input.projectId,
        chapterId: input.chapterId,
        eventType: String(event.eventType ?? "chapter_progress"),
        summary: String(event.summary ?? input.summary),
        entities: (event.entities as Prisma.InputJsonValue | undefined) ?? {},
        importance: Number(event.importance ?? 50),
        timelineOrder: input.chapterNumber * 100 + i,
        permanent: Boolean(event.permanent ?? true),
      },
    });
  }

  if (input.openLoops?.length) {
    await replaceRagDocument(prisma, {
      projectId: input.projectId,
      entityType: "open_loops",
      entityId: input.chapterId,
      title: `Open loops chapitre ${input.chapterNumber}`,
      content: input.openLoops.join("\n"),
      metadata: { chapterId: input.chapterId },
    });
  }

  return snapshot;
}
