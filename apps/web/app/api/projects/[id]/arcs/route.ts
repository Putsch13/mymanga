import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@manga-ai-studio/db";
import { getAppUser } from "@/lib/auth/get-app-user";
import { notFound, unauthorized } from "@/lib/api-response";
import { getOwnedProject } from "@/lib/ownership";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  name: z.string().min(1),
  type: z.string().optional().nullable(),
  summary: z.string().optional().nullable(),
  status: z.string().default("open"),
  startChapterNumber: z.number().int().optional().nullable(),
  endChapterNumber: z.number().int().optional().nullable(),
  metadata: z.record(z.any()).optional(),
});

export async function GET(_req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const { id: projectId } = await ctx.params;
  const project = await getOwnedProject(user.id, projectId);
  if (!project) return notFound();

  const arcs = await prisma.arc.findMany({
    where: { projectId },
    orderBy: [{ startChapterNumber: "asc" }, { name: "asc" }],
  });

  return NextResponse.json({ arcs });
}

export async function POST(req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const { id: projectId } = await ctx.params;
  const project = await getOwnedProject(user.id, projectId);
  if (!project) return notFound();
  const body = bodySchema.parse(await req.json());

  const arc = await prisma.arc.create({
    data: {
      projectId,
      name: body.name,
      type: body.type,
      summary: body.summary,
      status: body.status,
      startChapterNumber: body.startChapterNumber,
      endChapterNumber: body.endChapterNumber,
      metadata: body.metadata ?? {},
    },
  });

  return NextResponse.json({ arc });
}
