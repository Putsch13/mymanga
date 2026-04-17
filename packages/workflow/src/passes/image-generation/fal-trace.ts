/**
 * Image generation pass — helper pour persister les traces d'appels Fal.
 *
 * Extrait de image-generation-pass.ts. Simple enveloppe autour de prisma.falTrace.create
 * qui sérialise/typecheck les payloads JSON.
 */

import { prisma, type Prisma } from "@manga-ai-studio/db";

export interface FalTraceInput {
  projectId: string;
  chapterId: string;
  sceneId: string;
  panelId?: string;
  sceneKeyframeId?: string;
  characterId?: string | null;
  provider: string;
  model: string;
  mode: "text2img" | "img2img" | "lora_training";
  status: "completed" | "failed";
  requestId?: string | null;
  jobId?: string | null;
  requestPayload: Record<string, unknown>;
  responsePayload: unknown;
  refsUsed?: string[];
  lorasUsed?: Array<{ url: string; triggerWord: string; scale?: number }>;
  timings?: Record<string, unknown>;
  error?: Record<string, unknown> | null;
}

export async function persistFalTrace(input: FalTraceInput) {
  return prisma.falTrace.create({
    data: {
      projectId: input.projectId,
      chapterId: input.chapterId,
      sceneId: input.sceneId,
      panelId: input.panelId ?? null,
      sceneKeyframeId: input.sceneKeyframeId ?? null,
      characterId: input.characterId ?? null,
      provider: input.provider,
      model: input.model,
      mode: input.mode,
      status: input.status,
      requestId: input.requestId ?? null,
      jobId: input.jobId ?? null,
      requestPayload: input.requestPayload as Prisma.InputJsonValue,
      responsePayload: (input.responsePayload ?? {}) as Prisma.InputJsonValue,
      refsUsed: (input.refsUsed ?? []) as Prisma.InputJsonValue,
      lorasUsed: (input.lorasUsed ?? []) as Prisma.InputJsonValue,
      timings: (input.timings ?? {}) as Prisma.InputJsonValue,
      error: input.error ? (input.error as Prisma.InputJsonValue) : undefined,
    },
  });
}
