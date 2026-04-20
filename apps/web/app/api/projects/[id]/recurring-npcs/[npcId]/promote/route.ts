import { NextResponse } from "next/server";
import { z } from "zod";
import { getAppUser } from "@/lib/auth/get-app-user";
import { prisma } from "@manga-ai-studio/db";
import { unauthorized, notFound, validationError } from "@/lib/api-response";
import { getOwnedProject } from "@/lib/ownership";

type Ctx = { params: Promise<{ id: string; npcId: string }> };

// P0.5 — body validé strictement (avant on acceptait n'importe quoi et une
// injection de `name` avec un caractère spécial cassait la création du slug).
const promoteBodySchema = z.object({
  name: z.string().min(1).max(120).optional(),
});

export async function POST(req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();

  const { id: projectId, npcId } = await ctx.params;

  // P0.5 — ownership check : interdire la promotion d'un NPC sur un projet tiers.
  const project = await getOwnedProject(user.id, projectId);
  if (!project) {
    return notFound();
  }

  let rawBody: unknown = {};
  try {
    rawBody = await req.json();
  } catch {
    rawBody = {};
  }
  const parsed = promoteBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return validationError(
      parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join(", "),
    );
  }

  // P0.5 — on lit le NPC scoped au projectId (la clé unique stableNpcId est
  // globale, donc on ajoute explicitement projectId pour éviter toute
  // confusion cross-project).
  const npc = await prisma.npcVisualProfile.findFirst({
    where: { stableNpcId: npcId, projectId },
  });
  if (!npc) return notFound();

  const characterName = parsed.data.name ?? npc.role ?? "Personnage récurrent";
  const slug = characterName.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "npc";

  // P0.5 — transaction Prisma : la création du Character et la mise à jour du
  // NpcVisualProfile doivent réussir ou échouer ensemble. Sinon on laisse un
  // Character orphelin ou un NPC promu sans lien.
  const result = await prisma.$transaction(async (tx) => {
    const character = await tx.character.create({
      data: {
        projectId,
        name: characterName,
        slug: `${slug}-${Date.now()}`,
        roleType: "secondary",
        appearance: npc.shortVisualCore,
        outfitDefault: npc.outfitSignature ?? undefined,
      },
    });

    await tx.npcVisualProfile.update({
      // stableNpcId est déjà @unique globalement, mais on garde le check
      // projectId en amont (findFirst ci-dessus) pour bloquer les cross-project.
      where: { stableNpcId: npcId },
      data: {
        characterId: character.id,
        promotionStatus: "locked",
        importanceLevel: "important",
      },
    });

    return character;
  });

  return NextResponse.json({
    success: true,
    characterId: result.id,
    characterName: result.name,
    message: `${result.name} est maintenant un personnage de la série.`,
  });
}
