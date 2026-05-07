import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@manga-ai-studio/db";
import { getAppUser } from "@/lib/auth/get-app-user";
import { notFound, unauthorized } from "@/lib/api-response";
import { getOwnedProject } from "@/lib/ownership";

type Ctx = { params: Promise<{ id: string; propId: string }> };

const patchSchema = z.object({
  label: z.string().min(2).max(80).optional(),
  description: z.string().max(500).optional().nullable(),
  visualDescription: z.string().max(500).optional().nullable(),
  kind: z
    .enum(["weapon", "artefact", "tool", "accessory", "vehicle", "other"])
    .optional(),
  narrativeWeight: z.enum(["key", "recurring", "one_shot"]).optional(),
});

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const { id: projectId, propId } = await ctx.params;
  const project = await getOwnedProject(user.id, projectId);
  if (!project) return notFound();

  const prop = await prisma.worldProp.findUnique({ where: { id: propId } });
  if (!prop || prop.projectId !== projectId) return notFound();

  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_payload", details: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) },
      { status: 400 },
    );
  }

  const updated = await prisma.worldProp.update({
    where: { id: propId },
    data: {
      ...parsed.data,
      userEdited: true,
    },
  });

  return NextResponse.json({ worldProp: updated });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const { id: projectId, propId } = await ctx.params;
  const project = await getOwnedProject(user.id, projectId);
  if (!project) return notFound();

  const prop = await prisma.worldProp.findUnique({ where: { id: propId } });
  if (!prop || prop.projectId !== projectId) return notFound();

  await prisma.worldProp.delete({ where: { id: propId } });
  return NextResponse.json({ ok: true });
}
