import { NextResponse } from "next/server";
import { prisma } from "@manga-ai-studio/db";
import { getAppUser } from "@/lib/auth/get-app-user";
import { notFound, unauthorized } from "@/lib/api-response";

type Ctx = { params: Promise<{ id: string }> };

/**
 * SPRINT 3 — endpoint lecture des Location d'un projet (audit v7 :
 * la page /world ne couvrait que NPC + props ; les lieux étaient invisibles
 * côté UI alors qu'ils sont la base de la cohérence visuelle des décors).
 *
 * Réponse identique côté shape pour permettre une lecture simple côté client.
 */
export async function GET(_req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const { id: projectId } = await ctx.params;

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: user.id },
    select: { id: true },
  });
  if (!project) return notFound();

  const locations = await prisma.location.findMany({
    where: { projectId },
    orderBy: [{ canonLocked: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      type: true,
      description: true,
      visualBrief: true,
      establishedVisualBrief: true,
      canonImageUrl: true,
      canonLocked: true,
    },
  });

  return NextResponse.json({ locations });
}
