/**
 * Évite que plusieurs cases du même beat réutilisent exactement le même
 * bloc de narration auto-rempli (copie brute du résumé de beat).
 */

import type { PanelBlueprintPremium } from "@manga-ai-studio/core";

function splitSentences(text: string): string[] {
  const t = text.trim();
  if (!t) return [];
  const parts = t.split(/(?<=[.!?…])\s+/u).map((s) => s.trim()).filter((s) => s.length > 0);
  return parts.length > 0 ? parts : [t];
}

function syncBundleNarration(bp: PanelBlueprintPremium): void {
  if (!bp.narrationText) return;
  bp.panelTextBundle = {
    ...(bp.panelTextBundle ?? {}),
    narration: bp.narrationText,
  };
}

/**
 * Pour chaque beat, si plusieurs panels partagent la même `narrationText`,
 * distribue les phrases ou ajoute une micro-distinction issue du `purpose`.
 */
export function applyPanelNarrativeVariationToBlueprints(
  blueprints: PanelBlueprintPremium[],
): { panelsAdjusted: number } {
  let panelsAdjusted = 0;
  const byBeat = new Map<string, PanelBlueprintPremium[]>();
  for (const bp of blueprints) {
    const arr = byBeat.get(bp.beatId) ?? [];
    arr.push(bp);
    byBeat.set(bp.beatId, arr);
  }

  for (const panels of byBeat.values()) {
    const withNarration = panels.filter(
      (p) => typeof p.narrationText === "string" && p.narrationText.trim().length > 0,
    );
    const byText = new Map<string, PanelBlueprintPremium[]>();
    for (const p of withNarration) {
      const key = p.narrationText!.trim();
      const arr = byText.get(key) ?? [];
      arr.push(p);
      byText.set(key, arr);
    }

    for (const group of byText.values()) {
      if (group.length < 2) continue;
      const base = group[0]!.narrationText!.trim();
      const sentences = splitSentences(base);

      for (let idx = 1; idx < group.length; idx++) {
        const p = group[idx]!;
        if (sentences.length > idx) {
          p.narrationText = sentences[idx]!;
        } else {
          const hint = p.purpose.trim().slice(0, 72);
          const head = sentences[0] ?? base;
          p.narrationText = hint.length > 8 ? `${head} ${hint}` : `${head} (${idx + 1})`;
        }
        syncBundleNarration(p);
        p.notes = [...(p.notes ?? []), "narrative_variation_dedupe"];
        panelsAdjusted += 1;
      }
    }
  }

  return { panelsAdjusted };
}
