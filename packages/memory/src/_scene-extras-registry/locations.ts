import type { Prisma, PrismaClient } from "@manga-ai-studio/db";

import { normalizeLocationKey } from "./utils";

/**
 * Résout (ou crée à la volée) un Location canonique pour un projet donné
 * à partir d'un nom libre. Le slug sert de clé stable cross-chapitre :
 * deux chapitres qui écrivent "La taverne du chat noir" et "taverne du chat-noir"
 * tombent sur le même Location, évitant ainsi la fragmentation du monde.
 */
export async function resolveLocationByName(
  prisma: PrismaClient | Prisma.TransactionClient,
  input: {
    projectId: string;
    name: string;
    type?: string | null;
    description?: string | null;
    createIfMissing?: boolean;
  },
): Promise<{ id: string; slug: string | null; created: boolean } | null> {
  const trimmed = input.name?.trim();
  if (!trimmed) return null;
  const slug = normalizeLocationKey(trimmed);

  const existing = await prisma.location.findFirst({
    where: {
      projectId: input.projectId,
      OR: [
        ...(slug ? [{ slug }] : []),
        { name: { equals: trimmed, mode: "insensitive" as const } },
      ],
    },
    select: { id: true, slug: true },
  });

  if (existing) return { id: existing.id, slug: existing.slug, created: false };
  if (!input.createIfMissing) return null;

  const created = await prisma.location.create({
    data: {
      projectId: input.projectId,
      name: trimmed,
      slug: slug || null,
      type: input.type ?? null,
      description: input.description ?? null,
    },
    select: { id: true, slug: true },
  });
  return { id: created.id, slug: created.slug, created: true };
}
