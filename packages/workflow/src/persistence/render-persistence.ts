/**
 * Persistance des résultats du render-pass v3.
 *
 * Pour le Sprint 1 on reste léger : on stocke un récap (n panels rendus /
 * failed / timings) dans `chapter.outline.renderResultV2`. Les images
 * elles-mêmes restent persistées via les mécanismes existants (sceneImage,
 * pipeline-image-persistence). Ce helper n'est qu'une couche d'audit /
 * diagnostic pour les passes QA.
 */

import { prisma } from "@manga-ai-studio/db";

const RENDER_RESULT_KEY = "renderResultV2" as const;

export interface RenderPassResultSummary {
  chapterId: string;
  totalPanels: number;
  renderedCount: number;
  failedCount: number;
  skippedCount: number;
  startedAt: string;
  finishedAt: string;
  warnings: string[];
  errors: Array<{ panelId: string; error: string }>;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function saveRenderPassResult(
  chapterId: string,
  summary: RenderPassResultSummary,
): Promise<void> {
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    select: { outline: true },
  });
  const currentOutline = isJsonObject(chapter?.outline) ? { ...chapter!.outline } : {};
  const nextOutline = {
    ...currentOutline,
    [RENDER_RESULT_KEY]: summary as unknown as Record<string, unknown>,
  };
  await prisma.chapter.update({
    where: { id: chapterId },
    data: { outline: nextOutline as never },
  });
}

export async function loadRenderPassResult(
  chapterId: string,
): Promise<RenderPassResultSummary | null> {
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    select: { outline: true },
  });
  if (!chapter || !isJsonObject(chapter.outline)) return null;
  const raw = chapter.outline[RENDER_RESULT_KEY];
  if (!isJsonObject(raw)) return null;
  return raw as unknown as RenderPassResultSummary;
}
