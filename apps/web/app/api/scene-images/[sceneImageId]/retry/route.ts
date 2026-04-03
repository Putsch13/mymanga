import { NextResponse } from "next/server";
import type { Prisma } from "@manga-ai-studio/db";
import { prisma } from "@manga-ai-studio/db";
import { runRoutedImageGeneration } from "@manga-ai-studio/ai";
import { getAppUser } from "@/lib/auth/get-app-user";
import { notFound, unauthorized, validationError } from "@/lib/api-response";
import { getGenerationStackStatus } from "@/lib/generation/stack-readiness";
import { persistGeneratedImageIfNeeded } from "@/lib/images/persist-generated-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ sceneImageId: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const stack = getGenerationStackStatus();
  if (!stack.canGenerateImages) {
    return validationError("La stack image n'est pas prete pour relancer cette case.", stack);
  }
  const { sceneImageId } = await ctx.params;

  const img = await prisma.sceneImage.findFirst({
    where: { id: sceneImageId, scene: { chapter: { project: { userId: user.id } } } },
    include: { scene: { include: { chapter: { include: { project: true } } } } },
  });
  if (!img) return notFound();

  const project = img.scene.chapter.project;
  const intensityLayer = (project.intensityLayer as string | null) ?? "TEEN";

  if (!img.prompt) {
    return validationError("Ce panel n'a pas de prompt à régénérer.");
  }

  const metadata = ((img.metadata ?? {}) as unknown) as Record<string, unknown>;
  const characters = Array.isArray(metadata.characters) ? metadata.characters : [];

  await prisma.sceneImage.update({
    where: { id: img.id },
    data: {
      status: "pending",
      metadata: ({ ...metadata, retryRequestedAt: new Date().toISOString() } as unknown) as Prisma.InputJsonValue,
    },
  });

  try {
    const out = await runRoutedImageGeneration(
      {
        mode: "PANEL_DRAFT",
        contentIntensityLayer: intensityLayer,
        isNewCharacter: false,
        hasCanonReferences: false,
        characterCountInScene: characters.length > 0 ? characters.length : 1,
        needsInpaint: false,
        needsPoseVariation: false,
        preferPhotorealCover: false,
        explicitBlocked: intensityLayer === "RESTRICTED_BLOCKED_VISUAL",
        goreStylizedMature: false,
      },
      {
        mode: "PANEL_DRAFT",
        positivePrompt: img.prompt,
        negativePrompt: img.negativePrompt ?? undefined,
        width: img.width ?? 768,
        height: img.height ?? 1024,
        providerParams: { contentIntensityLayer: intensityLayer, mode: "PANEL_DRAFT" },
      },
    );

    if (!out.ok) {
      await prisma.sceneImage.update({
        where: { id: img.id },
        data: {
          status: "blocked",
          metadata: ({ ...metadata, blockedReason: out.reason, generationLog: out.log } as unknown) as Prisma.InputJsonValue,
        },
      });
      return validationError(out.reason);
    }

    const persisted = await persistGeneratedImageIfNeeded({
      imageUrl: out.result.imageUrl,
      objectPath: `projects/${project.id}/chapters/${img.scene.chapter.id}/panels/${img.id}-retry-${Date.now()}`,
    });

    if (!persisted.ok) {
      await prisma.sceneImage.update({
        where: { id: img.id },
        data: {
          status: "failed",
          metadata: ({ ...metadata, error: persisted.error, generationLog: out.log } as unknown) as Prisma.InputJsonValue,
        },
      });
      return NextResponse.json({ ok: false, error: persisted.error }, { status: 502 });
    }

    await prisma.sceneImage.update({
      where: { id: img.id },
      data: {
        status: "completed",
        imageUrl: persisted.url,
        provider: out.result.provider,
        model: out.result.model,
        routingDecision: (out.routing as unknown) as Prisma.InputJsonValue,
        metadata: ({ ...metadata, generationLog: out.log, persisted: persisted.persisted } as unknown) as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "retry_failed";
    await prisma.sceneImage.update({
      where: { id: img.id },
      data: { status: "failed", metadata: ({ ...metadata, error: msg } as unknown) as Prisma.InputJsonValue },
    });
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}

