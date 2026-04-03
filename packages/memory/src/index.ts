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

// ── Embeddings OpenAI ──────────────────────────────────────────────────────

const EMBEDDING_MODEL =
  process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";

/**
 * Génère un embedding vectoriel via OpenAI text-embedding-3-small (1536 dims).
 * Retourne null si la clé API n'est pas configurée (fallback gracieux).
 */
async function generateEmbedding(text: string): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: text.slice(0, 8000),
      }),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as {
      data?: Array<{ embedding: number[] }>;
    };
    return data.data?.[0]?.embedding ?? null;
  } catch {
    return null;
  }
}

// ── RAG Document management ────────────────────────────────────────────────

export async function indexRagDocument(prisma: PrismaClient, doc: RagDocumentInput) {
  const sanitized = sanitizeRagContent(doc.content);
  const embedding = await generateEmbedding(sanitized);

  // Prisma ne supporte pas nativement vector(1536) — on passe par $executeRaw
  if (embedding) {
    const vectorLiteral = `[${embedding.join(",")}]`;
    // Upsert via raw SQL pour inclure le champ embedding
    const existing = await prisma.ragDocument.findFirst({
      where: {
        projectId: doc.projectId,
        entityType: doc.entityType,
        ...(doc.entityId ? { entityId: doc.entityId } : {}),
      },
      select: { id: true },
    });

    if (existing) {
      await prisma.$executeRawUnsafe(
        `UPDATE "RagDocument"
         SET content = $1, title = $2, metadata = $3::jsonb, embedding = $4::vector
         WHERE id = $5`,
        sanitized,
        doc.title ?? null,
        JSON.stringify(doc.metadata ?? {}),
        vectorLiteral,
        existing.id,
      );
      return prisma.ragDocument.findUniqueOrThrow({ where: { id: existing.id } });
    } else {
      const created = await prisma.ragDocument.create({
        data: {
          projectId: doc.projectId,
          entityType: doc.entityType,
          entityId: doc.entityId,
          title: doc.title,
          content: sanitized,
          metadata: (doc.metadata ?? {}) as Prisma.InputJsonValue,
        },
      });
      await prisma.$executeRawUnsafe(
        `UPDATE "RagDocument" SET embedding = $1::vector WHERE id = $2`,
        vectorLiteral,
        created.id,
      );
      return created;
    }
  }

  // Fallback sans embedding
  return prisma.ragDocument.create({
    data: {
      projectId: doc.projectId,
      entityType: doc.entityType,
      entityId: doc.entityId,
      title: doc.title,
      content: sanitized,
      metadata: (doc.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });
}

export async function replaceRagDocument(prisma: PrismaClient, doc: RagDocumentInput) {
  if (doc.entityId) {
    await prisma.ragDocument.deleteMany({
      where: {
        projectId: doc.projectId,
        entityType: doc.entityType,
        entityId: doc.entityId,
      },
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

/**
 * Recherche vectorielle cosine via pgvector si un embedding est disponible,
 * sinon fallback sur la recherche textuelle LIKE.
 */
export async function retrieveRelevantMemory(
  prisma: PrismaClient,
  projectId: string,
  query: string,
  take = 6,
) {
  const normalized = sanitizeRagContent(query);
  const embedding = await generateEmbedding(normalized);

  if (embedding) {
    const vectorLiteral = `[${embedding.join(",")}]`;
    try {
      const docs = await prisma.$queryRawUnsafe<
        Array<{
          id: string;
          title: string | null;
          content: string;
          entityType: string;
          metadata: unknown;
          createdAt: Date;
        }>
      >(
        `SELECT id, title, content, "entityType", metadata, "createdAt"
         FROM "RagDocument"
         WHERE "projectId" = $1
           AND embedding IS NOT NULL
         ORDER BY embedding <=> $2::vector
         LIMIT $3`,
        projectId,
        vectorLiteral,
        take,
      );
      return docs;
    } catch {
      // pgvector non disponible, fallback textuel
    }
  }

  // Fallback textuel
  const docs = await prisma.ragDocument.findMany({
    where: {
      projectId,
      OR: [
        { title: { contains: normalized.slice(0, 80), mode: "insensitive" } },
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

  const retrieved = userIntent
    ? await retrieveRelevantMemory(prisma, projectId, userIntent, 5)
    : [];

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
    characters: project.characters.map((c) => {
      const raw = c as Record<string, unknown>;
      return {
        id: c.id,
        name: c.name,
        roleType: c.roleType,
        biography: c.biography,
        objective: c.objective,
        fear: c.fear,
        emotionalState: c.emotionalState,
        status: c.status,
        canonLocked: c.canonLocked,
        traits: Array.isArray(c.traits) ? c.traits.filter((item): item is string => typeof item === "string") : [],
        flaws: Array.isArray(c.flaws) ? c.flaws.filter((item): item is string => typeof item === "string") : [],
        appearance: typeof raw.appearance === "string" ? raw.appearance : null,
        outfitDefault: typeof raw.outfitDefault === "string" ? raw.outfitDefault : null,
        hairColor: typeof raw.hairColor === "string" ? raw.hairColor : null,
        eyeColor: typeof raw.eyeColor === "string" ? raw.eyeColor : null,
        speechProfile:
          raw.speechProfile && typeof raw.speechProfile === "object"
            ? (raw.speechProfile as Record<string, unknown>)
            : {},
      };
    }),
    relationships: project.relationships,
    arcs: project.arcs,
    recentChapters: project.chapters.map((c) => ({
      id: c.id,
      chapterNumber: c.chapterNumber,
      title: c.title,
      summary: c.summary,
      cliffhanger: c.cliffhanger,
    })),
    recentMemory: project.memorySnapshots.map((s) => ({
      chapterId: s.chapterId,
      narrativeSummary: s.narrativeSummary,
      structuredState: s.structuredState,
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

export function detectCanonWarnings(input: {
  characterStatuses: Array<{ name: string; status: string }>;
  scriptText: string;
}) {
  const warnings: string[] = [];

  for (const character of input.characterStatuses) {
    if (
      character.status === "dead" &&
      new RegExp(`\\b${character.name}\\b`, "i").test(input.scriptText)
    ) {
      warnings.push(`${character.name} est marqué comme mort mais réapparaît dans le draft.`);
    }
  }

  return warnings;
}
