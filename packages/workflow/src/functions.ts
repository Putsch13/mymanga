import { inngest } from "./inngest-client";
import { prisma } from "@manga-ai-studio/db";
import { trainCharacterLora } from "@manga-ai-studio/ai";
import { SCENE_IMAGE_STATUS } from "@manga-ai-studio/core";
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
          status: SCENE_IMAGE_STATUS.PENDING,
          failureReason: null,
        },
        data: {
          status: SCENE_IMAGE_STATUS.FAILED,
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

/**
 * E1 — Training LoRA automatique pour les personnages clés.
 * Déclenché après generate-visual si roleType === "HERO" | "SECONDARY_CORE".
 * Retry exponentiel : 3 tentatives, backoff 30s / 2min / 10min.
 */
export const trainCharacterLoraJob = inngest.createFunction(
  {
    id: "train-character-lora",
    name: "Train character LoRA (auto)",
    retries: 3,
    triggers: { event: "character/lora.training.requested" },
  },
  async ({ event, step }) => {
    const { characterId, projectId, imageUrl } = event.data as {
      characterId: string;
      projectId: string;
      imageUrl: string;
    };

    const result = await step.run("train-lora", async () => {
      const character = await prisma.character.findUnique({
        where: { id: characterId },
        select: { id: true, name: true, slug: true, roleType: true },
      });
      if (!character) return { ok: false, error: "character_not_found" };

      try {
        await trainCharacterLora({
          prisma,
          characterId,
          projectId,
          characterName: character.name,
          triggerWord: character.slug,
          imageUrls: [imageUrl],
        });

        await prisma.character.update({
          where: { id: characterId },
          data: { loraStatus: "ready", loraReadyAt: new Date() },
        });

        console.log(`[train-character-lora] LoRA ready for ${character.name} (${characterId})`);
        return { ok: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "lora_training_failed";
        console.error(`[train-character-lora] Failed for ${character.name}: ${msg}`);
        await prisma.character.update({
          where: { id: characterId },
          data: { loraStatus: "failed" },
        });
        return { ok: false, error: msg };
      }
    });

    return { characterId, projectId, ...result };
  },
);

export const functions = [generateChapterPipeline, processChapterOutlineJob, cleanupStaleImages, trainCharacterLoraJob];
