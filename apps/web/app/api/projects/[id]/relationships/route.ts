import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@manga-ai-studio/db";
import { getAppUser } from "@/lib/auth/get-app-user";
import { notFound, unauthorized } from "@/lib/api-response";
import { getOwnedProject } from "@/lib/ownership";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  sourceCharacterId: z.string().min(1),
  targetCharacterId: z.string().min(1),
  relationType: z.string().min(1),
  intensity: z.number().int().min(0).max(100).default(50),
  reciprocityType: z.string().default("bilateral"),
  note: z.string().optional().nullable(),
});

export async function GET(_req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const { id: projectId } = await ctx.params;
  const project = await getOwnedProject(user.id, projectId);
  if (!project) return notFound();

  const relationships = await prisma.characterRelationship.findMany({
    where: { projectId },
    orderBy: { updatedAt: "desc" },
    include: {
      source: { select: { id: true, name: true } },
      target: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ relationships });
}

export async function POST(req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const { id: projectId } = await ctx.params;
  const project = await getOwnedProject(user.id, projectId);
  if (!project) return notFound();

  const body = bodySchema.parse(await req.json());
  const relationship = await prisma.characterRelationship.create({
    data: {
      projectId,
      sourceCharacterId: body.sourceCharacterId,
      targetCharacterId: body.targetCharacterId,
      relationType: body.relationType,
      intensity: body.intensity,
      reciprocityType: body.reciprocityType,
      note: body.note,
    },
    include: {
      source: { select: { id: true, name: true } },
      target: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ relationship });
}
