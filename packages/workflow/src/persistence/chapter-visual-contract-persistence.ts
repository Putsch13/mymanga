/**
 * Persistance du contrat visuel chapitre (extraction LLM + métadonnées).
 * Stocké dans `chapter.outline.chapterVisualContract` (même stratégie que storyboardPlanV2).
 */

import { prisma } from "@manga-ai-studio/db";
import type { ChapterVisualContract } from "@manga-ai-studio/ai/contracts";

export const CHAPTER_VISUAL_CONTRACT_OUTLINE_KEY = "chapterVisualContract" as const;
export const CHAPTER_VISUAL_CONTRACT_UI_OUTLINE_KEY = "chapterVisualContractUi" as const;

export type ChapterVisualContractParasitePolicy = "auto_strip" | "keep_all";

export interface ChapterVisualContractUiState {
  version?: number;
  /** Politique de fusion / sanitation des obligations « parasites » issues du plan brut. */
  parasitePolicy: ChapterVisualContractParasitePolicy;
  /** Confirmation UI avant le tout premier lancement pipeline (0 image). */
  preLaunchAcknowledged?: boolean;
  updatedAt?: string;
}

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
  const snap = raw as unknown as ChapterVisualContractSnapshot;
  const c = snap.contract;
  return {
    ...snap,
    contract: {
      ...c,
      species: Array.isArray(c.species) ? c.species : [],
      robots: Array.isArray(c.robots) ? c.robots : [],
      hybrids: Array.isArray(c.hybrids) ? c.hybrids : [],
    },
  };
}

function coerceParasitePolicy(v: unknown): ChapterVisualContractParasitePolicy {
  return v === "keep_all" ? "keep_all" : "auto_strip";
}

/**
 * Lit l’état UI du contrat visuel (politique parasites + accuse de réception pré-lancement).
 */
export function extractChapterVisualContractUiFromOutline(outline: unknown): ChapterVisualContractUiState {
  if (!isJsonObject(outline)) {
    return { version: 1, parasitePolicy: "auto_strip", preLaunchAcknowledged: false };
  }
  const raw = outline[CHAPTER_VISUAL_CONTRACT_UI_OUTLINE_KEY];
  if (!isJsonObject(raw)) {
    return { version: 1, parasitePolicy: "auto_strip", preLaunchAcknowledged: false };
  }
  return {
    version: typeof raw.version === "number" ? raw.version : 1,
    parasitePolicy: coerceParasitePolicy(raw.parasitePolicy),
    preLaunchAcknowledged: raw.preLaunchAcknowledged === true,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : undefined,
  };
}

export async function loadChapterVisualContractUi(chapterId: string): Promise<ChapterVisualContractUiState> {
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    select: { outline: true },
  });
  return extractChapterVisualContractUiFromOutline(chapter?.outline);
}

export async function saveChapterVisualContractUi(
  chapterId: string,
  patch: Partial<Pick<ChapterVisualContractUiState, "parasitePolicy" | "preLaunchAcknowledged">>,
): Promise<ChapterVisualContractUiState> {
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    select: { outline: true },
  });
  const currentOutline = isJsonObject(chapter?.outline) ? { ...chapter!.outline } : {};
  const prev = extractChapterVisualContractUiFromOutline(currentOutline);
  const next: ChapterVisualContractUiState = {
    version: 1,
    parasitePolicy: patch.parasitePolicy !== undefined ? coerceParasitePolicy(patch.parasitePolicy) : prev.parasitePolicy,
    preLaunchAcknowledged:
      patch.preLaunchAcknowledged !== undefined ? patch.preLaunchAcknowledged === true : prev.preLaunchAcknowledged,
    updatedAt: new Date().toISOString(),
  };
  const nextOutline = {
    ...currentOutline,
    [CHAPTER_VISUAL_CONTRACT_UI_OUTLINE_KEY]: next as unknown as Record<string, unknown>,
  };
  await prisma.chapter.update({
    where: { id: chapterId },
    data: { outline: nextOutline as never },
  });
  return next;
}
