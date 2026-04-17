import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma, type Prisma } from "@manga-ai-studio/db";
import { getAppUser } from "@/lib/auth/get-app-user";
import { notFound, unauthorized } from "@/lib/api-response";

type Ctx = { params: Promise<{ id: string }> };

const glossaryEntrySchema = z.object({
  term: z.string(),
  description: z.string().optional().default(""),
  visualCore: z.string().optional().default(""),
  entityKind: z.string().optional().default("named_npc"),
});

const putSchema = z.object({
  summary: z.string().optional().nullable(),
  worldRules: z.record(z.string(), z.unknown()).optional(),
  themes: z.array(z.unknown()).optional(),
  lore: z.record(z.string(), z.unknown()).optional(),
  glossary: z.union([z.array(glossaryEntrySchema), z.record(z.string(), z.unknown())]).optional(),
  lockedCanon: z.record(z.string(), z.unknown()).optional(),
});

export async function PUT(req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const { id: projectId } = await ctx.params;
  const project = await prisma.project.findFirst({ where: { id: projectId, userId: user.id } });
  if (!project) return notFound();
  const body = putSchema.parse(await req.json());
  const bible = await prisma.storyBible.upsert({
    where: { projectId },
    create: {
      projectId,
      summary: body.summary,
      worldRules: (body.worldRules ?? {}) as Prisma.InputJsonValue,
      themes: (body.themes ?? []) as Prisma.InputJsonValue,
      lore: (body.lore ?? {}) as Prisma.InputJsonValue,
      glossary: (body.glossary ?? {}) as Prisma.InputJsonValue,
      lockedCanon: (body.lockedCanon ?? {}) as Prisma.InputJsonValue,
    },
    update: {
      summary: body.summary ?? undefined,
      ...(body.worldRules !== undefined ? { worldRules: body.worldRules as Prisma.InputJsonValue } : {}),
      ...(body.themes !== undefined ? { themes: body.themes as Prisma.InputJsonValue } : {}),
      ...(body.lore !== undefined ? { lore: body.lore as Prisma.InputJsonValue } : {}),
      ...(body.glossary !== undefined ? { glossary: body.glossary as Prisma.InputJsonValue } : {}),
      ...(body.lockedCanon !== undefined ? { lockedCanon: body.lockedCanon as Prisma.InputJsonValue } : {}),
    },
  });
  return NextResponse.json({ bible });
}
