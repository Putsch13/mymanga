import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@manga-ai-studio/db";
import { getAppUser } from "@/lib/auth/get-app-user";
import { notFound, unauthorized } from "@/lib/api-response";
import { getOwnedProject } from "@/lib/ownership";

type Ctx = { params: Promise<{ id: string; groupId: string }> };

const patchSchema = z.object({
  label: z.string().min(2).max(80).optional(),
  description: z.string().max(500).optional().nullable(),
  visualProfile: z.string().max(500).optional().nullable(),
  outfit: z.string().max(300).optional().nullable(),
  silhouette: z.string().max(300).optional().nullable(),
});

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const { id: projectId, groupId } = await ctx.params;
  const project = await getOwnedProject(user.id, projectId);
  if (!project) return notFound();

  const group = await prisma.npcGroup.findUnique({ where: { id: groupId } });
  if (!group || group.projectId !== projectId) return notFound();

  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_payload", details: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) },
      { status: 400 },
    );
  }

  // Toute édition utilisateur flag userEdited=true → futurs runs IA respectent.
  const updated = await prisma.npcGroup.update({
    where: { id: groupId },
    data: {
      ...parsed.data,
      userEdited: true,
    },
  });

  return NextResponse.json({ npcGroup: updated });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const { id: projectId, groupId } = await ctx.params;
  const project = await getOwnedProject(user.id, projectId);
  if (!project) return notFound();

  const group = await prisma.npcGroup.findUnique({ where: { id: groupId } });
  if (!group || group.projectId !== projectId) return notFound();

  await prisma.npcGroup.delete({ where: { id: groupId } });
  return NextResponse.json({ ok: true });
}
