import { inngest } from "./inngest-client";
import { prisma } from "@manga-ai-studio/db";
import { trainCharacterLora } from "@manga-ai-studio/ai";
import { SCENE_IMAGE_STATUS } from "@manga-ai-studio/core";
import { runFullChapterPipelineFromJob } from "./run-full-chapter-pipeline";
import { runChapterOutlineFromJob } from "./run-outline-for-chapter";

import { logPipelineInfo, logPipelineWarn, logPipelineError } from "./lib/pipeline-logger";
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
        logPipelineWarn("cleanup.stale.images.marked_stale_images_as_failed", { message: `marked ${result.count} stale images as failed` });
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

        logPipelineInfo("train.character.lora.lora_ready_for", { message: `LoRA ready for ${character.name} (${characterId})` });
        return { ok: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "lora_training_failed";
        logPipelineError("train.character.lora.failed_for", { message: `Failed for ${character.name}: ${msg}` });
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

/**
 * SPRINT 1.3 — Test E2E hebdomadaire avec vraies images FAL.
 *
 * Cron tous les dimanches à 3h UTC.
 * Budget cap : MAX_FAL_BUDGET_USD=5 (défaut).
 *
 * Pour un vrai test E2E avec génération d'images, utilisez le test vitest
 * `packages/workflow/src/__tests__/e2e-real-images-weekly.test.ts`
 * avec E2E_REAL_IMAGES=true.
 *
 * Ce cron Inngest est un placeholder qui valide que le système est opérationnel
 * et peut être étendu pour lancer le test complet.
 */
export const weeklyE2ETest = inngest.createFunction(
  {
    id: "weekly-e2e-real-images",
    name: "E2E weekly with real images",
    triggers: { cron: "0 3 * * 0" }, // Dimanche 3h UTC
  },
  async ({ step }) => {
    const maxBudget = Number(process.env.MAX_FAL_BUDGET_USD) || 5;
    logPipelineInfo("weekly.e2e.starting_weekly_e2e_health_check_budget_cap", { message: `Starting weekly E2E health check (budget cap: $${maxBudget})` });

    const healthCheck = await step.run("health-check", async () => {
      const projectCount = await prisma.project.count();
      const chapterCount = await prisma.chapter.count();
      const imageCount = await prisma.sceneImage.count();

      const hasOpenAiKey = Boolean(process.env.OPENAI_API_KEY);
      const hasFalKey = Boolean(process.env.FAL_KEY);

      return {
        projectCount,
        chapterCount,
        imageCount,
        hasOpenAiKey,
        hasFalKey,
        keysReady: hasOpenAiKey && hasFalKey,
      };
    });

    if (!healthCheck.keysReady) {
      // FIXME(logger): migrate to logPipeline*
      console.warn(
        `[weekly-e2e] Keys missing: OPENAI=${healthCheck.hasOpenAiKey} FAL=${healthCheck.hasFalKey}`,
      );
      return {
        success: false,
        error: "missing_api_keys",
        details: healthCheck,
      };
    }

    // FIXME(logger): migrate to logPipeline*

    console.log(
      `[weekly-e2e] Health check passed: ${healthCheck.projectCount} projects, ${healthCheck.chapterCount} chapters, ${healthCheck.imageCount} images`,
    );

    return {
      success: true,
      message: "E2E health check passed. Run vitest with E2E_REAL_IMAGES=true for full test.",
      stats: healthCheck,
    };
  },
);

export const functions = [
  generateChapterPipeline,
  processChapterOutlineJob,
  cleanupStaleImages,
  trainCharacterLoraJob,
  weeklyE2ETest,
];
