/**
 * Extrait des répliques du chapitre précédent depuis `chapter.outline`
 * (snapshot studio `productionPlan.panelBlueprints`) pour éviter les
 * répétitions dans le dialoguiste scène (optionnel).
 */

import type { PanelBlueprintPremium } from "@manga-ai-studio/core";
import { collectDialogueSnippetsFromBlueprints, normalizeDialogueSnippet } from "@manga-ai-studio/memory";

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

  const snippets = collectDialogueSnippetsFromBlueprints(
    rawBps as Pick<
      PanelBlueprintPremium,
      "panelId" | "dialogueLines" | "textContract" | "panelTextBundle" | "narrationText" | "sfxCues"
    >[],
  );
  if (snippets.length === 0) return undefined;
  return snippets.slice(0, max);
}

/** Répliques entre guillemets dans résumé / intent (chapitre précédent sans blueprints). */
function snippetsFromQuotedPlainText(text: string, max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const re = /"([^"]{4,140})"|«\s*([^»]{4,140})\s*»/g;
  let m: RegExpExecArray | null;
  for (m = re.exec(text); m !== null; m = re.exec(text)) {
    const raw = (m[1] ?? m[2] ?? "").trim();
    if (raw.length < 4) continue;
    const n = normalizeDialogueSnippet(raw);
    if (n.length < 4 || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Blueprints du chapitre précédent, sinon répliques citées dans résumé / intent.
 */
export function extractPriorChapterDialogueSnippets(
  prev: { outline: unknown; summary: string | null; userIntent: string | null } | null | undefined,
  max = 48,
): string[] | undefined {
  if (!prev) return undefined;
  const fromBp = extractDialogueSnippetsFromChapterOutline(prev.outline, max);
  if (fromBp && fromBp.length > 0) return fromBp;
  const fromText = snippetsFromQuotedPlainText(`${prev.summary ?? ""}\n${prev.userIntent ?? ""}`, max);
  return fromText.length > 0 ? fromText : undefined;
}
