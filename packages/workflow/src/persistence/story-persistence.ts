/**
 * Persistance du StoryArc v3.
 *
 * Stratégie Sprint 1 (non destructive) : on persiste dans `chapter.outline`
 * sous la clé `storyArcV2`, pour éviter une migration DB lourde au démarrage
 * du refactor. Une migration dédiée (colonne `storyArc Json`) sera faite
 * dans un sprint ultérieur.
 */

import { prisma } from "@manga-ai-studio/db";
import type { StoryArc } from "@manga-ai-studio/ai";

const STORY_ARC_KEY = "storyArcV2" as const;

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function saveStoryArc(chapterId: string, storyArc: StoryArc): Promise<void> {
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    select: { outline: true },
  });
  const currentOutline = isJsonObject(chapter?.outline) ? { ...chapter!.outline } : {};
  const nextOutline = {
    ...currentOutline,
    [STORY_ARC_KEY]: storyArc as unknown as Record<string, unknown>,
  };
  await prisma.chapter.update({
    where: { id: chapterId },
    data: { outline: nextOutline as never },
  });
}

export async function loadStoryArc(chapterId: string): Promise<StoryArc | null> {
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    select: { outline: true },
  });
  if (!chapter || !isJsonObject(chapter.outline)) return null;
  const raw = chapter.outline[STORY_ARC_KEY];
  if (!isJsonObject(raw)) return null;
  return raw as unknown as StoryArc;
}

export function extractStoryArcFromOutline(outline: unknown): StoryArc | null {
  if (!isJsonObject(outline)) return null;
  const raw = outline[STORY_ARC_KEY];
  if (!isJsonObject(raw)) return null;
  return raw as unknown as StoryArc;
}
