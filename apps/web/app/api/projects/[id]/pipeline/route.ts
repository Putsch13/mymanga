import { NextResponse } from "next/server";
import { z } from "zod";
import { estimateChapterTextTokensFromRules } from "@manga-ai-studio/billing";
import { prisma } from "@manga-ai-studio/db";
import { runFullChapterPipelineFromJob, sendChapterGenerateRequested } from "@manga-ai-studio/workflow";
import { getAppUser } from "@/lib/auth/get-app-user";
import { canAccessMatureContent, getAgeGateMessage, projectRequiresAgeGate } from "@/lib/age-gate";
import { notFound, unauthorized, badRequest, validationError } from "@/lib/api-response";

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
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: user.id },
    include: { user: { include: { preferences: true } } },
  });
  if (!project) return notFound();
  if (projectRequiresAgeGate(project.contentRating) && !canAccessMatureContent(project.user, project.user.preferences)) {
    return validationError(getAgeGateMessage(project.contentRating));
  }
  const body = bodySchema.parse(await req.json());
  const chapter = await prisma.chapter.findFirst({
    where: { id: body.chapterId, projectId },
  });
  if (!chapter) return badRequest("Chapitre introuvable");

  const estimatedCost = await estimateChapterTextTokensFromRules();
  const job = await prisma.job.create({
    data: {
      userId: user.id,
      projectId,
      chapterId: chapter.id,
      type: "GENERATE_CHAPTER_SCRIPT",
      status: "queued",
      estimatedTokenCost: estimatedCost,
      input: {
        source: "pipeline_route",
        chapterId: chapter.id,
      },
      output: {
        currentStep: "queued",
        steps: [],
      },
    },
  });

  const sent = await sendChapterGenerateRequested({
    jobId: job.id,
    projectId,
    chapterId: chapter.id,
    userId: user.id,
  });

  if (!sent.ok) {
    const run = await runFullChapterPipelineFromJob(job.id);
    return NextResponse.json({
      ok: run.ok,
      jobId: job.id,
      message: run.ok
        ? "Pipeline exécuté immédiatement (Inngest non configuré)."
        : `Échec pipeline local : ${run.error ?? "inconnu"}`,
    });
  }

  return NextResponse.json({
    ok: true,
    jobId: job.id,
    inngest: sent,
    message: "Pipeline enqueued (Inngest).",
  });
}
