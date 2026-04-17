import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@manga-ai-studio/db";
import { runChapterOutlineFromJob, sendChapterOutlineJobRequested } from "@manga-ai-studio/workflow";
import { buildContinuationContext } from "@manga-ai-studio/continuity";
import { getAppUser } from "@/lib/auth/get-app-user";
import { canAccessMatureContent, canBypassMatureContent, getAgeGateMessage, projectRequiresAgeGate } from "@/lib/age-gate";
import { notFound, unauthorized, validationError } from "@/lib/api-response";
import { checkRateLimit } from "@/lib/rate-limit";

type Ctx = { params: Promise<{ id: string; chapterId: string }> };

const bodySchema = z.object({
  /** Instruction libre (spec PDF §4.9) */
  userIntent: z.string().min(1),
  /** Option rapide : twist, action, romance, etc. */
  quickTag: z.string().optional(),
});

/**
 * Enregistre la demande de suite : nouveau chapitre + job outline (Inngest ou exécution directe si pas de file).
 */
export async function POST(req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();

  // P1-6 : rate limit — cette route déclenche un outline AI coûteux
  const rl = await checkRateLimit(user.id, "chapter-outline");
  if (!rl.ok) {
    return NextResponse.json({ error: rl.message }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSecs) } });
  }

  const { id: projectId, chapterId } = await ctx.params;
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: user.id },
    include: { user: { include: { preferences: true } } },
  });
  if (!project) return notFound();
  if (projectRequiresAgeGate(project.contentRating, project.intensityLayer) && !canAccessMatureContent(project.user, project.user.preferences)) {
    return validationError(getAgeGateMessage(project.contentRating));
  }
  if (canBypassMatureContent(project.user.email)) {
    console.warn(`[adult-bypass] ${project.user.email} bypassed mature gate on /api/projects/${projectId}/chapters/${chapterId}/continue (NODE_ENV=${process.env.NODE_ENV})`);
  }
  const chapter = await prisma.chapter.findFirst({ where: { id: chapterId, projectId } });
  if (!chapter) return notFound();
  const body = bodySchema.parse(await req.json());

  const last = await prisma.chapter.findFirst({
    where: { projectId },
    orderBy: { chapterNumber: "desc" },
  });
  const nextNum = (last?.chapterNumber ?? 0) + 1;

  const continuationNote = body.quickTag ? `[${body.quickTag}] ${body.userIntent}` : body.userIntent;

  // ── Construire le contexte de continuation (Continuity Engine) ─────────────
  const continuationContext = await buildContinuationContext(prisma, {
    projectId,
    fromChapterId: chapterId,
  }).catch((err) => {
    console.warn(`[continue] buildContinuationContext failed for chapter ${chapterId}:`, err instanceof Error ? err.message : err);
    return null;
  });

  const nextChapter = await prisma.chapter.create({
    data: {
      projectId,
      chapterNumber: nextNum,
      title: `Chapitre ${nextNum} (suite)`,
      userIntent: continuationNote,
      status: "draft",
      summary: null,
    },
  });

  const job = await prisma.job.create({
    data: {
      userId: user.id,
      projectId,
      chapterId: nextChapter.id,
      type: "GENERATE_CHAPTER_OUTLINE",
      status: "queued",
      input: {
        source: "user_continuation",
        fromChapterId: chapterId,
        intent: body.userIntent,
        quickTag: body.quickTag ?? null,
        continuationContext: continuationContext ?? undefined,
      },
    },
  });

  const sent = await sendChapterOutlineJobRequested({
    jobId: job.id,
    projectId,
    chapterId: nextChapter.id,
    userId: user.id,
  });

  let message = sent.ok
    ? "Suite enregistrée — outline en file (Inngest). Rouvre le lecteur dans quelques instants."
    : "Suite enregistrée — génération outline immédiate (pas de INNGEST_EVENT_KEY).";

  if (!sent.ok) {
    const run = await runChapterOutlineFromJob(job.id);
    message = run.ok ? `${message} Outline appliqué.` : `${message} Échec outline : ${run.error ?? "inconnu"}`;
  }

  return NextResponse.json({
    ok: true,
    nextChapterId: nextChapter.id,
    nextChapterNumber: nextNum,
    outlineQueued: sent.ok,
    message,
  });
}
