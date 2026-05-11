import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { prisma } from "@manga-ai-studio/db";
import { getAppUser } from "@/lib/auth/get-app-user";
import { notFound, unauthorized } from "@/lib/api-response";

type Ctx = { params: Promise<{ id: string; locationId: string }> };

const locationPatchSchema = z
  .object({
    name: z.string().min(1).optional(),
    type: z.string().optional().nullable(),
    description: z.string().optional().nullable(),
    visualBrief: z.string().optional().nullable(),
    establishedVisualBrief: z.string().optional().nullable(),
    canonImageUrl: z.string().url().or(z.literal("")).optional().nullable(),
    canonLocked: z.boolean().optional(),
  })
  .strict();

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const { id: projectId, locationId } = await ctx.params;

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: user.id },
    select: { id: true },
  });
  if (!project) return notFound();

  let body: z.infer<typeof locationPatchSchema>;
  try {
    body = locationPatchSchema.parse(await req.json());
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { error: "location_patch_invalid", details: err.issues.map((i) => i.message) },
        { status: 422 },
      );
    }
    throw err;
  }

  const existing = await prisma.location.findFirst({
    where: { id: locationId, projectId },
    select: { id: true },
  });
  if (!existing) return notFound();

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.type !== undefined) data.type = body.type;
  if (body.description !== undefined) data.description = body.description;
  if (body.visualBrief !== undefined) data.visualBrief = body.visualBrief;
  if (body.establishedVisualBrief !== undefined) data.establishedVisualBrief = body.establishedVisualBrief;
  if (body.canonImageUrl !== undefined) {
    data.canonImageUrl = body.canonImageUrl === "" ? null : body.canonImageUrl;
  }
  if (body.canonLocked !== undefined) data.canonLocked = body.canonLocked;

  const updated = await prisma.location.update({
    where: { id: locationId },
    data,
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

  return NextResponse.json({ location: updated });
}
