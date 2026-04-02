import { inngest } from "./inngest-client";
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

export const functions = [generateChapterPipeline, processChapterOutlineJob];
