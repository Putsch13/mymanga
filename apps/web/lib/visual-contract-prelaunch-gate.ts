import { extractChapterVisualContractUiFromOutline } from "@manga-ai-studio/workflow";

/**
 * Avant la toute première génération (0 image), exige l’accuse de réception UI
 * du contrat visuel (`chapter.outline.chapterVisualContractUi.preLaunchAcknowledged`).
 */
export function isVisualContractPrelaunchBlocked(outline: unknown, generatedImages: number): boolean {
  if (generatedImages > 0) return false;
  const ui = extractChapterVisualContractUiFromOutline(outline);
  return ui.preLaunchAcknowledged !== true;
}
