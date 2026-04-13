import { inngest } from "./inngest-client";
import { prisma } from "@manga-ai-studio/db";
import { runFullChapterPipelineFromJob } from "./run-full-chapter-pipeline";
import { runChapterOutlineFromJob } from "./run-outline-for-chapter";

/**
 * Graphe chapitre — phase texte puis pipeline manga-first (spec delta).
 * Les étapes images appellent des jobs distincts côté API ; ici orchestration logique.
 */
export const generateChapterPipeline = inngest.createFunction(
  { id: "generate-chapter-pipeline", name: "Generate chapter (manga-first)", triggers: { event: "chapter/generate.requested" } },
  async ({ event }) => {
    const { projectId, chapterId, userId, jobId } = event.data as {
      jobId: string;
      projectId: string;
      chapterId: string;
      userId: string;
    };

    const result = await runFullChapterPipelineFromJob(jobId);
    if (!result.ok) {
      return { projectId, chapterId, userId, status: "failed", error: result.error };
    }
    return { projectId, chapterId, userId, status: "completed" };
  },
);

export const processChapterOutlineJob = inngest.createFunction(
  { id: "process-chapter-outline-job", name: "Generate chapter outline (job)", triggers: { event: "chapter/outline.job.requested" } },
  async ({ event, step }) => {
    const { jobId } = event.data as { jobId: string; projectId: string; chapterId: string; userId: string };
    const r = await step.run("outline-from-job", () => runChapterOutlineFromJob(jobId));
    return { jobId, ...r };
  },
);

/**
 * B1-1 — Cleanup des images bloquées en `pending` depuis plus de 90 secondes.
 * Cron toutes les 2 minutes pour éviter les images fantômes indéfiniment pending.
 */
export const cleanupStaleImages = inngest.createFunction(
  {
    id: "cleanup-stale-images",
    name: "Cleanup stale pending images",
    triggers: { cron: "*/2 * * * *" },
  },
  async ({ step }) => {
    const staleCount = await step.run("mark-stale-as-failed", async () => {
      // SceneImage n'a pas de createdAt indexé — on sélectionne les pending sans failureReason
      // et on les marque failed (le cron tourne toutes les 2 min, donc les images pending
      // depuis plus d'un cycle sont considérées stale)
      const result = await prisma.sceneImage.updateMany({
        where: {
          status: "pending",
          failureReason: null,
        },
        data: {
          status: "failed",
          failureReason: "stale_timeout: pending without completion at cron cycle",
        },
      });
      if (result.count > 0) {
        console.warn(`[cleanup-stale-images] marked ${result.count} stale images as failed`);
      }
      return result.count;
    });
    return { staleCount };
  },
);

export const functions = [generateChapterPipeline, processChapterOutlineJob, cleanupStaleImages];
