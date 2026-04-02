import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@manga-ai-studio/db";
import { prisma } from "@manga-ai-studio/db";
import { getAppUser } from "@/lib/auth/get-app-user";
import { notFound, unauthorized } from "@/lib/api-response";

type Ctx = { params: Promise<{ id: string; chapterId: string }> };

const patchSchema = z.object({
  title: z.string().optional().nullable(),
  summary: z.string().optional().nullable(),
  cliffhanger: z.string().optional().nullable(),
  userIntent: z.string().optional().nullable(),
  storyboard: z.unknown().optional(),
  script: z.unknown().optional(),
  outline: z.unknown().optional(),
  status: z.string().optional(),
});

export async function GET(_req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const { id: projectId, chapterId } = await ctx.params;
  const project = await prisma.project.findFirst({ where: { id: projectId, userId: user.id } });
  if (!project) return notFound();

  const [chapter, memorySnapshot, activeJob] = await Promise.all([
    prisma.chapter.findFirst({
      where: { id: chapterId, projectId },
      include: {
        scenes: {
          orderBy: { sceneNumber: "asc" },
          include: {
            images: {
              orderBy: { panelNumber: "asc" },
              select: {
                id: true,
                panelNumber: true,
                imageUrl: true,
                status: true,
                prompt: true,
                metadata: true,
              },
            },
          },
        },
      },
    }),
    prisma.memorySnapshot.findFirst({
      where: { chapterId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.job.findFirst({
      where: { chapterId, status: { in: ["queued", "running"] } },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, output: true, createdAt: true },
    }),
  ]);

  if (!chapter) return notFound();

  // Statistiques images pour le reader
  const allImages = chapter.scenes.flatMap((s) => s.images);
  const imageStats = {
    total: allImages.length,
    completed: allImages.filter((i) => i.status === "completed" && i.imageUrl).length,
    failed: allImages.filter((i) => i.status === "failed" || i.status === "blocked").length,
    pending: allImages.filter((i) => i.status === "planned" || i.status === "pending").length,
  };

  return NextResponse.json({
    chapter,
    memorySnapshot,
    activeJob,
    imageStats,
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const { id: projectId, chapterId } = await ctx.params;
  const project = await prisma.project.findFirst({ where: { id: projectId, userId: user.id } });
  if (!project) return notFound();
  const existing = await prisma.chapter.findFirst({ where: { id: chapterId, projectId } });
  if (!existing) return notFound();
  const body = patchSchema.parse(await req.json());

  const data: Prisma.ChapterUpdateInput = {};
  if (body.title !== undefined) data.title = body.title;
  if (body.summary !== undefined) data.summary = body.summary;
  if (body.cliffhanger !== undefined) data.cliffhanger = body.cliffhanger;
  if (body.userIntent !== undefined) data.userIntent = body.userIntent;
  if (body.status !== undefined) data.status = body.status;
  if (body.storyboard !== undefined) data.storyboard = body.storyboard as Prisma.InputJsonValue;
  if (body.script !== undefined) data.script = body.script as Prisma.InputJsonValue;
  if (body.outline !== undefined) data.outline = body.outline as Prisma.InputJsonValue;

  const chapter = await prisma.chapter.update({
    where: { id: chapterId },
    data,
  });
  return NextResponse.json({ chapter });
}
