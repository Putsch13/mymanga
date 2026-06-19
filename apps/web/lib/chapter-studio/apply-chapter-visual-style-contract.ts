/**
 * P0.10 — Projette `chapterVisualStyleContract` vers `chapterLookProfile`
 * (compat pipeline / prompts existants).
 */
import type {
  ChapterLookProfileStudio,
  ChapterStudioData,
  ChapterVisualStyleContract,
} from "@manga-ai-studio/core";

export function mergeVisualStyleContractIntoLookProfile(
  style: ChapterVisualStyleContract,
  existing: ChapterLookProfileStudio | undefined,
): ChapterLookProfileStudio {
  const mode = style.colorMode === "bw" ? "premium_manga_bw" : "premium_manga_color";
  const base = existing ?? {
    mode,
    incompatibleFamilies: [] as string[],
    providerCapabilityRequired: [] as string[],
  };
  const mergedForbidden = Array.from(
    new Set([...(base.incompatibleFamilies ?? []), ...style.forbiddenVisualDrift]),
  );
  return {
    ...base,
    mode,
    styleFamily: style.styleGenre ?? base.styleFamily ?? null,
    lineStyle: style.inkingStyle ?? base.lineStyle ?? null,
    incompatibleFamilies: mergedForbidden,
  };
}

export function applyChapterVisualStyleToDraft(draft: ChapterStudioData): ChapterStudioData {
  const v = draft.chapterVisualStyleContract;
  if (!v) return draft;
  const chapterLookProfile = mergeVisualStyleContractIntoLookProfile(v, draft.chapterLookProfile);
  return { ...draft, chapterLookProfile };
}
