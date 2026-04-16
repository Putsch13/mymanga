import { NextResponse, NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@manga-ai-studio/db";
import { getAppUser } from "@/lib/auth/get-app-user";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  pipelineVersion: z.enum(["v1", "v2"]),
});

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id: projectId } = await params;
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const settings = await prisma.projectSettings.findFirst({
    where: { projectId },
    select: { pipelineVersion: true },
  });

  return NextResponse.json({ pipelineVersion: settings?.pipelineVersion ?? "v1" });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id: projectId } = await params;
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = bodySchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  const updated = await prisma.projectSettings.update({
    where: { projectId },
    data: { pipelineVersion: body.data.pipelineVersion },
  });

  return NextResponse.json({
    pipelineVersion: updated.pipelineVersion,
    message: `Pipeline version switched to ${body.data.pipelineVersion}`,
  });
}
