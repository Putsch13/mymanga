import type { Prisma, PrismaClient } from "@manga-ai-studio/db";

type RagDocumentInput = {
  projectId: string;
  entityType: string;
  entityId?: string;
  title?: string;
  content: string;
  metadata?: Record<string, unknown>;
};

type ChapterMemoryInput = {
  projectId: string;
  chapterId: string;
  chapterNumber: number;
  summary: string;
  structuredState?: Prisma.InputJsonValue;
  timelineEvents?: Array<Record<string, unknown>>;
  openLoops?: string[];
  title?: string | null;
};

function sanitizeRagContent(content: string) {
  return content
    .replace(/system\s*:/gi, "")
    .replace(/assistant\s*:/gi, "")
    .replace(/ignore previous instructions/gi, "")
    .trim()
    .slice(0, 4000);
}

export async function indexRagDocument(prisma: PrismaClient, doc: RagDocumentInput) {
  return prisma.ragDocument.create({
    data: {
      projectId: doc.projectId,
      entityType: doc.entityType,
      entityId: doc.entityId,
      title: doc.title,
      content: sanitizeRagContent(doc.content),
      metadata: (doc.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });
}

export async function replaceRagDocument(prisma: PrismaClient, doc: RagDocumentInput) {
  if (doc.entityId) {
    await prisma.ragDocument.deleteMany({
      where: { projectId: doc.projectId, entityType: doc.entityType, entityId: doc.entityId },
    });
  }
  return indexRagDocument(prisma, doc);
}

export async function listRecentSummaries(prisma: PrismaClient, projectId: string, take = 3) {
  return prisma.memorySnapshot.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    take,
  });
}

export async function retrieveRelevantMemory(
  prisma: PrismaClient,
  projectId: string,
  query: string,
  take = 6,
) {
  const normalized = sanitizeRagContent(query);
  const docs = await prisma.ragDocument.findMany({
    where: {
      projectId,
      OR: [
        { title: { contains: normalized, mode: "insensitive" } },
        { content: { contains: normalized.slice(0, 80), mode: "insensitive" } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take,
  });

  return docs;
}

export async function buildProjectContext(
  prisma: PrismaClient,
  projectId: string,
  userIntent?: string | null,
) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      settings: true,
      storyBible: true,
      characters: { orderBy: { createdAt: "asc" } },
      relationships: true,
      arcs: { orderBy: [{ startChapterNumber: "asc" }, { name: "asc" }] },
      chapters: { orderBy: { chapterNumber: "desc" }, take: 3 },
      memorySnapshots: { orderBy: { createdAt: "desc" }, take: 3 },
    },
  });

  if (!project) return null;

  const retrieved = userIntent ? await retrieveRelevantMemory(prisma, projectId, userIntent, 5) : [];

  return {
    project: {
      id: project.id,
      title: project.title,
      pitch: project.pitch,
      description: project.description,
      primaryGenre: project.primaryGenre,
      tone: project.tone,
      format: project.format,
      contentRating: project.contentRating,
      intensityLayer: project.intensityLayer,
      visualStyle: project.visualStyle,
    },
    settings: project.settings,
    storyBible: project.storyBible,
    characters: project.characters.map((character) => ({
      id: character.id,
      name: character.name,
      roleType: character.roleType,
      objective: character.objective,
      fear: character.fear,
      emotionalState: character.emotionalState,
      status: character.status,
      canonLocked: character.canonLocked,
      appearance: character.appearance,
      outfitDefault: character.outfitDefault,
    })),
    relationships: project.relationships,
    arcs: project.arcs,
    recentChapters: project.chapters.map((chapter) => ({
      id: chapter.id,
      chapterNumber: chapter.chapterNumber,
      title: chapter.title,
      summary: chapter.summary,
      cliffhanger: chapter.cliffhanger,
    })),
    recentMemory: project.memorySnapshots.map((snapshot) => ({
      chapterId: snapshot.chapterId,
      narrativeSummary: snapshot.narrativeSummary,
      structuredState: snapshot.structuredState,
    })),
    retrievedDocs: retrieved.map((doc) => ({
      title: doc.title,
      entityType: doc.entityType,
      content: doc.content,
    })),
  };
}

export async function persistChapterMemory(prisma: PrismaClient, input: ChapterMemoryInput) {
  const snapshot = await prisma.memorySnapshot.create({
    data: {
      projectId: input.projectId,
      chapterId: input.chapterId,
      narrativeSummary: input.summary,
      structuredState: input.structuredState ?? {},
      embeddingStatus: "queued",
    },
  });

  await replaceRagDocument(prisma, {
    projectId: input.projectId,
    entityType: "chapter_summary",
    entityId: input.chapterId,
    title: input.title ?? `Chapitre ${input.chapterNumber}`,
    content: input.summary,
    metadata: { chapterId: input.chapterId, chapterNumber: input.chapterNumber },
  });

  const timelineEvents = input.timelineEvents ?? [];
  for (let i = 0; i < timelineEvents.length; i += 1) {
    const event = timelineEvents[i];
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

export function detectCanonWarnings(input: {
  characterStatuses: Array<{ name: string; status: string }>;
  scriptText: string;
}) {
  const warnings: string[] = [];

  for (const character of input.characterStatuses) {
    if (character.status === "dead" && new RegExp(`\\b${character.name}\\b`, "i").test(input.scriptText)) {
      warnings.push(`${character.name} est marqué comme mort mais réapparaît dans le draft.`);
    }
  }

  return warnings;
}
