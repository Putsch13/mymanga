import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@manga-ai-studio/db";
import { getAppUser } from "@/lib/auth/get-app-user";
import { notFound, unauthorized } from "@/lib/api-response";

type Ctx = { params: Promise<{ id: string }> };

const createSchema = z.object({
  title: z.string().optional(),
  userIntent: z.string().optional(),
});

export async function GET(_req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const { id: projectId } = await ctx.params;
  const project = await prisma.project.findFirst({ where: { id: projectId, userId: user.id } });
  if (!project) return notFound();
  const chapters = await prisma.chapter.findMany({
    where: { projectId },
    orderBy: { chapterNumber: "desc" },
  });
  return NextResponse.json({ chapters });
}

export async function POST(req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const { id: projectId } = await ctx.params;
  const project = await prisma.project.findFirst({ where: { id: projectId, userId: user.id } });
  if (!project) return notFound();
  const body = createSchema.parse(await req.json());
  const last = await prisma.chapter.findFirst({
    where: { projectId },
    orderBy: { chapterNumber: "desc" },
  });
  const chapterNumber = (last?.chapterNumber ?? 0) + 1;
  const chapter = await prisma.chapter.create({
    data: {
      projectId,
      chapterNumber,
      title: body.title ?? `Chapitre ${chapterNumber}`,
      userIntent: body.userIntent,
      status: "draft",
    },
  });
  return NextResponse.json({ chapter });
}
