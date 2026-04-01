import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma, ContentRating, ContentIntensityLayer, ProjectStatus } from "@manga-ai-studio/db";
import { getAppUser } from "@/lib/auth/get-app-user";
import { notFound, unauthorized } from "@/lib/api-response";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  pitch: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  primaryGenre: z.string().optional().nullable(),
  tone: z.string().optional().nullable(),
  status: z.nativeEnum(ProjectStatus).optional(),
  contentRating: z.nativeEnum(ContentRating).optional(),
  intensityLayer: z.nativeEnum(ContentIntensityLayer).optional(),
});

export async function GET(_req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const project = await prisma.project.findFirst({
    where: { id, userId: user.id },
    include: {
      characters: { orderBy: { createdAt: "desc" } },
      storyBible: true,
      stylePacks: { orderBy: { version: "desc" } },
      chapters: { orderBy: { chapterNumber: "desc" } },
    },
  });
  if (!project) return notFound();
  return NextResponse.json({ project });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const existing = await prisma.project.findFirst({ where: { id, userId: user.id } });
  if (!existing) return notFound();
  const body = patchSchema.parse(await req.json());
  const project = await prisma.project.update({
    where: { id },
    data: body,
  });
  return NextResponse.json({ project });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const existing = await prisma.project.findFirst({ where: { id, userId: user.id } });
  if (!existing) return notFound();
  await prisma.project.update({ where: { id }, data: { status: "archived" } });
  return NextResponse.json({ ok: true });
}
