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
  subGenres: z.array(z.string()).optional(),
  tone: z.string().optional().nullable(),
  format: z.string().optional().nullable(),
  visualStyle: z.string().optional().nullable(),
  status: z.nativeEnum(ProjectStatus).optional(),
  contentRating: z.nativeEnum(ContentRating).optional(),
  intensityLayer: z.nativeEnum(ContentIntensityLayer).optional(),
  settings: z
    .object({
      violenceLevel: z.number().int().min(0).max(100).optional(),
      romanceLevel: z.number().int().min(0).max(100).optional(),
      sensualityLevel: z.number().int().min(0).max(100).optional(),
      darknessLevel: z.number().int().min(0).max(100).optional(),
      mysteryLevel: z.number().int().min(0).max(100).optional(),
      realismLevel: z.number().int().min(0).max(100).optional(),
      pacingLevel: z.number().int().min(0).max(100).optional(),
      dialogueDensity: z.number().int().min(0).max(100).optional(),
      maxTokensPerJob: z.number().int().min(100).max(50000).optional(),
      canonStrictness: z.number().int().min(0).max(100).optional(),
    })
    .optional(),
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
      arcs: { orderBy: { startChapterNumber: "asc" } },
      relationships: { orderBy: { updatedAt: "desc" }, take: 12 },
      settings: true,
      _count: { select: { characters: true, chapters: true, arcs: true, relationships: true } },
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
    data: {
      title: body.title,
      pitch: body.pitch,
      description: body.description,
      primaryGenre: body.primaryGenre,
      subGenres: body.subGenres,
      tone: body.tone,
      format: body.format,
      visualStyle: body.visualStyle,
      status: body.status,
      contentRating: body.contentRating,
      intensityLayer: body.intensityLayer,
      ...(body.settings
        ? {
            settings: {
              upsert: {
                create: body.settings,
                update: body.settings,
              },
            },
          }
        : {}),
    },
    include: { settings: true },
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
