import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@manga-ai-studio/db";
import { sendChapterGenerateRequested } from "@manga-ai-studio/workflow";
import { getAppUser } from "@/lib/auth/get-app-user";
import { notFound, unauthorized, badRequest } from "@/lib/api-response";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  chapterId: z.string().min(1),
});

/**
 * Enfile le pipeline Inngest manga-first (texte + DA découpée).
 */
export async function POST(req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const { id: projectId } = await ctx.params;
  const project = await prisma.project.findFirst({ where: { id: projectId, userId: user.id } });
  if (!project) return notFound();
  const body = bodySchema.parse(await req.json());
  const chapter = await prisma.chapter.findFirst({
    where: { id: body.chapterId, projectId },
  });
  if (!chapter) return badRequest("Chapitre introuvable");

  const sent = await sendChapterGenerateRequested({
    projectId,
    chapterId: chapter.id,
    userId: user.id,
  });

  await prisma.job.create({
    data: {
      userId: user.id,
      projectId,
      chapterId: chapter.id,
      type: "GENERATE_CHAPTER_OUTLINE",
      status: sent.ok ? "queued" : "completed",
      input: { source: "pipeline_route", inngest: sent },
      output: sent.ok ? {} : { skipped: sent.skipped },
    },
  });

  return NextResponse.json({
    ok: true,
    inngest: sent,
    message: sent.ok
      ? "Pipeline enqueued (Inngest)."
      : "Inngest non configuré : job journalisé en échec contrôlé — définissez INNGEST_EVENT_KEY.",
  });
}
