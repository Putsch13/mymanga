import { inngest } from "./inngest-client";
import { runChapterOutlineFromJob, runOutlineForChapterId } from "./run-outline-for-chapter";

/**
 * Graphe chapitre — phase texte puis pipeline manga-first (spec delta).
 * Les étapes images appellent des jobs distincts côté API ; ici orchestration logique.
 */
export const generateChapterPipeline = inngest.createFunction(
  { id: "generate-chapter-pipeline", name: "Generate chapter (manga-first)" },
  { event: "chapter/generate.requested" },
  async ({ event, step }) => {
    const { projectId, chapterId, userId } = event.data as {
      projectId: string;
      chapterId: string;
      userId: string;
    };

    await step.run("outline", async () => {
      const r = await runOutlineForChapterId(chapterId);
      return { ok: r.ok, step: "GENERATE_CHAPTER_OUTLINE", error: r.error };
    });
    await step.run("script", async () => ({ ok: true, step: "GENERATE_CHAPTER_SCRIPT" }));
    await step.run("dialogues", async () => ({ ok: true, step: "GENERATE_DIALOGUES" }));
    await step.run("storyboard", async () => ({ ok: true, step: "GENERATE_STORYBOARD" }));

    await step.run("da_character_canon", async () => ({ ok: true, step: "GENERATE_CHARACTER_CANON_PACK" }));
    await step.run("da_style_pack", async () => ({ ok: true, step: "GENERATE_STYLE_PACK_ASSETS" }));
    await step.run("da_expressions", async () => ({ ok: true, step: "CHARACTER_EXPRESSION_SET" }));
    await step.run("scene_draft", async () => ({ ok: true, step: "RENDER_PANEL_DRAFT" }));
    await step.run("panel_selected", async () => ({ ok: true, step: "RENDER_PANEL_FINAL" }));
    await step.run("inpaint_fix", async () => ({ ok: true, step: "IMAGE_INPAINT_FIX" }));
    await step.run("upscale", async () => ({ ok: true, step: "IMAGE_UPSCALE" }));
    await step.run("consistency_score", async () => ({ ok: true, step: "COMPUTE_CONSISTENCY_SCORE" }));
    await step.run("memory", async () => ({ ok: true, step: "UPDATE_MEMORY" }));

    return { projectId, chapterId, userId, status: "completed" };
  },
);

export const processChapterOutlineJob = inngest.createFunction(
  { id: "process-chapter-outline-job", name: "Generate chapter outline (job)" },
  { event: "chapter/outline.job.requested" },
  async ({ event, step }) => {
    const { jobId } = event.data as { jobId: string; projectId: string; chapterId: string; userId: string };
    const r = await step.run("outline-from-job", () => runChapterOutlineFromJob(jobId));
    return { jobId, ...r };
  },
);

export const functions = [generateChapterPipeline, processChapterOutlineJob];
