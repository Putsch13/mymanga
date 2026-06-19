import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@manga-ai-studio/db";
import { getAppUser } from "@/lib/auth/get-app-user";

type Ctx = { params: Promise<{ sceneImageId: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { sceneImageId } = await params;
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sceneImage = await prisma.sceneImage.findUnique({
    where: { id: sceneImageId },
    select: {
      id: true,
      panelNumber: true,
      panelCast: true,
      debugTrace: true,
      prompt: true,
      negativePrompt: true,
      status: true,
      referenceImageIds: true,
      metadata: true,
      retryCount: true,
      scene: {
        select: {
          chapter: {
            select: {
              project: { select: { userId: true } },
            },
          },
        },
      },
    },
  });

  if (!sceneImage) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (sceneImage.scene.chapter.project.userId !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    id: sceneImage.id,
    panelNumber: sceneImage.panelNumber,
    panelCast: sceneImage.panelCast,
    debugTrace: sceneImage.debugTrace,
    promptDigest: sceneImage.prompt?.slice(0, 500) ?? null,
    negativeDigest: sceneImage.negativePrompt?.slice(0, 300) ?? null,
    status: sceneImage.status,
    retryCount: sceneImage.retryCount,
  });
}
