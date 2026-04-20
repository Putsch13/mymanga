import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@manga-ai-studio/db";
import { getAppUser } from "@/lib/auth/get-app-user";
import { notFound, unauthorized, validationError } from "@/lib/api-response";
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

  // P0.5 — safeParse + gestion d'erreur pour éviter les 500 sur body invalide.
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return validationError("invalid_body");
  }
  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return validationError(
      parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join(", "),
    );
  }
  const body = parsed.data;

  // P0.5 — les IDs de personnages doivent appartenir au projet courant,
  // sinon on ouvre une faille cross-project (un user pourrait créer des
  // relations entre un perso de son projet et un perso d'un projet tiers).
  if (body.sourceCharacterId === body.targetCharacterId) {
    return validationError("source_and_target_must_differ");
  }
  const charsInProject = await prisma.character.findMany({
    where: {
      projectId,
      id: { in: [body.sourceCharacterId, body.targetCharacterId] },
    },
    select: { id: true },
  });
  const foundIds = new Set(charsInProject.map((c) => c.id));
  if (!foundIds.has(body.sourceCharacterId) || !foundIds.has(body.targetCharacterId)) {
    return validationError("character_not_in_project");
  }

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
