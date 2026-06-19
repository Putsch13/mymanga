/**
 * Indexation et récupération de documents RAG.
 *
 * - `indexRagDocument` : upsert d'un `RagDocument` avec embedding pgvector
 *   quand OpenAI est configuré, fallback texte sinon.
 * - `replaceRagDocument` : suppression idempotente avant réindexation.
 * - `retrieveRelevantMemory` : recherche cosine via pgvector ou LIKE.
 * - `listRecentSummaries` : sondages des derniers `MemorySnapshot` du projet.
 */
import type { Prisma, PrismaClient } from "@manga-ai-studio/db";
import { generateEmbedding, sanitizeRagContent } from "./embeddings";

export interface RagDocumentInput {
  projectId: string;
  entityType: string;
  entityId?: string;
  title?: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export async function indexRagDocument(prisma: PrismaClient, doc: RagDocumentInput) {
  const sanitized = sanitizeRagContent(doc.content);
  const embedding = await generateEmbedding(sanitized);

  // Prisma ne supporte pas nativement vector(1536) — on passe par $executeRaw.
  if (embedding) {
    const vectorLiteral = `[${embedding.join(",")}]`;
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
    }

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

  // Fallback sans embedding.
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

export async function replaceRagDocument(
  prisma: PrismaClient,
  doc: RagDocumentInput,
) {
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

export async function listRecentSummaries(
  prisma: PrismaClient,
  projectId: string,
  take = 3,
) {
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
  const embedding = await generateEmbedding(normalized);

  if (embedding) {
    const vectorLiteral = `[${embedding.join(",")}]`;
    try {
      return await prisma.$queryRawUnsafe<
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
    } catch {
      // pgvector indisponible : on retombe sur la recherche textuelle.
    }
  }

  return prisma.ragDocument.findMany({
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
}
