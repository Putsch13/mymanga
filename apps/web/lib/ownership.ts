import { prisma } from "@manga-ai-studio/db";

export async function getOwnedProject(userId: string, projectId: string) {
  return prisma.project.findFirst({
    where: { id: projectId, userId },
  });
}

export async function getOwnedChapter(userId: string, projectId: string, chapterId: string) {
  const project = await getOwnedProject(userId, projectId);
  if (!project) return null;
  return prisma.chapter.findFirst({
    where: { id: chapterId, projectId },
  });
}

export async function getOwnedCharacter(userId: string, characterId: string, projectId?: string) {
  return prisma.character.findFirst({
    where: {
      id: characterId,
      project: { userId },
      ...(projectId ? { projectId } : {}),
    },
    include: {
      project: true,
      canonPack: { include: { assets: true } },
      visualRefs: { orderBy: { createdAt: "desc" } },
      relationshipsFrom: true,
      relationshipsTo: true,
    },
  });
}
