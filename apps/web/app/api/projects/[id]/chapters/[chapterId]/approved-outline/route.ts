import { NextResponse } from "next/server";
import { approvedOutlineSchema } from "@manga-ai-studio/core";
import { prisma, type Prisma } from "@manga-ai-studio/db";
import { notFound, unauthorized } from "@/lib/api-response";
import { getAppUser } from "@/lib/auth/get-app-user";
import { getOwnedChapter } from "@/lib/ownership";

type Ctx = { params: Promise<{ id: string; chapterId: string }> };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const { id: projectId, chapterId } = await ctx.params;
  const chapter = await getOwnedChapter(user.id, projectId, chapterId);
  if (!chapter) return notFound();

  const approvedOutline = approvedOutlineSchema.parse((await req.json()).approvedOutline);
  const existingOutline = asRecord(chapter.outline);

  const updated = await prisma.chapter.update({
    where: { id: chapterId },
    data: {
      outline: ({
        ...existingOutline,
        approvedOutline,
      } as unknown) as Prisma.InputJsonValue,
    },
  });

  return NextResponse.json({
    ok: true,
    chapterId: updated.id,
    approvedOutline,
  });
}
