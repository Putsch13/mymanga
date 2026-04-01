import { NextResponse } from "next/server";
import { z } from "zod";
import {
  prisma,
  AnatomyBias,
  BackgroundDensity,
  CameraLanguage,
  ContrastProfile,
  LineWeight,
  RenderFamily,
  ShadingMode,
} from "@manga-ai-studio/db";
import { getAppUser } from "@/lib/auth/get-app-user";
import { notFound, unauthorized } from "@/lib/api-response";

type Ctx = { params: Promise<{ id: string }> };

const updateSchema = z.object({
  renderFamily: z.nativeEnum(RenderFamily).optional(),
  lineWeight: z.nativeEnum(LineWeight).optional(),
  shadingMode: z.nativeEnum(ShadingMode).optional(),
  contrastProfile: z.nativeEnum(ContrastProfile).optional(),
  anatomyBias: z.nativeEnum(AnatomyBias).optional(),
  backgroundDensity: z.nativeEnum(BackgroundDensity).optional(),
  cameraLanguage: z.nativeEnum(CameraLanguage).optional(),
  approvedLoraIds: z.array(z.string()).optional(),
  negativeConstraints: z.array(z.string()).optional(),
  styleRefImageUrl: z.union([z.string().url(), z.literal("")]).optional().nullable(),
});

export async function GET(_req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const { id: projectId } = await ctx.params;
  const project = await prisma.project.findFirst({ where: { id: projectId, userId: user.id } });
  if (!project) return notFound();
  const pack = await prisma.stylePack.findFirst({
    where: { projectId },
    orderBy: { version: "desc" },
  });
  return NextResponse.json({ stylePack: pack });
}

export async function PUT(req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const { id: projectId } = await ctx.params;
  const project = await prisma.project.findFirst({ where: { id: projectId, userId: user.id } });
  if (!project) return notFound();
  const body = updateSchema.parse(await req.json());
  const latest = await prisma.stylePack.findFirst({
    where: { projectId },
    orderBy: { version: "desc" },
  });
  if (!latest) {
    const created = await prisma.stylePack.create({
      data: {
        projectId,
        version: 1,
        ...body,
        approvedLoraIds: body.approvedLoraIds ?? [],
        negativeConstraints: body.negativeConstraints ?? [],
      },
    });
    return NextResponse.json({ stylePack: created });
  }
  const updated = await prisma.stylePack.update({
    where: { id: latest.id },
    data: {
      ...body,
      ...(body.approvedLoraIds !== undefined ? { approvedLoraIds: body.approvedLoraIds } : {}),
      ...(body.negativeConstraints !== undefined ? { negativeConstraints: body.negativeConstraints } : {}),
    },
  });
  return NextResponse.json({ stylePack: updated });
}
