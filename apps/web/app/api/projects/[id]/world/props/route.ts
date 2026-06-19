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

  const props = await prisma.worldProp.findMany({
    where: { projectId },
    orderBy: [{ appearanceCount: "desc" }, { createdAt: "asc" }],
  });

  return NextResponse.json({
    worldProps: props.map((p) => ({
      id: p.id,
      slug: p.slug,
      label: p.label,
      description: p.description,
      visualDescription: p.visualDescription,
      kind: p.kind,
      narrativeWeight: p.narrativeWeight,
      source: p.source,
      userEdited: p.userEdited,
      appearanceCount: p.appearanceCount,
      firstSeenChapterId: p.firstSeenChapterId,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    })),
  });
}
