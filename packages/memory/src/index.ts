import type { PrismaClient } from "@manga-ai-studio/db";

/**
 * RAG / pgvector : indexer du contenu projet (stub — brancher embeddings).
 */
export async function indexRagDocument(
  prisma: PrismaClient,
  doc: { projectId: string; entityType: string; entityId?: string; title?: string; content: string },
) {
  return prisma.ragDocument.create({
    data: {
      projectId: doc.projectId,
      entityType: doc.entityType,
      entityId: doc.entityId,
      title: doc.title,
      content: doc.content,
      metadata: {},
    },
  });
}

export async function listRecentSummaries(prisma: PrismaClient, projectId: string, take = 3) {
  return prisma.memorySnapshot.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    take,
  });
}
