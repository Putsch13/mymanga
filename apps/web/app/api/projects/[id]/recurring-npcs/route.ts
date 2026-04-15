import { NextResponse } from "next/server";
import { getAppUser } from "@/lib/auth/get-app-user";
import { prisma } from "@manga-ai-studio/db";
import { unauthorized, notFound } from "@/lib/api-response";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();

  const { id: projectId } = await ctx.params;

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: user.id },
    select: { id: true },
  });
  if (!project) return notFound();

  const npcs = await prisma.npcVisualProfile.findMany({
    where: {
      projectId,
      promotionStatus: { in: ["promoted", "locked"] },
    },
    orderBy: { appearanceCount: "desc" },
    take: 20,
    select: {
      stableNpcId: true,
      role: true,
      shortVisualCore: true,
      outfitSignature: true,
      appearanceCount: true,
      promotionStatus: true,
      speciesLabel: true,
      characterId: true,
    },
  });

  return NextResponse.json({
    npcs: npcs.map(n => ({
      stableNpcId: n.stableNpcId,
      label: n.role ?? "PNJ récurrent",
      shortVisualCore: n.shortVisualCore,
      outfitSignature: n.outfitSignature,
      appearanceCount: n.appearanceCount,
      promotionStatus: n.promotionStatus,
      speciesLabel: n.speciesLabel,
      isPromotedToCharacter: !!n.characterId,
    })),
  });
}
