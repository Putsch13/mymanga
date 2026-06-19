/**
 * Persistance du StoryboardPlan v3.
 *
 * Stratégie Sprint 1 : persister dans `chapter.outline.storyboardPlanV2`.
 * Cette clé est aussi lue côté reader (build-reader-pages.ts) pour
 * shortcircuit la repagination legacy.
 */

import { prisma } from "@manga-ai-studio/db";
import type { StoryboardPlan } from "@manga-ai-studio/ai";

const STORYBOARD_PLAN_KEY = "storyboardPlanV2" as const;

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function saveStoryboardPlan(
  chapterId: string,
  plan: StoryboardPlan,
): Promise<void> {
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    select: { outline: true },
  });
  const currentOutline = isJsonObject(chapter?.outline) ? { ...chapter!.outline } : {};
  const nextOutline = {
    ...currentOutline,
    [STORYBOARD_PLAN_KEY]: plan as unknown as Record<string, unknown>,
  };
  await prisma.chapter.update({
    where: { id: chapterId },
    data: { outline: nextOutline as never },
  });
}

export async function loadStoryboardPlan(chapterId: string): Promise<StoryboardPlan | null> {
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    select: { outline: true },
  });
  if (!chapter || !isJsonObject(chapter.outline)) return null;
  const raw = chapter.outline[STORYBOARD_PLAN_KEY];
  if (!isJsonObject(raw)) return null;
  return raw as unknown as StoryboardPlan;
}

export function extractStoryboardPlanFromOutline(outline: unknown): StoryboardPlan | null {
  if (!isJsonObject(outline)) return null;
  const raw = outline[STORYBOARD_PLAN_KEY];
  if (!isJsonObject(raw)) return null;
  return raw as unknown as StoryboardPlan;
}

export const STORYBOARD_PLAN_OUTLINE_KEY = STORYBOARD_PLAN_KEY;
