import { inngest } from "./inngest-client";

export type ChapterGeneratePayload = {
  jobId: string;
  projectId: string;
  chapterId: string;
  userId: string;
};

export type ChapterOutlineJobPayload = {
  jobId: string;
  projectId: string;
  chapterId: string;
  userId: string;
};

/**
 * Déclenche le pipeline manga-first sur Inngest Cloud (nécessite INNGEST_EVENT_KEY en prod).
 */
export async function sendChapterGenerateRequested(payload: ChapterGeneratePayload): Promise<{ ok: boolean; skipped?: string }> {
  if (!process.env.INNGEST_EVENT_KEY) {
    return { ok: false, skipped: "INNGEST_EVENT_KEY manquant" };
  }
  await inngest.send({
    name: "chapter/generate.requested",
    data: payload,
  });
  return { ok: true };
}

/**
 * Traitement asynchrone du job `GENERATE_CHAPTER_OUTLINE` (suite chapitre ou worker dédié).
 */
export async function sendChapterOutlineJobRequested(
  payload: ChapterOutlineJobPayload,
): Promise<{ ok: boolean; skipped?: string }> {
  if (!process.env.INNGEST_EVENT_KEY) {
    return { ok: false, skipped: "INNGEST_EVENT_KEY manquant" };
  }
  await inngest.send({
    name: "chapter/outline.job.requested",
    data: payload,
  });
  return { ok: true };
}

// E1 — LoRA auto-training
export type CharacterLoraTrainingPayload = {
  characterId: string;
  projectId: string;
  imageUrl: string;
};

/**
 * Déclenche le training LoRA automatique pour un personnage clé.
 * Appelé après generate-visual si roleType === "HERO" | "SECONDARY_CORE".
 */
export async function sendCharacterLoraTrainingRequested(
  payload: CharacterLoraTrainingPayload,
): Promise<{ ok: boolean; skipped?: string }> {
  if (!process.env.INNGEST_EVENT_KEY) {
    return { ok: false, skipped: "INNGEST_EVENT_KEY manquant" };
  }
  await inngest.send({
    name: "character/lora.training.requested",
    data: payload,
  });
  return { ok: true };
}
