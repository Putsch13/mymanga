import { NextResponse } from "next/server";
import { getAppUser } from "@/lib/auth/get-app-user";
import { prisma } from "@manga-ai-studio/db";
import { unauthorized, notFound } from "@/lib/api-response";

type Ctx = { params: Promise<{ id: string; npcId: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();

  const { id: projectId, npcId } = await ctx.params;
  const body = await req.json() as { name?: string };

  const npc = await prisma.npcVisualProfile.findFirst({
    where: { stableNpcId: npcId, projectId },
  });
  if (!npc) return notFound();

  const characterName = body.name ?? npc.role ?? "Personnage récurrent";
  const slug = characterName.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  const character = await prisma.character.create({
    data: {
      projectId,
      name: characterName,
      slug: `${slug}-${Date.now()}`,
      roleType: "secondary",
      appearance: npc.shortVisualCore,
      outfitDefault: npc.outfitSignature ?? undefined,
    },
  });

  await prisma.npcVisualProfile.update({
    where: { stableNpcId: npcId },
    data: {
      characterId: character.id,
      promotionStatus: "locked",
      importanceLevel: "important",
    },
  });

  return NextResponse.json({
    success: true,
    characterId: character.id,
    characterName: character.name,
    message: `${characterName} est maintenant un personnage de la série.`,
  });
}
