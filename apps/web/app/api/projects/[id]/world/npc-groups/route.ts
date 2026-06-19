import { NextResponse } from "next/server";
import { prisma } from "@manga-ai-studio/db";
import { getAppUser } from "@/lib/auth/get-app-user";
import { notFound, unauthorized } from "@/lib/api-response";
import { getOwnedProject } from "@/lib/ownership";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const { id: projectId } = await ctx.params;
  const project = await getOwnedProject(user.id, projectId);
  if (!project) return notFound();

  const groups = await prisma.npcGroup.findMany({
    where: { projectId },
    orderBy: [{ appearanceCount: "desc" }, { createdAt: "asc" }],
  });

  return NextResponse.json({
    npcGroups: groups.map((g) => ({
      id: g.id,
      slug: g.slug,
      label: g.label,
      description: g.description,
      visualProfile: g.visualProfile,
      outfit: g.outfit,
      silhouette: g.silhouette,
      source: g.source,
      userEdited: g.userEdited,
      appearanceCount: g.appearanceCount,
      firstSeenChapterId: g.firstSeenChapterId,
      createdAt: g.createdAt.toISOString(),
      updatedAt: g.updatedAt.toISOString(),
    })),
  });
}
