/**
 * Persistance du contrat visuel chapitre (extraction LLM + métadonnées).
 * Stocké dans `chapter.outline.chapterVisualContract` (même stratégie que storyboardPlanV2).
 */

import { prisma } from "@manga-ai-studio/db";
import type { ChapterVisualContract } from "@manga-ai-studio/ai/contracts";

export const CHAPTER_VISUAL_CONTRACT_OUTLINE_KEY = "chapterVisualContract" as const;

export type ChapterVisualContractSnapshot = {
  version: 1;
  extractedAt: string;
  usedOpenAI: boolean;
  warnings: string[];
  contract: ChapterVisualContract;
  requiredFromContractCount: number;
};

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function saveChapterVisualContractSnapshot(
  chapterId: string,
  snapshot: Omit<ChapterVisualContractSnapshot, "version" | "extractedAt"> & {
    extractedAt?: string;
  },
): Promise<void> {
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    select: { outline: true },
  });
  const currentOutline = isJsonObject(chapter?.outline) ? { ...chapter!.outline } : {};
  const full: ChapterVisualContractSnapshot = {
    version: 1,
    extractedAt: snapshot.extractedAt ?? new Date().toISOString(),
    usedOpenAI: snapshot.usedOpenAI,
    warnings: snapshot.warnings,
    contract: snapshot.contract,
    requiredFromContractCount: snapshot.requiredFromContractCount,
  };
  const nextOutline = {
    ...currentOutline,
    [CHAPTER_VISUAL_CONTRACT_OUTLINE_KEY]: full as unknown as Record<string, unknown>,
  };
  await prisma.chapter.update({
    where: { id: chapterId },
    data: { outline: nextOutline as never },
  });
}

export function extractChapterVisualContractFromOutline(outline: unknown): ChapterVisualContractSnapshot | null {
  if (!isJsonObject(outline)) return null;
  const raw = outline[CHAPTER_VISUAL_CONTRACT_OUTLINE_KEY];
  if (!isJsonObject(raw)) return null;
  if (raw.version !== 1) return null;
  return raw as unknown as ChapterVisualContractSnapshot;
}
