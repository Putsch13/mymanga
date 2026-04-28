import { NextResponse } from "next/server";
import { prisma } from "@manga-ai-studio/db";
import { runFullChapterPipelineFromJob, runChapterOutlineFromJob } from "@manga-ai-studio/workflow";
import { getAppUser } from "@/lib/auth/get-app-user";
import { notFound, unauthorized, validationError } from "@/lib/api-response";
import { getGenerationStackStatus } from "@/lib/generation/stack-readiness";
import { premiumVisualQaPreflightResponse } from "@/lib/generation/premium-visual-qa-preflight";
import { isPremiumStrictProductionDuplicateLaunchBlocked } from "@/lib/generation/premium-strict-api-guard";

type Ctx = { params: Promise<{ jobId: string }> };

/**
 * Fallback manuel : exécute un job immédiatement (sans Inngest).
 * Utile si INNGEST_EVENT_KEY est présent mais que l'app Inngest n'est pas synchronisée.
 */
export async function POST(_req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const { jobId } = await ctx.params;

  const job = await prisma.job.findFirst({
    where: { id: jobId, userId: user.id },
    select: { id: true, status: true, type: true },
  });
  if (!job) return notFound();

  if (["completed", "failed", "partial_success", "canceled", "refunded"].includes(job.status)) {
    return validationError("Ce job est terminé et ne peut pas être relancé.", { status: job.status });
  }

  if (job.type === "GENERATE_CHAPTER_SCRIPT") {
    if (isPremiumStrictProductionDuplicateLaunchBlocked()) {
      return validationError(
        "En production (premium-only), utilisez uniquement le lancement chapitre depuis le studio (POST .../chapters/[chapterId]/launch).",
      );
    }
    const stack = getGenerationStackStatus();
    if (!stack.canGenerateChapters) {
      return validationError("La stack de generation n'est pas prete pour executer ce job.", stack);
    }
    const visualBlocked = premiumVisualQaPreflightResponse();
    if (visualBlocked) return visualBlocked;
    const r = await runFullChapterPipelineFromJob(job.id);
    if (!r.ok) {
      return NextResponse.json({ ok: false, jobId: job.id, error: r.error ?? "unknown" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, jobId: job.id, mode: "sync_pipeline" });
  }

  if (job.type === "GENERATE_CHAPTER_OUTLINE") {
    const r = await runChapterOutlineFromJob(job.id);
    if (!r.ok) {
      return NextResponse.json({ ok: false, jobId: job.id, error: r.error ?? "unknown" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, jobId: job.id, mode: "sync_outline" });
  }

  return validationError("Type de job non supporté par run-now.", { type: job.type });
}

