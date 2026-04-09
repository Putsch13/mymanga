import { NextResponse } from "next/server";
import { z } from "zod";
import { parseApprovedOutline } from "@manga-ai-studio/core";
import { estimateChapterTextTokensFromRules } from "@manga-ai-studio/billing";
import { prisma } from "@manga-ai-studio/db";
import { runFullChapterPipelineFromJob, sendChapterGenerateRequested } from "@manga-ai-studio/workflow";
import { getAppUser } from "@/lib/auth/get-app-user";
import { canAccessMatureContent, getAgeGateMessage, projectRequiresAgeGate } from "@/lib/age-gate";
import { notFound, unauthorized, badRequest, validationError } from "@/lib/api-response";
import { getGenerationStackStatus } from "@/lib/generation/stack-readiness";
import { checkRateLimit } from "@/lib/rate-limit";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  chapterId: z.string().min(1),
  focusCharacterIds: z.array(z.string()).optional(),
  selectedPlotLabel: z.enum(["safe", "bold", "shock"]).optional(),
  creativityControls: z.object({
    noveltyLevel: z.number().int().min(0).max(100).optional(),
    worldStrictness: z.number().int().min(0).max(100).optional(),
    visualExoticism: z.number().int().min(0).max(100).optional(),
    npcVariety: z.number().int().min(0).max(100).optional(),
    environmentRichness: z.number().int().min(0).max(100).optional(),
  }).optional(),
});

const draftSetupSchema = z.object({
  focusCharacterIds: z.array(z.string()).optional(),
  selectedPlotLabel: z.enum(["safe", "bold", "shock"]).nullable().optional(),
  creativityControls: z.object({
    noveltyLevel: z.number().int().min(0).max(100).optional(),
    worldStrictness: z.number().int().min(0).max(100).optional(),
    visualExoticism: z.number().int().min(0).max(100).optional(),
    npcVariety: z.number().int().min(0).max(100).optional(),
    environmentRichness: z.number().int().min(0).max(100).optional(),
  }).optional(),
});

/**
 * Enfile le pipeline Inngest manga-first (texte + DA découpée).
 */
export async function POST(req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const rl = checkRateLimit(user.id, "pipeline");
  if (!rl.ok) {
    return NextResponse.json({ error: rl.message }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSecs) } });
  }
  const stack = getGenerationStackStatus();
  if (!stack.canGenerateChapters) {
    return validationError("La stack de generation n'est pas prete pour un chapitre complet.", stack);
  }
  const { id: projectId } = await ctx.params;
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: user.id },
    include: { user: { include: { preferences: true } } },
  });
  if (!project) return notFound();
  if (projectRequiresAgeGate(project.contentRating, project.intensityLayer) && !canAccessMatureContent(project.user, project.user.preferences)) {
    return validationError(getAgeGateMessage(project.contentRating));
  }
  if (canAccessMatureContent(project.user, project.user.preferences) && project.user.email?.toLowerCase() === "test@gmail.com") {
    console.warn(`[adult-bypass] test@gmail.com bypassed mature gate on /api/projects/${projectId}/pipeline`);
  }
  const body = bodySchema.parse(await req.json());
  const chapter = await prisma.chapter.findFirst({
    where: { id: body.chapterId, projectId },
  });
  if (!chapter) return badRequest("Chapitre introuvable");
  const chapterOutlineRecord =
    chapter.outline && typeof chapter.outline === "object" && !Array.isArray(chapter.outline)
      ? (chapter.outline as Record<string, unknown>)
      : {};
  const approvedOutline = parseApprovedOutline(chapterOutlineRecord.approvedOutline);
  if (!approvedOutline) {
    return validationError("Valide d'abord le plan détaillé du chapitre avant de lancer la génération.");
  }

  const draftSetup = draftSetupSchema.safeParse(chapterOutlineRecord.draftSetup);
  const focusCharacterIds =
    body.focusCharacterIds && body.focusCharacterIds.length > 0
      ? body.focusCharacterIds
      : draftSetup.success
        ? (draftSetup.data.focusCharacterIds ?? [])
        : [];
  const selectedPlotLabel =
    body.selectedPlotLabel ?? (draftSetup.success ? draftSetup.data.selectedPlotLabel ?? undefined : undefined);
  const creativityControls =
    body.creativityControls ?? (draftSetup.success ? draftSetup.data.creativityControls ?? undefined : undefined);

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
        focusCharacterIds,
        selectedPlotLabel,
        creativityControls,
        approvedOutlineVersion: approvedOutline.approvalVersion,
      },
      output: {
        currentStep: "queued",
        steps: [],
        operationalStatus: stack.operationalStatus,
        degradedModes: stack.degradedModes,
        stackWarnings: stack.warnings,
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
    try {
      const run = await runFullChapterPipelineFromJob(job.id);
      return NextResponse.json({
        ok: run.ok,
        jobId: job.id,
        operationalStatus: stack.operationalStatus,
        degradedModes: stack.degradedModes,
        message: run.ok
          ? "Pipeline exécuté immédiatement (Inngest non configuré)."
          : `Échec pipeline : ${run.error ?? "inconnu"}`,
      });
    } catch (pipelineError) {
      const msg = pipelineError instanceof Error ? pipelineError.message : "pipeline_crash";
      console.error("[pipeline/route] crash:", msg);
      return NextResponse.json({
        ok: false,
        jobId: job.id,
        operationalStatus: stack.operationalStatus,
        degradedModes: stack.degradedModes,
        message: `Crash pipeline : ${msg}`,
      }, { status: 500 });
    }
  }

  return NextResponse.json({
    ok: true,
    jobId: job.id,
    inngest: sent,
    operationalStatus: stack.operationalStatus,
    degradedModes: stack.degradedModes,
    stackWarnings: stack.warnings,
    message: "Pipeline enqueued (Inngest).",
  });
}
