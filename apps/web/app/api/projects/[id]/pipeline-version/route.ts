import { NextResponse, NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@manga-ai-studio/db";
import { getAppUser } from "@/lib/auth/get-app-user";
import { getOwnedProject } from "@/lib/ownership";
import { parseJsonBody } from "@/lib/parse-json-body";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  pipelineVersion: z.enum(["v1", "v2"]),
});

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id: projectId } = await params;
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // P0.5 — ownership check : un utilisateur ne doit pas pouvoir lire la
  // configuration pipeline d'un projet tiers, même s'il devine l'UUID.
  const project = await getOwnedProject(user.id, projectId);
  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

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

  // P0.5 — ownership check obligatoire AVANT toute écriture.
  const project = await getOwnedProject(user.id, projectId);
  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // P1.4 — parsing + validation unifies via parseJsonBody.
  const parsed = await parseJsonBody(req, bodySchema);
  if (!parsed.ok) return parsed.response;

  // P0.5 — upsert pour supporter le first-write (certains projets n'ont pas
  // encore de ProjectSettings ; l'ancien `update` levait P2025).
  const updated = await prisma.projectSettings.upsert({
    where: { projectId },
    update: { pipelineVersion: parsed.data.pipelineVersion },
    create: { projectId, pipelineVersion: parsed.data.pipelineVersion },
  });

  return NextResponse.json({
    pipelineVersion: updated.pipelineVersion,
    message: `Pipeline version switched to ${parsed.data.pipelineVersion}`,
  });
}
