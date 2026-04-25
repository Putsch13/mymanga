/**
 * Extrait des répliques du chapitre précédent depuis `chapter.outline`
 * (snapshot studio `productionPlan.panelBlueprints`) pour éviter les
 * répétitions dans le dialoguiste scène (optionnel).
 */

import type { PanelBlueprintPremium } from "@manga-ai-studio/core";
import { collectDialogueSnippetsFromBlueprints } from "@manga-ai-studio/memory";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/**
 * Retourne `undefined` si aucun blueprint exploitable.
 */
export function extractDialogueSnippetsFromChapterOutline(
  chapterOutline: unknown,
  max = 48,
): string[] | undefined {
  const root = asRecord(chapterOutline);
  if (!root) return undefined;

  const studio = asRecord(root.studio);
  const studioData = studio && "data" in studio ? asRecord(studio.data) : null;
  const planFromStudio = studioData ? asRecord(studioData.productionPlan) : null;
  const planTop = asRecord(root.productionPlan);
  const plan = planFromStudio ?? planTop;
  const rawBps = plan?.panelBlueprints;
  if (!Array.isArray(rawBps) || rawBps.length === 0) return undefined;

  const snippets = collectDialogueSnippetsFromBlueprints(rawBps as Pick<PanelBlueprintPremium, "dialogueLines">[]);
  if (snippets.length === 0) return undefined;
  return snippets.slice(0, max);
}
