import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { prisma, type Prisma } from "@manga-ai-studio/db";
import { getAppUser } from "@/lib/auth/get-app-user";
import { notFound, unauthorized } from "@/lib/api-response";

type Ctx = { params: Promise<{ id: string; locationId: string }> };

/**
 * Propagate un changement de lieu dans les visualWorldContract des chapitres brouillon.
 */
async function propagateLocationToChapters(
  projectId: string,
  location: { id: string; name: string; type: string | null; description: string | null; visualBrief: string | null; canonLocked: boolean },
) {
  const chapters = await prisma.chapter.findMany({
    where: { projectId, status: { in: ["draft", "planning"] } },
    select: { id: true, outline: true },
  });

  for (const chapter of chapters) {
    const outline = chapter.outline as Record<string, unknown> | null;
    if (!outline) continue;
    const vwc = outline.visualWorldContract as Record<string, unknown> | null;
    if (!vwc || !Array.isArray(vwc.locations)) continue;

    const locArr = vwc.locations as Array<Record<string, unknown>>;
    const idx = locArr.findIndex((l) => l.id === location.id);
    const patch = {
      id: location.id,
      label: location.name,
      kind: (location.type ?? "").trim() || "scene",
      description: (location.visualBrief ?? location.description ?? "").trim() || location.name,
      source: "user_canon" as const,
      canonPolicy: location.canonLocked ? ("locked" as const) : ("promote_candidate" as const),
    };
    if (idx >= 0) {
      locArr[idx] = { ...locArr[idx], ...patch };
    } else {
      locArr.push({ ...patch, visualAnchors: [location.name], architecture: [], lighting: [], atmosphere: [], recurringProps: [], negativeConstraints: [] });
    }

    await prisma.chapter.update({
      where: { id: chapter.id },
      data: {
        outline: {
          ...outline,
          visualWorldContract: { ...vwc, locations: locArr },
        } as unknown as Prisma.InputJsonValue,
      },
    });
  }
}

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

  // Auto-sync : propager le changement de lieu dans les chapitres brouillon
  // qui ont un visualWorldContract. Exécuté en best-effort (ne bloque pas la réponse).
  propagateLocationToChapters(projectId, updated).catch(() => {});

  return NextResponse.json({ location: updated });
}
